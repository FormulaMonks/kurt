import { expect, test } from "@jest/globals"
import { KurtOpenAI, type KurtOpenAISupportedModel } from "../src/KurtOpenAI"

test("KurtOpenAI.isSupportedModel", () => {
  // For updating this test, the current list of models can be found at:
  // https://platform.openai.com/docs/models/overview
  expect(KurtOpenAI.isSupportedModel("gpt-4o")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4o-2024-05-13")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-turbo")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-turbo-2024-04-09")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-turbo-preview")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-0125-preview")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-1106-preview")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-4-vision-preview")).toBe(false)
  expect(KurtOpenAI.isSupportedModel("gpt-4-1106-vision-preview")).toBe(false)
  expect(KurtOpenAI.isSupportedModel("gpt-4-0613")).toBe(false)
  expect(KurtOpenAI.isSupportedModel("gpt-4-32k-0613")).toBe(false)
  expect(KurtOpenAI.isSupportedModel("gpt-3.5-turbo-0125")).toBe(true)
  expect(KurtOpenAI.isSupportedModel("gpt-3.5-turbo-1106")).toBe(true)

  expect(KurtOpenAI.isSupportedModel("bogus")).toBe(false)

  // The below code proves that the function works as a type guard.
  const modelName = "gpt-3.5-turbo-0125"
  if (KurtOpenAI.isSupportedModel(modelName)) {
    const modelNameGood: KurtOpenAISupportedModel = modelName
  }
})
