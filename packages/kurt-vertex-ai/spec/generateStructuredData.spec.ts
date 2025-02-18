import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import {
  KurtCapabilityError,
  KurtResultValidateError,
} from "@formula-monks/kurt"
import { promises as fs } from "node:fs"

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

  test("transcribes a base64-encoded audio", async () => {
    const base64Data = await fs.readFile("spec/data/HelloWorld.mp3", {
      encoding: "base64",
    })
    const result = await snapshotAndMock((kurt) =>
      kurt.generateStructuredData({
        prompt: "Transcribe this audio file.",
        extraMessages: [
          {
            role: "user",
            inlineData: {
              mimeType: "audio/mpeg",
              base64Data,
            },
          },
        ],
        schema: z
          .object({
            transcription: z
              .string()
              .describe("The transcription of the audio"),
          })
          .describe("Result of transcribing an audio file"),
      })
    )
    expect(result.data).toEqual({ transcription: "Hello world" })
  })
})
