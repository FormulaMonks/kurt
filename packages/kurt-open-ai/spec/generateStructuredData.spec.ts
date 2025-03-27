import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import {
  KurtCapabilityError,
  KurtInvalidInputSchemaError,
} from "@formula-monks/kurt"

describe("KurtOpenAI generateStructuredData", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock("gpt-4o-mini-2024-07-18", (kurt) =>
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

  test("says hello with system prompt", async () => {
    const result = await snapshotAndMock("gpt-4o-mini-2024-07-18", (kurt) =>
      kurt.generateStructuredData({
        systemPrompt: "Be nice.",
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

  test("says hello with schema constrained tokens", async () => {
    const result = await snapshotAndMock("gpt-4o-mini-2024-07-18", (kurt) =>
      kurt.generateStructuredData({
        prompt: "Say hello!",
        schema: z
          .object({
            say: z.string().describe("A single word to say"),
          })
          .describe("Say a word"),
        sampling: { forceSchemaConstrainedTokens: true },
      })
    )
    expect(result.data).toEqual({ say: "Hello!" })
  })

  test("throws a capability error for schema constrained tokens in an older model", async () => {
    await snapshotAndMockWithError(
      "gpt-4o-2024-05-13",
      (kurt) =>
        kurt.generateStructuredData({
          prompt: "Say hello!",
          schema: z
            .object({
              say: z.string().describe("A single word to say"),
            })
            .describe("Say a word"),
          sampling: { forceSchemaConstrainedTokens: true },
        }),
      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtCapabilityError)
        const error = errorAny as KurtCapabilityError
        expect(error.missingCapability).toEqual(
          "forceSchemaConstrainedTokens is not available for older models, including gpt-4o-2024-05-13"
        )
        expect(error.message).toContain(error.missingCapability)
      }
    )
  })

  test("throws a validate error from an impossible schema", async () => {
    await snapshotAndMockWithError(
      "gpt-4o-mini-2024-07-18",
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
        expect(errorAny).toBeInstanceOf(KurtInvalidInputSchemaError)
        const error = errorAny as KurtInvalidInputSchemaError

        expect(error.message).toEqual(
          "400 Invalid schema for function 'structured_data': In context=('properties', 'say'), 'pattern' is not permitted."
        )
      }
    )
  })
})
