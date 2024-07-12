import { describe, test, expect } from "@jest/globals"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import { KurtResultLimitError } from "@formula-monks/kurt"

describe("KurtOpenAI generateNaturalLanguage", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Say hello!",
      })
    )
    expect(result.text).toEqual("Hello! How can I assist you today?")
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
        "Moonlight gently gleams,",
        "Whispers of the stream below,",
        "Stars in water dream.",
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

        expect(error.text).toEqual("Words constrained by bounds,\n")
      }
    )
  })
})
