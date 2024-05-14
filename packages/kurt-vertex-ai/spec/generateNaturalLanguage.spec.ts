import { describe, test, expect } from "@jest/globals"
import { snapshotAndMock } from "./snapshots"

describe("KurtVertexAI generateNaturalLanguage", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Say hello!",
      })
    )
    expect(result.text).toEqual("Hello! How can I assist you today?")
  })
})
