import { z } from "zod"
import type { KurtMessage } from "@formula-monks/kurt"
import { createKurt } from "./util/createKurt"
const kurt = createKurt(process.env.KURT_MODEL)

const prompt =
  "What's 9876356 divided by 30487, rounded to the nearest integer?"

const tools = {
  subtract: z
    .object({
      minuend: z.number().describe("The number to subtract from"),
      subtrahend: z.number().describe("The number to subtract by"),
    })
    .describe("Calculate a subtraction expression"),
  divide: z
    .object({
      dividend: z.number().describe("The number to be divided"),
      divisor: z.number().describe("The number to divide by"),
    })
    .describe("Calculate a division expression"),
}

// Run Kurt in a loop until it produces a natural language response,
// or until we reach a maximum number of iterations.
const extraMessages: KurtMessage[] = []
const MAX_ITERATIONS = 3
for (let i = 0; i < MAX_ITERATIONS; i++) {
  const { text, data } = await kurt.generateWithOptionalTools({
    prompt,
    tools,
    extraMessages,
  }).result

  // If there is data in the result, it means the LLM made a tool call.
  if (data) {
    const { name, args } = data
    let result = {}
    if (name === "divide") {
      result = { quotient: args.dividend / args.divisor }
    } else if (name === "subtract") {
      result = { difference: args.minuend - args.subtrahend }
    }
    const toolCall = { name, args, result }
    extraMessages.push({ role: "model", toolCall })
    console.log(toolCall)
    // {
    //   name: "divide",
    //   args: { dividend: 9876356, divisor: 30487 },
    //   result: { quotient: 323.95302915996984 },
    // }
  } else {
    console.log(text) // "The answer, rounded to the nearest integer, is 324."
    break
  }
}
