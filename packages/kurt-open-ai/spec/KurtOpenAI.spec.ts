import { describe, expect, test } from "@jest/globals"
import { OpenAI as RealOpenAI } from "openai"
import { z } from "zod"
import { KurtOpenAI } from "../src/KurtOpenAI"
import type {
  OpenAI,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIResponseChunk,
} from "../src/OpenAI.types"

const USE_REAL_API = false // set to true to validate against actual OpenAI

function setupExpectingCall(
  expectedRequest: OpenAIRequest,
  responseChunks: OpenAIResponseChunk["choices"][number][]
) {
  const openAI: OpenAI = USE_REAL_API
    ? new RealOpenAI()
    : ({
        chat: {
          completions: {
            create(req: OpenAIRequest): OpenAIResponse {
              expect(req).toEqual(expectedRequest)
              async function* generator(): AsyncIterable<OpenAIResponseChunk> {
                for await (const streamChunk of responseChunks) {
                  yield { choices: [streamChunk] }
                }
              }

              return (async () => generator())()
            },
          },
        },
      } as unknown as OpenAI)

  return new KurtOpenAI({
    openAI,
    model: "gpt-3.5-turbo-0125",
  })
}

async function arrayFromAsync<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const array: T[] = []
  for await (const item of iter) array.push(item)
  return array
}

describe("KurtOpenAI", () => {
  test("generateNaturalLanguage", async () => {
    const req = {
      prompt: "Say hello!",
    }

    const kurt = setupExpectingCall(
      {
        stream: true,
        model: "gpt-3.5-turbo-0125",
        messages: [{ role: "user", content: "Say hello!" }],
      },
      [
        {
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
        { delta: { content: "Hello" }, finish_reason: null },
        { delta: { content: "!" }, finish_reason: null },
        { delta: { content: " How" }, finish_reason: null },
        { delta: { content: " can" }, finish_reason: null },
        { delta: { content: " I" }, finish_reason: null },
        { delta: { content: " assist" }, finish_reason: null },
        { delta: { content: " you" }, finish_reason: null },
        { delta: { content: " today" }, finish_reason: null },
        { delta: { content: "?" }, finish_reason: null },
        { delta: { content: "" }, finish_reason: "stop" },
      ]
    )

    expect(await arrayFromAsync(kurt.generateNaturalLanguage(req))).toEqual([
      { chunk: "Hello" },
      { chunk: "!" },
      { chunk: " How" },
      { chunk: " can" },
      { chunk: " I" },
      { chunk: " assist" },
      { chunk: " you" },
      { chunk: " today" },
      { chunk: "?" },
      {
        finished: true,
        text: "Hello! How can I assist you today?",
        data: undefined,
      },
    ])
  })

  test("generateStructuredData", async () => {
    const req = {
      prompt: "Say hello!",
      schema: z
        .object({
          say: z.string().describe("A single word to say"),
        })
        .describe("Say a word"),
    }

    const kurt = setupExpectingCall(
      {
        stream: true,
        model: "gpt-3.5-turbo-0125",
        messages: [{ role: "user", content: "Say hello!" }],
        tool_choice: {
          type: "function",
          function: { name: "structured_data" },
        },
        tools: [
          {
            type: "function",
            function: {
              name: "structured_data",
              description: req.schema.description,
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                description: req.schema.description,
                properties: {
                  say: {
                    type: "string",
                    description: "A single word to say",
                  },
                },
                required: ["say"],
                additionalProperties: false,
              },
            },
          },
        ],
      },
      [
        {
          delta: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                index: 0,
                id: "call_dd6BuYAtlTQ3V4uIIpDNRVVU",
                type: "function",
                function: {
                  name: "structured_data",
                  arguments: "",
                },
              },
            ],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "say" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '":"' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "hello" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"}' } }],
          },
          finish_reason: null,
        },
        { delta: {}, finish_reason: "stop" },
      ]
    )

    expect(await arrayFromAsync(kurt.generateStructuredData(req))).toEqual([
      { chunk: '{"' },
      { chunk: "say" },
      { chunk: '":"' },
      { chunk: "hello" },
      { chunk: '"}' },
      {
        finished: true,
        text: '{"say":"hello"}',
        data: { say: "hello" },
      },
    ])
  })

  test("generateWithOptionalTools (with tool call)", async () => {
    const req = {
      prompt:
        "What's 9876356 divided by 30487, rounded to the nearest integer?",
      tools: {
        subtract: z
          .object({
            minuend: z.number().describe("The number to subtract from"),
            subtrahend: z.number().describe("The number to subtract by"),
          })
          .describe("Calculate a subtraction"),
        divide: z
          .object({
            dividend: z.number().describe("The number to be divided"),
            divisor: z.number().describe("The number to divide by"),
          })
          .describe("Calculate a division"),
      },
    }

    const kurt = setupExpectingCall(
      {
        stream: true,
        model: "gpt-3.5-turbo-0125",
        messages: [
          {
            role: "user",
            content:
              "What's 9876356 divided by 30487, rounded to the nearest integer?",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "subtract",
              description: "Calculate a subtraction",
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                description: "Calculate a subtraction",
                properties: {
                  minuend: {
                    type: "number",
                    description: "The number to subtract from",
                  },
                  subtrahend: {
                    type: "number",
                    description: "The number to subtract by",
                  },
                },
                required: ["minuend", "subtrahend"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "divide",
              description: "Calculate a division",
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                description: "Calculate a division",
                properties: {
                  dividend: {
                    type: "number",
                    description: "The number to be divided",
                  },
                  divisor: {
                    type: "number",
                    description: "The number to divide by",
                  },
                },
                required: ["dividend", "divisor"],
                additionalProperties: false,
              },
            },
          },
        ],
      },
      [
        {
          delta: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                index: 0,
                id: "call_j4y9gDgKXEqFzUbmjroAS6xf",
                type: "function",
                function: {
                  name: "divide",
                  arguments: "",
                },
              },
            ],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "div" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "idend" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '":' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "987" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "635" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "6" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: ',"' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "div" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "isor" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '":' } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "304" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "87" } }],
          },
          finish_reason: null,
        },
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "}" } }],
          },
          finish_reason: null,
        },
        { delta: {}, finish_reason: "stop" },
      ]
    )

    expect(await arrayFromAsync(kurt.generateWithOptionalTools(req))).toEqual([
      { chunk: '{"' },
      { chunk: "div" },
      { chunk: "idend" },
      { chunk: '":' },
      { chunk: "987" },
      { chunk: "635" },
      { chunk: "6" },
      { chunk: ',"' },
      { chunk: "div" },
      { chunk: "isor" },
      { chunk: '":' },
      { chunk: "304" },
      { chunk: "87" },
      { chunk: "}" },
      {
        finished: true,
        text: '{"dividend":9876356,"divisor":30487}',
        data: { name: "divide", args: { dividend: 9876356, divisor: 30487 } },
      },
    ])
  })

  test("generateWithOptionalTools (after tool call)", async () => {
    const req = {
      prompt:
        "What's 9876356 divided by 30487, rounded to the nearest integer?",
      tools: {
        subtract: z
          .object({
            minuend: z.number().describe("The number to subtract from"),
            subtrahend: z.number().describe("The number to subtract by"),
          })
          .describe("Calculate a subtraction"),
        divide: z
          .object({
            dividend: z.number().describe("The number to be divided"),
            divisor: z.number().describe("The number to divide by"),
          })
          .describe("Calculate a division"),
      },
      extraMessages: [
        {
          role: "model" as const,
          toolCall: {
            name: "divide",
            args: { dividend: 9876356, divisor: 30487 },
            result: { quotient: 323.95302915996984 },
          },
        },
      ],
    }

    const kurt = setupExpectingCall(
      {
        stream: true,
        model: "gpt-3.5-turbo-0125",
        messages: [
          {
            role: "user",
            content:
              "What's 9876356 divided by 30487, rounded to the nearest integer?",
          },
          {
            role: "assistant",
            tool_calls: [
              {
                id: "call_0",
                type: "function",
                function: {
                  name: "divide",
                  arguments: '{"dividend":9876356,"divisor":30487}',
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_0",
            content: '{"quotient":323.95302915996984}',
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "subtract",
              description: "Calculate a subtraction",
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                description: "Calculate a subtraction",
                properties: {
                  minuend: {
                    type: "number",
                    description: "The number to subtract from",
                  },
                  subtrahend: {
                    type: "number",
                    description: "The number to subtract by",
                  },
                },
                required: ["minuend", "subtrahend"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "divide",
              description: "Calculate a division",
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                description: "Calculate a division",
                properties: {
                  dividend: {
                    type: "number",
                    description: "The number to be divided",
                  },
                  divisor: {
                    type: "number",
                    description: "The number to divide by",
                  },
                },
                required: ["dividend", "divisor"],
                additionalProperties: false,
              },
            },
          },
        ],
      },
      [
        {
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
        { delta: { content: "Rounded" }, finish_reason: null },
        { delta: { content: " to" }, finish_reason: null },
        { delta: { content: " the" }, finish_reason: null },
        { delta: { content: " nearest" }, finish_reason: null },
        { delta: { content: " integer" }, finish_reason: null },
        { delta: { content: "," }, finish_reason: null },
        { delta: { content: " the" }, finish_reason: null },
        { delta: { content: " result" }, finish_reason: null },
        { delta: { content: " is" }, finish_reason: null },
        { delta: { content: " " }, finish_reason: null },
        { delta: { content: "324" }, finish_reason: null },
        { delta: { content: "." }, finish_reason: null },
        { delta: { content: "" }, finish_reason: "stop" },
      ]
    )

    expect(await arrayFromAsync(kurt.generateWithOptionalTools(req))).toEqual([
      { chunk: "Rounded" },
      { chunk: " to" },
      { chunk: " the" },
      { chunk: " nearest" },
      { chunk: " integer" },
      { chunk: "," },
      { chunk: " the" },
      { chunk: " result" },
      { chunk: " is" },
      { chunk: " " },
      { chunk: "324" },
      { chunk: "." },
      {
        finished: true,
        text: "Rounded to the nearest integer, the result is 324.",
        data: undefined,
      },
    ])
  })
})
