import { describe, test, expect } from "@jest/globals"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import { KurtResultLimitError } from "@formula-monks/kurt"

describe("KurtVertexAI generateNaturalLanguage", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Say hello!",
      })
    )
    expect(result.text).toEqual("Hello! 👋  😊\n")
  })

  test("writes a haiku with high temperature", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Compose a haiku about a mountain stream at night.",
        sampling: {
          maxOutputTokens: 100,
          temperature: 1.0,
          topP: 1.0,
        },
      })
    )
    expect(result.text).toEqual(
      [
        "Moon bathes silver stream,",
        "Whispers flow through sleeping wood,",
        "Stones dream in the dark.",
        "",
      ].join("\n")
    )
  })

  test("throws a limit error", async () => {
    await snapshotAndMockWithError(
      (kurt) =>
        kurt.generateNaturalLanguage({
          prompt: "Compose a haiku about content length limitations.",
          sampling: { maxOutputTokens: 5 }, // too few for a haiku
        }),

      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtResultLimitError)
        const error = errorAny as KurtResultLimitError

        expect(error.text).toEqual("Words cut short, confined")
      }
    )
  })
})
