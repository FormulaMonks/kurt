import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock } from "./snapshots"

describe("KurtVertexAI generateWithOptionalTools", () => {
  test("calculator (with tool call)", async () => {
    const result = await snapshotAndMock((kurt) =>
      kurt.generateWithOptionalTools({
        prompt:
          "What's 9876356 divided by 30487, rounded to the nearest integer?",
        tools: {
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
        },
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
        tools: {
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
        },
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
    expect(result.text).toEqual("That's about 324.")
  })
})
