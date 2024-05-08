# Kurt Adapter for Vertex AI

[Kurt](https://github.com/FormulaMonks/kurt) is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

This package implements an adapter for Kurt that works with [Vertex AI's Gemini models](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models).

[Read here for more information about Kurt](https://github.com/FormulaMonks/kurt/blob/main/README.md).

## Usage Example

```ts
import { Kurt } from "@formula-monks/kurt"
import { KurtVertexAI } from "@formula-monks/kurt-open-ai"
import { VertexAI } from "@google-cloud/vertexai"
import { z } from "zod"

const kurt = new Kurt(
  new KurtVertexAI({
    vertexAI: new VertexAI({ project: "my-project", location: "us-central1" }),
    model: "gemini-1.0-pro", // or any other supported model
  })
)

const stream = kurt.generateStructuredData({ // or any other generation method
  prompt: "Say hello!",
  schema: z.object({
    say: z.string().describe("A single word to say"),
  }),
})

const { data } = await stream.result
console.log(data) // { say: "hello" }
```
