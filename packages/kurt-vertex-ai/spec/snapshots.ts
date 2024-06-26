import { expect } from "@jest/globals"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { VertexAI as RealVertexAI } from "@google-cloud/vertexai"
import {
  Kurt,
  type KurtStream,
  type KurtStreamEvent,
} from "@formula-monks/kurt"
import type {
  VertexAI,
  VertexAIGenerativeModel,
  VertexAIRequest,
  VertexAIResponse,
  VertexAIResponseChunk,
  VertexAIResponseChunkCandidate,
} from "../src/VertexAI.types"
import { KurtVertexAI } from "../src/KurtVertexAI"

function requiredEnvVar(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function snapshotFilenameFor(testName: string | undefined) {
  return `${__dirname}/snapshots/${testName?.replace(/ /g, "_")}.yaml`
}

function loadYaml(filename: string) {
  if (!existsSync(filename)) return undefined
  return parseYaml(readFileSync(filename, "utf-8"))
}

function dumpYaml(filename: string, data: object) {
  writeFileSync(filename, stringifyYaml(data))
}

export async function snapshotAndMock<T>(
  testCaseFn: (kurt: Kurt) => KurtStream<T>
) {
  const model = "gemini-1.5-pro"

  // Here's the data structure we will use to snapshot a request/response cycle.
  const snapshot: {
    step1Request?: VertexAIRequest
    step2RawChunks: VertexAIResponseChunk[]
    step3KurtEvents: KurtStreamEvent<T>[]
  } = {
    step1Request: undefined,
    step2RawChunks: [],
    step3KurtEvents: [],
  }

  // Load the saved snapshot for this test, if we have one.
  const snapshotFilename = snapshotFilenameFor(
    expect.getState().currentTestName
  )
  const savedSnapshot = loadYaml(snapshotFilename) as Required<typeof snapshot>

  // Create a fake VertexAI instance that captures the request and response,
  // and will only delegate to "real VertexAI" if there is no saved snapshot.
  const vertexAI = {
    getGenerativeModel(...args: unknown[]) {
      return {
        generateContentStreamPATCHED(
          request: VertexAIRequest
        ): VertexAIResponse {
          return (async () => {
            snapshot.step1Request = request

            // If we have a saved snapshot, use it as a mock API.
            if (savedSnapshot?.step2RawChunks) {
              const savedRawChunks = savedSnapshot.step2RawChunks
              snapshot.step2RawChunks = savedRawChunks
              async function* generator(): AsyncIterable<VertexAIResponseChunk> {
                for await (const rawChunk of savedRawChunks) {
                  yield rawChunk
                }
              }
              return { stream: generator() }
            }

            // Otherwise, use the real API (and capture the raw chunks to save).
            const realVertexAI = new RealVertexAI({
              project: requiredEnvVar("VERTEX_AI_PROJECT"),
              location: requiredEnvVar("VERTEX_AI_LOCATION"),
            })
            const generativeModel = realVertexAI.getGenerativeModel({
              model,
            }) as VertexAIGenerativeModel
            const response =
              await generativeModel.generateContentStreamPATCHED(request)
            async function* gen() {
              for await (const rawEvent of response.stream) {
                const candidate = rawEvent.candidates?.at(0)
                if (candidate) {
                  const partialCandidate = { ...candidate }
                  // biome-ignore lint/performance/noDelete: we don't care about performance in this test code
                  delete partialCandidate.safetyRatings

                  const rawChunk = {
                    candidates: [partialCandidate],
                    usageMetadata: rawEvent.usageMetadata,
                  }
                  snapshot.step2RawChunks.push(rawChunk)
                }

                // Yield the raw event to the adapter.
                yield rawEvent
              }
            }
            return { stream: gen() }
          })()
        },
      }
    },
  } as unknown as VertexAI

  // Run the test case function with a new instance of Kurt.
  const kurt = new Kurt(new KurtVertexAI({ vertexAI, model }))
  const stream = testCaseFn(kurt)

  // Save the final stream of Kurt events.
  for await (const event of stream) snapshot.step3KurtEvents.push(event)

  if (savedSnapshot) {
    // If we had a saved snapshot, our new snapshot should match.
    expect(stringifyYaml(snapshot)).toEqual(stringifyYaml(savedSnapshot))
  } else {
    // Otherwise, we need to save the snapshot, and we'll warn about it,
    // because it's not a truly passing test yet.
    console.warn(`Writing new snapshot to ${snapshotFilename}`)
    dumpYaml(snapshotFilename, snapshot)
  }

  // Return the KurtStream in case the caller wants to do additional assertions.
  return await stream.result
}
