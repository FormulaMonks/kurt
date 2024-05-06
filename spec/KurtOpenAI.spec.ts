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
import { arrayFromAsync } from "./util"

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
})
