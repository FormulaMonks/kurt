import { Kurt } from "@formula-monks/kurt"
import { KurtVertexAI } from "@formula-monks/kurt-vertex-ai"
import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import { OpenAI } from "openai"
import { VertexAI } from "@google-cloud/vertexai"
import { testRun } from "./test-run"

const vertexAdapter = new KurtVertexAI({
  vertexAI: new VertexAI({
    project: process.env.VERTEX_AI_PROJECT ?? "my-project",
    location: process.env.VERTEX_AI_LOCATION ?? "us-central1",
  }),
  model: "gemini-1.0-pro", // or any other supported model
})

const openAIAdapter = new KurtOpenAI({
  openAI: new OpenAI(),
  model: "gpt-3.5-turbo-0125",
})

console.log("Testing Vertex Adapter")
await testRun(new Kurt(vertexAdapter))

console.log("Testing OpenAI Adapter")
await testRun(new Kurt(openAIAdapter))
