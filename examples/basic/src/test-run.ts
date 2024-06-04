import type { Kurt } from "@formula-monks/kurt"
import { z } from "zod"

const generateStructuredData = async (kurt: Kurt) => {
  const stream = kurt.generateStructuredData({
    prompt: "Say hello!",
    schema: z.object({
      say: z.string().describe("A single word to say"),
    }),
  })

  for await (const event of stream) {
    console.log(event)
  }
  // { chunk: '{"' }
  // { chunk: "say" }
  // { chunk: '":"' }
  // { chunk: "hello" }
  // { chunk: '"}' }
  // { finished: true, text: '{"say":"hello"}', data: { say: "hello" } }

  const { data } = await stream.result
  console.log(data)
  // { say: "hello" }
}

const generateNaturalLanguage = async (kurt: Kurt) => {
  const stream = kurt.generateNaturalLanguage({
    prompt: "Say hello!",
  })

  for await (const event of stream) {
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

  const { text } = await stream.result
  console.log(text)
  // "Hello! How can I assist you today?"
}

export const testRun = async (kurt: Kurt) => {
  await generateStructuredData(kurt)

  await generateNaturalLanguage(kurt)
}
