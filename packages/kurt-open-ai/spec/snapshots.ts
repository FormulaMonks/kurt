import { expect } from "@jest/globals"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { BadRequestError, OpenAI as RealOpenAI } from "openai"
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
import { KurtOpenAI, type KurtOpenAISupportedModel } from "../src"
import type { ResponseStreamEvent } from "openai/resources/responses/responses"
import type { Stream } from "openai/streaming"

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

function createConcreteErrorType(error?: Error) {
  if (!error) return error
  const badRequestError = error as BadRequestError
  if (badRequestError.type === "invalid_request_error") {
    return new BadRequestError(
      400,
      badRequestError.error,
      badRequestError.message,
      badRequestError.headers
    )
  }
  return error
}

export async function snapshotAndMock<T>(
  model: KurtOpenAISupportedModel,
  testCaseFn: (kurt: Kurt) => KurtStream<T>
) {
  // Here's the data structure we will use to snapshot a request/response cycle.
  const snapshot: {
    step1Request?: OpenAIRequest
    step1Error?: Error
    step2RawChunks: OpenAIResponseChunk[]
    step3KurtEvents: KurtStreamEvent<T>[]
  } = {
    step1Request: undefined,
    step1Error: undefined,
    step2RawChunks: [],
    step3KurtEvents: [],
  }

  // Load the saved snapshot for this test, if we have one.
  const snapshotFilename = snapshotFilenameFor(
    expect.getState().currentTestName
  )
  const savedSnapshot = loadYaml(snapshotFilename) as Required<typeof snapshot>
  if (savedSnapshot) {
    const concreteError = createConcreteErrorType(savedSnapshot.step1Error)
    if (concreteError) savedSnapshot.step1Error = concreteError
  }

  // Create a fake OpenAI instance that captures the request and response,
  // and will only delegate to "real OpenAI" if there is no saved snapshot.
  const openAI = {
    responses: {
      async create(request: OpenAIRequest): OpenAIResponse {
        snapshot.step1Request = request
        if (savedSnapshot?.step1Error) {
          snapshot.step1Error = savedSnapshot.step1Error
          throw savedSnapshot.step1Error
        }
        // If we have a saved snapshot, use it as a mock API.
        if (savedSnapshot?.step2RawChunks) {
          const savedRawChunks = savedSnapshot.step2RawChunks
          snapshot.step2RawChunks = savedRawChunks

          // @ts-ignore
          async function* generator(): AsyncIterable<OpenAIResponseChunk> {
            for await (const rawChunk of savedRawChunks) {
              yield rawChunk
            }
          }

          return generator()
        }

        // Otherwise, use the real API (and capture the raw chunks to save).
        const realOpenAI = new RealOpenAI()

        let response: Stream<ResponseStreamEvent>

        try {
          response = await realOpenAI.responses.create(request)
        } catch (e) {
          if (e instanceof Error) snapshot.step1Error = e
          throw e
        }

        async function* gen() {
          for await (const rawChunk of response) {
            // Snapshot the parts we care about from the raw chunk.
            snapshot.step2RawChunks.push(rawChunk)

            // Yield the raw chunk to the adapter.
            yield rawChunk
          }
        }

        return gen()
      },
    },
  } as unknown as OpenAI

  // Run the test case function with a new instance of Kurt.
  const kurt = new Kurt(new KurtOpenAI({ openAI, model }))
  const stream = testCaseFn(kurt)

  // Save the final stream of Kurt events.
  try {
    for await (const event of stream) snapshot.step3KurtEvents.push(event)
  } finally {
    if (savedSnapshot) {
      // If we had a saved snapshot, our new snapshot should match.
      expect(stringifyYaml(snapshot)).toEqual(stringifyYaml(savedSnapshot))
    } else {
      // Otherwise, we need to save the snapshot, and we'll warn about it,
      // because it's not a truly passing test yet.
      console.warn(`Writing new snapshot to ${snapshotFilename}`)
      dumpYaml(snapshotFilename, snapshot)
    }
  }

  // Return the KurtStream in case the caller wants to do additional assertions.
  return await stream.result
}

export async function snapshotAndMockWithError<T>(
  model: KurtOpenAISupportedModel,
  testCaseFn: (kurt: Kurt) => KurtStream<T>,
  errorCheckFn: (error: Error) => void
) {
  try {
    await snapshotAndMock(model, testCaseFn)
    expectedErrorToBeThrownBeforeThisPoint()
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error &&
      error.constructor.name.includes("Jest")
    )
      throw error

    expect(error).toBeInstanceOf(Error)
    errorCheckFn(error as Error)
  }
}

function expectedErrorToBeThrownBeforeThisPoint() {
  const expected = "error to be thrown"
  const actual = "no error was thrown"
  expect(actual).toBe(expected)
}
