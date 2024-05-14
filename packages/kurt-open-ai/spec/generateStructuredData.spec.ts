import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock } from "./snapshots"

describe("KurtOpenAI generateStructuredData", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateStructuredData({
        prompt: "Say hello!",
        schema: z
          .object({
            say: z.string().describe("A single word to say"),
          })
          .describe("Say a word"),
      })
    )
    expect(result.data).toEqual({ say: "hello" })
  })
})
