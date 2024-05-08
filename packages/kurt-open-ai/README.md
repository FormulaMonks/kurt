# Kurt Adapter for OpenAI

[Kurt](https://github.com/FormulaMonks/kurt) is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

This package implements an adapter for Kurt that works with [OpenAI's GPT models](https://platform.openai.com/docs/models).

[Read here for more information about Kurt](https://github.com/FormulaMonks/kurt/blob/main/README.md).

## Usage Example

```ts
import { Kurt } from "@formula-monks/kurt"
import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import { OpenAI } from "openai"
import { z } from "zod"

const kurt = new Kurt(
  new KurtOpenAI({
    openAI: new OpenAI(),
    model: "gpt-3.5-turbo-0125", // or any other supported model
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
