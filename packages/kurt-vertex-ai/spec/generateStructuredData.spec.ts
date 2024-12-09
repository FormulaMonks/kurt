import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import {
  KurtCapabilityError,
  KurtResultValidateError,
} from "@formula-monks/kurt"

describe("KurtVertexAI generateStructuredData", () => {
  test("says hello (response format 1)", async () => {
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

  test("says hello (response format 2)", async () => {
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

  test("says hello (response format 3)", async () => {
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

  test("throws a capability error for schema constrained tokens", async () => {
    await snapshotAndMockWithError(
      (kurt) =>
        kurt.generateStructuredData({
          prompt: "Say hello!",
          schema: z
            .object({
              say: z.string().describe("A single word to say"),
            })
            .describe("Say a word"),
          sampling: {
            // This is not available as a capability of Vertex AI.
            forceSchemaConstrainedTokens: true,
          },
        }),

      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtCapabilityError)
        const error = errorAny as KurtCapabilityError
        expect(error.missingCapability).toEqual(
          "forceSchemaConstrainedTokens is not available for Vertex AI"
        )
        expect(error.message).toContain(error.missingCapability)
      }
    )
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
