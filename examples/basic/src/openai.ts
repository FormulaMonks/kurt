import { Kurt } from "@formula-monks/kurt"
import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import OpenAI from "openai"
import { z } from "zod"

const openAIAdapter = new KurtOpenAI({
  openAI: new OpenAI(),
  model: "gpt-3.5-turbo-0125",
})

const kurt = new Kurt(openAIAdapter)

const stream = kurt.generateStructuredData({
  // or any other generation method
  prompt: "Say hello!",
  schema: z.object({
    say: z.string().describe("A single word to say"),
  }),
})

const { data } = await stream.result
console.log(data) // { say: "hello" }
