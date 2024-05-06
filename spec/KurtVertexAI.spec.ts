import { VertexAI as RealVertexAI } from "@google-cloud/vertexai"
import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import { KurtVertexAI } from "../src/KurtVertexAI"
import type {
  VertexAI,
  VertexAIRequest,
  VertexAIResponse,
  VertexAIResponseChunk,
  VertexAIResponseChunkCandidate,
  VertexAISchema,
} from "../src/VertexAI.types"
import { arrayFromAsync } from "./util"

const USE_REAL_API = false // set to true to validate against actual VertexAI

function setupExpectingCall(
  expectedRequest: VertexAIRequest,
  responseChunks: VertexAIResponseChunkCandidate[]
) {
  function requiredEnvVar(name: string) {
    const value = process.env[name]
    if (!value) throw new Error(`Missing environment variable: ${name}`)
    return value
  }

  const vertexAI: VertexAI = USE_REAL_API
    ? new RealVertexAI({
        project: requiredEnvVar("VERTEX_AI_PROJECT"),
        location: requiredEnvVar("VERTEX_AI_LOCATION"),
      })
    : ({
        getGenerativeModel(...args: unknown[]) {
          return {
            generateContentStreamPATCHED(
              req: VertexAIRequest
            ): VertexAIResponse {
              expect(req).toEqual(expectedRequest)

              async function* generator(): AsyncGenerator<VertexAIResponseChunk> {
                for await (const streamChunk of responseChunks) {
                  yield { candidates: [streamChunk] }
                }
              }

              return (async () => ({ stream: generator() }))()
            },
          }
        },
      } as unknown as VertexAI)

  return new KurtVertexAI({
    vertexAI,
    model: "gemini-1.0-pro",
  })
}

describe("KurtVertexAI", () => {
  test("generateNaturalLanguage", async () => {
    const req = {
      prompt: "Say hello!",
    }

    const kurt = setupExpectingCall(
      {
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      },
      [
        {
          content: {
            role: "model",
            parts: [{ text: "Hello!" }],
          },
        },
        {
          content: {
            role: "model",
            parts: [{ text: " How can I help you today?" }],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateNaturalLanguage(req))).toEqual([
      { chunk: "Hello!" },
      { chunk: " How can I help you today?" },
      { finished: true, text: "Hello! How can I help you today?" },
    ])
  })

  test("generateStructuredData (response format 1)", async () => {
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
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        tool_config: { function_calling_config: { mode: "ANY" } },
        tools: [
          {
            functionDeclarations: [
              {
                name: "structured_data",
                description: req.schema.description,
                parameters: {
                  type: "object",
                  properties: {
                    say: {
                      type: "string",
                      description: "A single word to say",
                    },
                  },
                  required: ["say"],
                } as unknown as VertexAISchema,
              },
            ],
          },
        ],
      },
      [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "structured_data",
                  args: { say: "Hello!" },
                },
              },
            ],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateStructuredData(req))).toEqual([
      { chunk: '{"say":"Hello!"}' },
      {
        finished: true,
        text: '{"say":"Hello!"}',
        data: { say: "Hello!" },
      },
    ])
  })

  test("generateStructuredData (response format 2)", async () => {
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
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        tool_config: { function_calling_config: { mode: "ANY" } },
        tools: [
          {
            functionDeclarations: [
              {
                name: "structured_data",
                description: req.schema.description,
                parameters: {
                  type: "object",
                  properties: {
                    say: {
                      type: "string",
                      description: "A single word to say",
                    },
                  },
                  required: ["say"],
                } as unknown as VertexAISchema,
              },
            ],
          },
        ],
      },
      [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "call",
                  args: {
                    function: "structured_data",
                    say: "hello",
                    extension: "default_api",
                  },
                },
              },
            ],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateStructuredData(req))).toEqual([
      { chunk: '{"say":"hello"}' },
      {
        finished: true,
        text: '{"say":"hello"}',
        data: { say: "hello" },
      },
    ])
  })

  test("generateStructuredData (response format 3)", async () => {
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
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        tool_config: { function_calling_config: { mode: "ANY" } },
        tools: [
          {
            functionDeclarations: [
              {
                name: "structured_data",
                description: req.schema.description,
                parameters: {
                  type: "object",
                  properties: {
                    say: {
                      type: "string",
                      description: "A single word to say",
                    },
                  },
                  required: ["say"],
                } as unknown as VertexAISchema,
              },
            ],
          },
        ],
      },
      [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "call",
                  args: {
                    args: { say: "hi" },
                    function: "structured_data",
                    extension: "default_api",
                  },
                },
              },
            ],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateStructuredData(req))).toEqual([
      { chunk: '{"say":"hi"}' },
      {
        finished: true,
        text: '{"say":"hi"}',
        data: { say: "hi" },
      },
    ])
  })
})
