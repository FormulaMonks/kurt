import { describe, test, expect } from "@jest/globals"
import { z } from "zod"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import { KurtResultLimitError } from "@formula-monks/kurt"

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

  test("limit error (with parallel tool calls)", async () => {
    await snapshotAndMockWithError(
      (kurt) =>
        kurt.generateWithOptionalTools({
          prompt: [
            "Calculate each of the following:",
            "1. 8026256882 divided by 3402398",
            "2. 1185835515 divided by 348263",
            "3. 90135094495 minus 89944954350",
          ].join("\n"),
          tools: calculatorTools,
          sampling: { maxOutputTokens: 20 },
        }),

      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtResultLimitError)
        const error = errorAny as KurtResultLimitError

        // This is an interesting look behind the scenes at the dumb way that
        // it appears the Gemini team implemented tool calls - they tuned the
        // model to generate this Python(-ish?) code which they apparently then
        // run through an interpreter to print the JSON result.
        //
        // A saner, more robust approach would have been to get the model to
        // emit JSON directly, and force token sampling that is JSON syntax-
        // aware, as well as being schema-aware. That would be a very
        // straightforward way to guarantee that a syntactically- and schema-
        // valid result is obtained. Fine-tuning could also be done to give
        // the model more "practice" at emitting semantically-*useful* JSON,
        // but that's just icing on the cake after the basic validity is
        // guaranteed by the sampling-stage step.
        //
        // This interesting output also gives some insight into the
        // weird/incorrect token counts that we see for successful tool calls.
        // For example, the successful test case for this parallel calculator
        // problem only reports usage of 12 tokens in total, which is
        // signficantly fewer than would actually be needed to represent the
        // JSON data it successfully emits. But then if I generate again with
        // a max token limit of 20 (which, notably, is more than 12), the LLM
        // stops before even generating the first argument of the first
        // function call.
        //
        // So it seems that the max token count applies to the *real* number
        // of tokens being generated by the LLM, while the final usage
        // reporting in the succesful cases uses a lower number that must
        // come from some other inaccurate heuristic.
        //
        // In other words, either by bug or by design, you get a "deep discount"
        // on tokens from tool calls, but you pay "full price" for natural
        // language, or if the tool calls hit the caller-configured max limit.
        expect(error.text).toEqual(
          "```tool_code\nprint(default_api.divide(dividend=80262"
        )
      }
    )
  })
})
