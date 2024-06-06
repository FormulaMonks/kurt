import { Kurt, type KurtMessage, type KurtAdapter } from "@formula-monks/kurt"
import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import { KurtVertexAI } from "@formula-monks/kurt-vertex-ai"
import { VertexAI } from "@google-cloud/vertexai"
import OpenAI from "openai"
import { z } from "zod"

// --- Create Kurt in a model-agnostic way

const createKurt = (model: string): Kurt => {
  const adapter = findAdapter(model)
  if (!adapter) throw new Error(`Model ${model} is not supported.`)
  return new Kurt(adapter)
}

const findAdapter = (model: string): KurtAdapter | null => {
  if (KurtOpenAI.isSupportedModel(model))
    return new KurtOpenAI({ openAI: new OpenAI(), model })

  if (KurtVertexAI.isSupportedModel(model))
    return new KurtVertexAI({
      vertexAI: new VertexAI({
        project: process.env.VERTEX_AI_PROJECT ?? "my-project",
        location: process.env.VERTEX_AI_LOCATION ?? "us-central1",
      }),
      model,
    })

  return null
}

const model = process.env.KURT_MODEL ?? "gemini-1.0-pro"

const kurt = createKurt(model)

// --- Generate Natural Language Output

const naturalLanguageStream = kurt.generateNaturalLanguage({
  prompt: "Say hello!",
})

for await (const event of naturalLanguageStream) {
  console.log(event)
}
// { chunk: "Hello" }
// { chunk: "!" }
// { chunk: " How" }
// { chunk: " can" }
// { chunk: " I" }
// { chunk: " assist" }
// { chunk: " you" }
// { chunk: " today" }
// { chunk: "?" }
// {
//   finished: true,
//   text: "Hello! How can I assist you today?",
//   data: undefined,
// }

const { text } = await naturalLanguageStream.result
console.log(text)
// "Hello! How can I assist you today?"

// --- Generate Structured Data Output

const structuredDataStream = kurt.generateStructuredData({
  prompt: "Say hello!",
  schema: z.object({
    say: z.string().describe("A single word to say"),
  }),
})

for await (const event of structuredDataStream) {
  console.log(event)
}
// { chunk: '{"' }
// { chunk: "say" }
// { chunk: '":"' }
// { chunk: "hello" }
// { chunk: '"}' }
// { finished: true, text: '{"say":"hello"}', data: { say: "hello" } }

const { data } = await structuredDataStream.result
console.log(data)
// { say: "hello" }

// --- Running with Tools

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
