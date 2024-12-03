import { describe, test, expect } from "@jest/globals"
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
} from "node:fs"
import { randomBytes } from "node:crypto"
import {
  Kurt,
  type KurtAdapterV1,
  type KurtMessage,
  type KurtSamplingOptions,
  type KurtSchema,
  type KurtSchemaInner,
  type KurtSchemaInnerMap,
  type KurtSchemaMap,
  type KurtSchemaMapSingleResult,
  type KurtSchemaResult,
  type KurtStreamEvent,
} from "@formula-monks/kurt"
import { KurtCache } from "../src"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { NonEmptyTuple } from "type-fest"

// Define the cache directories that will be used by this test.
const cacheDir = `${__dirname}/../.kurt-cache/test`
const cacheDirRetain = `${cacheDir}-retain`

// A convenience function to make the test cases succinct one-liners.
const gen = async (kurt: Kurt, prompt: string) =>
  (await kurt.generateNaturalLanguage({ prompt }).result).text

describe("KurtCache", () => {
  test("when cache misses, runs the adapter setup fn just once", async () => {
    // Remove the cache dir first, to demonstrate that the cache dir will be
    // automatically created by the KurtCache adapter.
    if (existsSync(cacheDir)) rmdirSync(cacheDir, { recursive: true })

    // Use a random string to ensure an initial cache miss for this test run.
    const random = randomBytes(8).toString("hex")

    // Use the cache adapter configured appropriately to find the cache entry.
    let adapterFnCallCount = 0
    const kurt = new Kurt(
      new KurtCache(cacheDir, "stub", () => {
        adapterFnCallCount++
        return new StubAdapter([
          ["World ", random],
          ["bar ", random],
          ["never ", random],
        ])
      })
    )

    // Expect the canned responses from the stub adapter to be returned,
    // with cache misses on the first call for each prompt, but with
    // cache hits on subsequent calls using a prior prompt.
    expect(await gen(kurt, `Hello ${random}`)).toEqual(`World ${random}`)
    expect(await gen(kurt, `foo ${random}`)).toEqual(`bar ${random}`)
    expect(await gen(kurt, `Hello ${random}`)).toEqual(`World ${random}`)
    expect(await gen(kurt, `foo ${random}`)).toEqual(`bar ${random}`)
    expect(await gen(kurt, `foo ${random}`)).toEqual(`bar ${random}`)

    // Expect that the adapter setup function was called just once.
    expect(adapterFnCallCount).toEqual(1)

    // Expect that the cache dir contains exactly two files.
    expect(readdirSync(cacheDir)).toHaveLength(2)
  })

  test("when cache hits, works without running the adapter fn", async () => {
    // We compare with a hard-coded hash here to test that the hash function is
    // stable/deterministic across library versions of KurtCache.
    //
    // If you find yourself needing to change this hash value, it means
    // that you're breaking all existing cache entries, which is a breaking
    // change for users of KurtCache who rely on it for their test suites.
    const hash =
      "ad557ba1818e8013f9e2fbc9598c034e263c96c5fe7edd491e75be8ce450f5c9"
    const filePath = `${cacheDirRetain}/stub-${hash}.yaml`

    // Assert that the cache file entry already exists (it has been
    // committed into the repo and retained there)
    const cached = readFileSync(filePath, "utf8")
    expect(cached).toContain("text: This was cached on disk")

    // Use the cache adapter configured appropriately to find the cache entry.
    let adapterFnCallCount = 0
    const kurt = new Kurt(
      new KurtCache(cacheDirRetain, "stub", () => {
        adapterFnCallCount++
        return new StubAdapter([["This was cached", " on disk"]])
      })
    )

    // Expect the cache hit to return the result text from the file.
    expect(await gen(kurt, "Was this cached?")).toEqual(
      "This was cached on disk"
    )

    // Expect that the adapter setup function was never called.
    expect(adapterFnCallCount).toEqual(0)

    // Expect that the cache file entry was not modified.
    expect(readFileSync(filePath, "utf8")).toEqual(cached)

    // Delete the cache file and prove that it regenerates exactly the same.
    rmSync(filePath)
    expect(await gen(kurt, "Was this cached?")).toEqual(
      "This was cached on disk"
    )
    expect(adapterFnCallCount).toEqual(1)
    expect(readFileSync(filePath, "utf8")).toEqual(cached)
  })
})

class StubAdapter
  implements
    KurtAdapterV1<{
      rawMessage: { bytes: string }
      rawSchema: ReturnType<typeof zodToJsonSchema>
      rawTool: {
        name: string
        desc: string
        schema: ReturnType<typeof zodToJsonSchema>
      }
      rawEvent: { bytes: string }
    }>
{
  constructor(readonly cannedResponses: NonEmptyTuple<NonEmptyTuple<string>>) {}

  /**
   * Rotate through the canned responses, returning the next one each time.
   */
  private nextCannedResponseIndex = 0
  private nextCannedResponse() {
    let cannedResponse = this.cannedResponses[this.nextCannedResponseIndex]
    if (cannedResponse === undefined) {
      cannedResponse = this.cannedResponses[0]
      this.nextCannedResponseIndex = 0
    }

    this.nextCannedResponseIndex++
    return cannedResponse
  }

  kurtAdapterVersion = "v1" as const

  transformToRawMessages(messages: KurtMessage[]) {
    return messages.map((message) => ({
      bytes: message.text ?? JSON.stringify(message),
    }))
  }

  transformToRawSchema<I extends KurtSchemaInner>(schema: KurtSchema<I>) {
    return zodToJsonSchema(schema)
  }

  transformToRawTool(tool: {
    name: string
    description: string
    parameters: ReturnType<typeof zodToJsonSchema>
  }) {
    return {
      name: tool.name,
      desc: tool.description,
      schema: tool.parameters,
    }
  }

  async *generateRawEvents(options: {
    messages: { bytes: string }[]
    sampling: Required<KurtSamplingOptions>
    tools: {
      [key: string]: {
        name: string
        desc: string
        schema: ReturnType<typeof zodToJsonSchema>
      }
    }
    forceTool?: string
  }) {
    for (const bytes of this.nextCannedResponse()) {
      yield { bytes }
    }
  }

  async *transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<{ bytes: string }>
  ): AsyncIterable<KurtStreamEvent<undefined>> {
    let text = ""
    for await (const { bytes } of rawEvents) {
      text += bytes
      yield { chunk: bytes }
    }
    yield { finished: true, text, data: undefined }
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<{ bytes: string }>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    throw new Error("Not implemented because tests here don't use it")
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<{ bytes: string }>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    throw new Error("Not implemented because tests here don't use it")
  }
}