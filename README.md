# Kurt

Kurt is a TypeScript library by [Formula.Monks](https://www.formula.co/) that wraps AI SDKs, making it easy to build structured LLM-based applications (RAG, agents, etc) that work with any LLM that supports structured output (via function calling features).

Currently Supported LLMs:

- [GPT models from OpenAI](./packages/kurt-open-ai/README.md)
- [Gemini models from Google Vertex AI](./packages/kurt-vertex-ai/README.md)

# What's up with the Name?

[The Mechanical Turk](https://en.wikipedia.org/wiki/Mechanical_Turk) was a historical system composed of a human acting like an intelligent machine. The human was hidden inside the box, abstracted away as a generic intelligence.

Kurt is the reverse of The Turk: it is a system composed of a machine acting like an intelligent human. The LLM is hidden inside the box, abstracted away as a generic intelligence.

![A chess-playing humanoid robot inside a box, in the style of the illustration from the Wikipedia page for Mechanical Turk](./assets/kurt.jpg)

# Why not use [Langchain.js](https://js.langchain.com/docs/get_started/introduction)?

Langchain tries to do too much. It is packed with a ton of different features for different use cases, but in practice some of these features get too little attention (at least on the JavaScript version of the library) and end up being buggy or incomplete on certain LLM backends. For example, at the time of this writing there are many bugs in the function calling features for Gemini in Langchain.js.

Kurt has a more minimalistic and opinionated approach, focused on a few core use cases (often related to structured output) and making sure these use cases work well with all of the supported LLMs.

Unlike Langchain, Kurt won't bother trying to support structured output with LLMs that don't have native support for it, because those workarounds are overly complicated and too brittle for production applications.

# Examples

You can see [usage examples for generating output in the documentation for Kurt](./packages/kurt/README.md).

You can see usage examples for setup with different adapters in the respective adapters' documentation:
- [Setup with OpenAI](./packages/kurt-open-ai/README.md)
- [Setup with Vertex AI](./packages/kurt-vertex-ai/README.md)
