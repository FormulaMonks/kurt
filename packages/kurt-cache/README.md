# Kurt Adapter for Caching

[Kurt](https://github.com/FormulaMonks/kurt) is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

This package implements an adapter for Kurt that caches responses to disk. This is most useful for testing and development, for:
- ensuring determinism of the test data and code paths
- avoiding unnecessary AI usage costs for repetitive requests
- allowing for running existing tests without requiring an API key for the AI service

The cache entries are YAML files, which can be easily inspected and modified for your test cases, as well as checked into your code repository for meaningful code review.

[Read here for more information about Kurt](https://github.com/FormulaMonks/kurt/blob/main/README.md).

## Examples

[This example code](../../examples/basic/src/openai.ts) shows how to set up and use Kurt with OpenAI.
