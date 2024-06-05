# Kurt

[Kurt](https://github.com/FormulaMonks/kurt) is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

This package implements the core functionality of Kurt, providing the common interface into which all the compatible LLM adapters can fit.

[Read here for more information about Kurt](https://github.com/FormulaMonks/kurt/blob/main/README.md).

# Examples

Check the [example folder](https://github.com/FormulaMonks/kurt/tree/main/examples)

## Create Kurt with your LLM of choice

You can see usage examples for setup with different adapters in the respective adapters' documentation:

- [Setup with OpenAI](https://github.com/FormulaMonks/kurt/blob/main/packages/kurt-open-ai/README.md)
- [Setup with Vertex AI](https://github.com/FormulaMonks/kurt/blob/main/packages/kurt-vertex-ai/README.md)

## Generate Natural Language Output

The most basic use case for an LLM is to ask it to generate some text.

```ts
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
```

## Generate Structured Data Output

If we want an LLM to make decisions or perform tasks within a larger system, we often need it to format its response as structured data rather than natural language.

Using the `zod` library as a convenient way to specify a JSON schema in TypeScript, we can force the LLM to generate structured data that conforms to the given schema.

For best results, be sure to include descriptions of every field in the schema, as these will be used by the LLM as documentation to determine how best to fill the fields with data.

```ts
import { z } from "zod"

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
```

## Generate With Optional Tools

Sometimes we may want to ask the LLM to produce a natural language response, but with the option of using some tools (in a structured data format) as part of its self-directed process of fulfilling the prompt.

This is a bit of a mixture of the above two cases - we are expecting the LLM to make zero or more tool calls, and then eventually produce a natural language response.

As above, we can use the `zod` library to conveniently declare the JSON schema for the tools, given as a map of named tools.

Again, for best results, we should include helpful descriptions of each tool schema, and each field within them, so that the LLM can make a more informed decision about how to use the tools.

```ts
import { z } from "zod"

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
```
