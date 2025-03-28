import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock } from "./snapshots"
import { KurtTools } from "@formula-monks/kurt/dist/KurtTools"

const calculatorTools = {
  subtract: z
    .object({
      minuend: z.number().describe("The number to subtract from"),
      subtrahend: z.number().describe("The number to subtract by"),
    })
    .describe("Calculate a subtraction"),
  divide: z
    .object({
      dividend: z.number().describe("The number to be divided"),
      divisor: z.number().describe("The number to divide by"),
    })
    .describe("Calculate a division"),
}

describe("KurtOpenAI generateWithOptionalTools", () => {
  test("calculator (with tool call)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt:
          "What's 9876356 divided by 30487, rounded to the nearest integer?",
        tools: calculatorTools,
      })
    )
    expect(result.data).toEqual({
      name: "divide",
      args: { dividend: 9876356, divisor: 30487 },
    })
    expect(result.additionalData).toBeUndefined() // no parallel tool calls
  })

  test("calculator (with strict tool call)", async () => {
    const result = await snapshotAndMock("gpt-4o-mini-2024-07-18", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt:
          "What's 9876356 divided by 30487, rounded to the nearest integer?",
        tools: calculatorTools,
        sampling: { forceSchemaConstrainedTokens: true },
      })
    )
    expect(result.data).toEqual({
      name: "divide",
      args: { dividend: 9876356, divisor: 30487 },
    })
    expect(result.additionalData).toBeUndefined() // no parallel tool calls
  })

  test("calculator (after tool call)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt:
          "What's 9876356 divided by 30487, rounded to the nearest integer?",
        tools: calculatorTools,
        extraMessages: [
          {
            role: "model",
            toolCall: {
              name: "divide",
              args: { dividend: 9876356, divisor: 30487 },
              result: { quotient: 323.95302915996984 },
            },
          },
        ],
      })
    )
    expect(result.text).toEqual(
      "9876356 divided by 30487 is approximately 323.95. Rounded to the nearest integer, the result is 324."
    )
  })

  test("calculator (with parallel tool calls)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt: [
          "Calculate each of the following:",
          "1. 8026256882 divided by 3402398",
          "2. 1185835515 divided by 348263",
          "3. 90135094495 minus 89944954350",
        ].join("\n"),
        tools: calculatorTools,
      })
    )
    expect(result.data).toEqual({
      name: "divide",
      args: { dividend: 8026256882, divisor: 3402398 },
    })
    expect(result.additionalData).toEqual([
      {
        name: "divide",
        args: { dividend: 1185835515, divisor: 348263 },
      },
      {
        name: "subtract",
        args: { minuend: 90135094495, subtrahend: 89944954350 },
      },
    ])
  })

  test("calculator (after parallel tool calls)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt: [
          "Calculate each of the following:",
          "1. 8026256882 divided by 3402398",
          "2. 1185835515 divided by 348263",
          "3. 90135094495 minus 89944954350",
        ].join("\n"),
        tools: calculatorTools,
        extraMessages: [
          {
            role: "model",
            toolCall: {
              name: "divide",
              args: { dividend: 8026256882, divisor: 3402398 },
              result: { quotient: 2359 },
            },
          },
          {
            role: "model",
            toolCall: {
              name: "divide",
              args: { dividend: 1185835515, divisor: 348263 },
              result: { quotient: 3405 },
            },
          },
          {
            role: "model",
            toolCall: {
              name: "subtract",
              args: { minuend: 90135094495, subtrahend: 89944954350 },
              result: { quotient: 190140145 },
            },
          },
        ],
      })
    )
    expect(result.text).toEqual(
      [
        "Here are the results:",
        "",
        "1. 8026256882 divided by 3402398 is 2359.",
        "2. 1185835515 divided by 348263 is 3405.",
        "3. 90135094495 minus 89944954350 is 190140145.",
      ].join("\n")
    )
  })

  test("uses a kurt tool to search the web", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-11-20", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt: [
          "What is the weather in Lisbon, Portugal today? Respond with only one sentence, start by saying which day it is.",
        ].join("\n"),
        tools: {
          webSearch: KurtTools.WebSearch(),
        },
      })
    )
    expect(result.text).toEqual(
      "Thursday, March 27, 2025, in Lisbon, Portugal, is mostly cloudy with a high of 61°F (16°C) and a low of 50°F (10°C). "
    )
  })

  test("can use both a kurt tool and an external tool", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-11-20", (kurt) =>
      kurt.generateWithOptionalTools({
        prompt: [
          "Get the current weather in Lisbon and divide the temperature in Celsius by 0.79",
        ].join("\n"),
        tools: {
          webSearch: KurtTools.WebSearch(),
          ...calculatorTools,
        },
      })
    )
    expect(result.data).toEqual({
      name: "divide",
      args: { dividend: 14, divisor: 0.79 },
    })
  })

  // The below test is commented out because this test case currently breaks
  // OpenAI's API (causes a 5xx server error).
  //
  // I'm leaving it in here as a comment so we can re-enable it if OpenAI
  // eventually fixes their system to handle this case (hopefully somebody
  // on their team will see the 5xx errors and investigate).

  // test("limit error (with parallel tool calls)", async () => {
  //   await snapshotAndMockWithError(
  //     (kurt) =>
  //       kurt.generateWithOptionalTools({
  //         prompt: [
  //           "Calculate each of the following:",
  //           "1. 8026256882 divided by 3402398",
  //           "2. 1185835515 divided by 348263",
  //           "3. 90135094495 minus 89944954350",
  //         ].join("\n"),
  //         tools: calculatorTools,
  //         sampling: { maxOutputTokens: 20 },
  //       }),
  //
  //     (errorAny) => {
  //       console.error(errorAny)
  //       expect(errorAny).toBeInstanceOf(KurtResultLimitError)
  //       const error = errorAny as KurtResultLimitError
  //
  //       expect(error.text).toEqual("TODO: fill in")
  //     }
  //   )
  // })
})
