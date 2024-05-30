import { expect, test } from "@jest/globals"
import {
  KurtVertexAI,
  type KurtVertexAISupportedModel,
} from "../src/KurtVertexAI"

test("KurtVertexAI.isSupportedModel", () => {
  // For updating this test, the current list of models can be found at:
  // https://platform.openai.com/docs/models/overview
  expect(KurtVertexAI.isSupportedModel("gemini-1.5-pro")).toBe(true)
  expect(KurtVertexAI.isSupportedModel("gemini-1.0-pro")).toBe(true)
  expect(KurtVertexAI.isSupportedModel("gemini-1.0-pro-vision")).toBe(false)

  expect(KurtVertexAI.isSupportedModel("bogus")).toBe(false)

  // The below code proves that the function works as a type guard.
  const modelName = "gemini-1.0-pro"
  if (KurtVertexAI.isSupportedModel(modelName)) {
    const modelNameGood: KurtVertexAISupportedModel = modelName
  }
})
