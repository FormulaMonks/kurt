import { expect } from "@jest/globals"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { OpenAI as RealOpenAI } from "openai"
import {
  Kurt,
  type KurtStream,
  type KurtStreamEvent,
} from "@formula-monks/kurt"
import type {
  OpenAI,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIResponseChunk,
} from "../src/OpenAI.types"
import { KurtOpenAI } from "../src/KurtOpenAI"

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
  // Here's the data structure we will use to snapshot a request/response cycle.
  const snapshot: {
    step1Request?: OpenAIRequest
    step2RawChunks: OpenAIResponseChunk["choices"][number][]
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

  // Create a fake OpenAI instance that captures the request and response,
  // and will only delegate to "real OpenAI" if there is no saved snapshot.
  const openAI = {
    chat: {
      completions: {
        async create(request: OpenAIRequest): OpenAIResponse {
          snapshot.step1Request = request

          // If we have a saved snapshot, use it as a mock API.
          if (savedSnapshot?.step2RawChunks) {
            const savedRawChunks = savedSnapshot.step2RawChunks
            snapshot.step2RawChunks = savedRawChunks
            async function* generator(): AsyncIterable<OpenAIResponseChunk> {
              for await (const rawChunk of savedRawChunks) {
                yield { choices: [rawChunk] }
              }
            }
            return generator()
          }

          // Otherwise, use the real API (and capture the raw chunks to save).
          const realOpenAI = new RealOpenAI()
          const response = await realOpenAI.chat.completions.create(request)
          async function* gen() {
            for await (const rawEvent of response) {
              const choice = rawEvent.choices[0]
              if (choice) snapshot.step2RawChunks.push(choice)

              // Yield the raw event to the adapter.
              yield rawEvent
            }
          }
          return gen()
        },
      },
    },
  } as unknown as OpenAI

  // Run the test case function with a new instance of Kurt.
  const kurt = new Kurt(new KurtOpenAI({ openAI, model: "gpt-3.5-turbo-0125" }))
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
