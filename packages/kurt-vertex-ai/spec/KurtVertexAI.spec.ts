import { VertexAI as RealVertexAI } from "@google-cloud/vertexai"
import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import {
  KurtVertexAI,
  type KurtVertexAISupportedModel,
} from "../src/KurtVertexAI"
import type {
  VertexAI,
  VertexAIRequest,
  VertexAIResponse,
  VertexAIResponseChunk,
  VertexAIResponseChunkCandidate,
  VertexAISchema,
} from "../src/VertexAI.types"
import { Kurt } from "@formula-monks/kurt"

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

  return new Kurt(new KurtVertexAI({ vertexAI, model: "gemini-1.0-pro" }))
}

async function arrayFromAsync<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const array: T[] = []
  for await (const item of iter) array.push(item)
  return array
}

describe("KurtVertexAI", () => {
  test("isSupportedModel", () => {
    // For updating this test, the current list of models can be found at:
    // https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
    expect(KurtVertexAI.isSupportedModel("gemini-1.5-pro")).toBe(true)
    expect(KurtVertexAI.isSupportedModel("gemini-1.0-pro")).toBe(true)
    expect(KurtVertexAI.isSupportedModel("gemini-1.0-pro-vision")).toBe(false)

    expect(KurtVertexAI.isSupportedModel("bogus")).toBe(false)

    // The below code proves that the function works as a type guard.
    const modelName = "gemini-1.0-pro"
    if (KurtVertexAI.isSupportedModel(modelName)) {
      const modelNameGood: KurtVertexAISupportedModel = modelName
    }
  })

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
        tool_config: {
          function_calling_config: {
            mode: "ANY",
            allowed_function_names: ["structured_data"],
          },
        },
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
        tool_config: {
          function_calling_config: {
            mode: "ANY",
            allowed_function_names: ["structured_data"],
          },
        },
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
        tool_config: {
          function_calling_config: {
            mode: "ANY",
            allowed_function_names: ["structured_data"],
          },
        },
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
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: "subtract",
                description: req.tools.subtract.description,
                parameters: {
                  type: "object",
                  description: undefined,
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
                } as unknown as VertexAISchema,
              },
              {
                name: "divide",
                description: req.tools.divide.description,
                parameters: {
                  type: "object",
                  description: undefined,
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
                  name: "divide",
                  args: { dividend: 9876356, divisor: 30487 },
                },
              },
            ],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateWithOptionalTools(req))).toEqual([
      { chunk: '{"dividend":9876356,"divisor":30487}' },
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
        contents: [
          { role: "user", parts: [{ text: req.prompt }] },
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "divide",
                  args: { dividend: 9876356, divisor: 30487 },
                },
              },
            ],
          },
          {
            role: "model",
            parts: [
              {
                functionResponse: {
                  name: "divide",
                  response: { quotient: 323.95302915996984 },
                },
              },
            ],
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "subtract",
                description: req.tools.subtract.description,
                parameters: {
                  type: "object",
                  description: undefined,
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
                } as unknown as VertexAISchema,
              },
              {
                name: "divide",
                description: req.tools.divide.description,
                parameters: {
                  type: "object",
                  description: undefined,
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
                } as unknown as VertexAISchema,
              },
            ],
          },
        ],
      },
      [
        { content: { role: "model", parts: [{ text: "The answer" }] } },
        {
          content: {
            role: "model",
            parts: [{ text: ", rounded to the nearest integer, is 324." }],
          },
          // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
          finishReason: "STOP" as any,
        },
      ]
    )

    expect(await arrayFromAsync(kurt.generateWithOptionalTools(req))).toEqual([
      { chunk: "The answer" },
      { chunk: ", rounded to the nearest integer, is 324." },
      {
        finished: true,
        text: "The answer, rounded to the nearest integer, is 324.",
        data: undefined,
      },
    ])
  })
})
