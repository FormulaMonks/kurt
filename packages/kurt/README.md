# Kurt

[Kurt](https://github.com/FormulaMonks/kurt) is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

This package implements the core functionality of Kurt, providing the common interface into which all the compatible LLM adapters can fit.

[Read here for more information about Kurt](https://github.com/FormulaMonks/kurt/blob/main/README.md).

# Examples

Check the [examples folder](https://github.com/FormulaMonks/kurt/tree/main/examples) for runnable example files.

## Create Kurt with your LLM of choice

You can see usage examples for setup with different adapters in the respective adapters' documentation:

- [Setup with OpenAI](https://github.com/FormulaMonks/kurt/blob/main/packages/kurt-open-ai/README.md)
- [Setup with Vertex AI](https://github.com/FormulaMonks/kurt/blob/main/packages/kurt-vertex-ai/README.md)

## Generate Natural Language Output

The most basic use case for an LLM is to ask it to generate some text.

[This example code](../../examples/basic/src/natural-language.ts) shows how to use Kurt to generate natural language.

## Generate Structured Data Output

If we want an LLM to make decisions or perform tasks within a larger system, we often need it to format its response as structured data rather than natural language.

Using the `zod` library as a convenient way to specify a JSON schema in TypeScript, we can force the LLM to generate structured data that conforms to the given schema.

For best results, be sure to include descriptions of every field in the schema, as these will be used by the LLM as documentation to determine how best to fill the fields with data.

[This example code](../../examples/basic/src/structured-data.ts) shows how to use Kurt to generate structured data.

## Generate With Optional Tools

Sometimes we may want to ask the LLM to produce a natural language response, but with the option of using some tools (in a structured data format) as part of its self-directed process of fulfilling the prompt.

This is a bit of a mixture of the above two cases - we are expecting the LLM to make zero or more tool calls, and then eventually produce a natural language response.

As above, we can use the `zod` library to conveniently declare the JSON schema for the tools, given as a map of named tools.

Again, for best results, we should include helpful descriptions of each tool schema, and each field within them, so that the LLM can make a more informed decision about how to use the tools.

[This example code](../../examples/basic/src/with-optional-tools.ts) shows how to use Kurt to generate in a loop with optional tools.
