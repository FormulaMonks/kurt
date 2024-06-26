import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock } from "./snapshots"

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

describe("KurtVertexAI generateWithOptionalTools", () => {
  test("calculator (with tool call)", async () => {
    const result = await snapshotAndMock((kurt) =>
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
  })

  test("calculator (after tool call)", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateWithOptionalTools({
        prompt:
          "What's 9876356 divided by 30487, rounded to the nearest integer?",
        tools: calculatorTools,
        extraMessages: [
          {
            role: "model" as const,
            toolCall: {
              name: "divide",
              args: { dividend: 9876356, divisor: 30487 },
              result: { quotient: 323.95302915996984 },
            },
          },
        ],
      })
    )
    expect(result.text).toEqual("That's about 324. \n")
  })

  test("calculator (with parallel tool calls)", async () => {
    const result = await snapshotAndMock((kurt) =>
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
    const result = await snapshotAndMock((kurt) =>
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
        "1. 8026256882 divided by 3402398 is 2359.",
        "2. 1185835515 divided by 348263 is 3405.",
        "3. 90135094495 minus 89944954350 is 190140145. ",
        "",
      ].join("\n")
    )
  })
})
