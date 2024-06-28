import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import { KurtResultValidateError } from "@formula-monks/kurt"

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

  test("throws a validate error from an impossible schema", async () => {
    await snapshotAndMockWithError(
      (kurt) =>
        kurt.generateStructuredData({
          prompt: "Say hello!",
          schema: z
            .object({
              say: z
                .string()
                .regex(/(?=IMPOSSIBLE)hello/) // (can't be both "hello" and "IMPOSSIBLE")
                .describe("A single word to say"),
            })
            .describe("Say a word"),
        }),

      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtResultValidateError)
        const error = errorAny as KurtResultValidateError

        expect(error.text).toEqual('{"say":"hello"}')
        expect(error.data).toEqual({ say: "hello" })
        expect(error.cause.issues).toEqual([
          {
            code: "invalid_string",
            path: ["say"],
            validation: "regex",
            message: "Invalid",
          },
        ])
      }
    )
  })
})
