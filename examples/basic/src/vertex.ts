import { Kurt } from "@formula-monks/kurt"
import { KurtVertexAI } from "@formula-monks/kurt-vertex-ai"
import { VertexAI } from "@google-cloud/vertexai"
import { z } from "zod"

const vertexAdapter = new KurtVertexAI({
  vertexAI: new VertexAI({
    project: process.env.VERTEX_AI_PROJECT ?? "my-project",
    location: process.env.VERTEX_AI_LOCATION ?? "us-central1",
  }),
  model: "gemini-1.0-pro", // or any other supported model
})

const kurt = new Kurt(vertexAdapter)

const stream = kurt.generateStructuredData({
  // or any other generation method
  prompt: "Say hello!",
  schema: z.object({
    say: z.string().describe("A single word to say"),
  }),
})

const { data } = await stream.result
console.log(data) // { say: "hello" }
