import { expect, test } from "@jest/globals"
import { KurtVertexAI, type KurtVertexAISupportedModel } from "../src"

test("KurtVertexAI.isSupportedModel", () => {
  // For updating this test, the current list of models can be found at:
  // https://ai.google.dev/gemini-api/docs/models/gemini
  expect(KurtVertexAI.isSupportedModel("gemini-1.5-pro")).toBe(true)
  expect(KurtVertexAI.isSupportedModel("gemini-1.5-flash")).toBe(true)
  expect(KurtVertexAI.isSupportedModel("gemini-2.0-flash")).toBe(true)

  expect(KurtVertexAI.isSupportedModel("bogus")).toBe(false)

  // The below code proves that the function works as a type guard.
  const modelName = "gemini-1.5-pro"
  if (KurtVertexAI.isSupportedModel(modelName)) {
    const modelNameGood: KurtVertexAISupportedModel = modelName
  }
})
