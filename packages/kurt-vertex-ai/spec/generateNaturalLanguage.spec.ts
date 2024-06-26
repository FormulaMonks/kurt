import { describe, test, expect } from "@jest/globals"
import { snapshotAndMock } from "./snapshots"

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
})
