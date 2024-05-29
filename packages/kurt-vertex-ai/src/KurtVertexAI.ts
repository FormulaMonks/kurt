import "./VertexAI.patch.generateContentStream" // monkey-patches VertexAI GenerativeModel.prototype.generateContentStream

import zodToJsonSchema from "zod-to-json-schema"
import type {
  KurtAdapterV1,
  KurtStreamEvent,
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaInnerMaybe,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaMaybe,
  KurtSchemaResult,
  KurtSchemaResultMaybe,
  KurtMessage,
} from "@formula-monks/kurt"
import type {
  VertexAI,
  VertexAIGenerativeModel,
  VertexAIMessage,
  VertexAIRequest,
  VertexAIResponseChunk,
  VertexAISchema,
  VertexAITool,
} from "./VertexAI.types"

// These models support function calling.
const COMPATIBLE_MODELS = ["gemini-1.0-pro", "gemini-1.5-pro"] as const

export type KurtVertexAISupportedModel = (typeof COMPATIBLE_MODELS)[number]

export type KurtVertexAICreateOptions = {
  /**
   * The Vertex AI model to use as an underlying LLM for Kurt
   *
   * These models support function calling, which is necessary for Kurt to
   * force generation of structured data.
   */
  model: KurtVertexAISupportedModel

  /**
   * The properly authenticated Vertex AI instance to use as a connection
   * to the upstream Vertex AI service that serves up the LLM as an API.
   *
   * For more information on how to set this up, refer to the [Vertex AI SDK
   * README](https://github.com/googleapis/nodejs-vertexai/blob/main/README.md).
   */
  vertexAI: VertexAI
}

export class KurtVertexAI
  implements
    KurtAdapterV1<{
      rawMessage: VertexAIMessage
      rawSchema: VertexAISchema
      rawTool: VertexAITool
      rawEvent: VertexAIResponseChunk
    }>
{
  kurtAdapterVersion = "v1" as const

  constructor(private options: KurtVertexAICreateOptions) {}

  static isSupportedModel(model: string): model is KurtVertexAISupportedModel {
    return COMPATIBLE_MODELS.includes(model as KurtVertexAISupportedModel)
  }

  transformToRawMessages = toVertexAIMessages

  transformToRawSchema = jsonSchemaForVertexAI

  transformToRawTool = (tool: VertexAITool) => tool

  generateRawEvents(options: {
    messages: VertexAIMessage[]
    tools: { [key: string]: VertexAITool }
    forceTool?: string | undefined
  }): AsyncIterable<VertexAIResponseChunk> {
    const llm = this.options.vertexAI.getGenerativeModel({
      model: this.options.model,
    }) as VertexAIGenerativeModel

    const req: VertexAIRequest = { contents: options.messages }

    const tools = Object.values(options.tools)
    if (tools.length > 0) req.tools = [{ functionDeclarations: tools }]

    if (options.forceTool)
      req.tool_config = {
        function_calling_config: {
          mode: "ANY",
          allowed_function_names: [options.forceTool],
        },
      }

    const promise = llm.generateContentStreamPATCHED(req)

    async function* gen() {
      const { stream } = await promise
      for await (const chunk of stream) yield chunk
    }

    return gen()
  }

  transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<undefined>> {
    return transformStream(undefined, rawEvents)
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    return transformStream(schema, rawEvents)
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    return transformStreamWithOptionalTools<
      I,
      KurtSchemaMap<I>,
      KurtSchemaMapSingleResult<I>
    >(tools, rawEvents)
  }
}

function toVertexAIMessages(messages: KurtMessage[]): VertexAIMessage[] {
  const vertexAIMessages: VertexAIMessage[] = []

  for (const message of messages) {
    const { role, text, toolCall } = message
    if (text) {
      vertexAIMessages.push({ role, parts: [{ text }] })
    } else if (toolCall) {
      const { name, args, result } = toolCall
      const functionCall = { name, args }
      const functionResponse = { name, response: result }
      vertexAIMessages.push({ role, parts: [{ functionCall }] })
      vertexAIMessages.push({ role, parts: [{ functionResponse }] })
    } else {
      throw new Error(`Invalid KurtMessage: ${JSON.stringify(message)}`)
    }
  }

  return vertexAIMessages
}

function jsonSchemaForVertexAI<T extends KurtSchemaInner>(
  zodSchema: KurtSchema<T>
) {
  // Vertex AI supports only a limited version of JSON schema,
  // so we need to make modifications here to make it work properly.
  const schema = zodToJsonSchema(zodSchema, {
    $refStrategy: "none",
  })

  schema.description = undefined

  // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
  function removeAdditionalProperties(obj: any) {
    if (typeof obj !== "object") return obj
    if (Array.isArray(obj)) return obj.forEach(removeAdditionalProperties)
    for (const [key, value] of Object.entries(obj)) {
      if (key === "additionalProperties") delete obj[key]
      removeAdditionalProperties(value)
    }
  }
  removeAdditionalProperties(schema)

  // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
  function removeDollarSchema(obj: any) {
    if (typeof obj !== "object") return obj
    if (Array.isArray(obj)) return obj.forEach(removeDollarSchema)
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$schema") delete obj[key]
      removeDollarSchema(value)
    }
  }
  removeDollarSchema(schema)

  return schema as VertexAISchema
}

async function* transformStream<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
  D extends KurtSchemaResultMaybe<I>,
>(
  schema: S,
  rawEvents: AsyncIterable<VertexAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D>> {
  const chunks: string[] = []

  for await (const rawEvent of rawEvents) {
    const choice = rawEvent.candidates?.at(0)
    if (!choice) continue

    const isContentFinal = choice.finishReason !== undefined
    const { parts } = choice.content

    for (const [partIndex, part] of parts.entries()) {
      const chunk = part.text
      const isFinal =
        (isContentFinal && partIndex === parts.length - 1) || part.functionCall

      if (chunk) {
        chunks.push(chunk)
        yield { chunk }
      }
      if (isFinal) {
        if (schema) {
          const { functionCall } = part
          if (!functionCall) {
            throw new Error(
              `Expected function call in final chunk, but got ${JSON.stringify(
                part
              )}`
            )
          }
          const data = applySchemaToFuzzyStructure(schema, functionCall) as D
          const text = JSON.stringify(data)
          yield { chunk: text }
          yield { finished: true, text, data }
        } else {
          const text = chunks.join("")
          yield { finished: true, text, data: undefined } as KurtStreamEvent<D>
        }
        return // No need to send more events once we've sent a finished event
      }
    }
  }
}

async function* transformStreamWithOptionalTools<
  I extends KurtSchemaInnerMap,
  S extends KurtSchemaMap<I>,
  D extends KurtSchemaMapSingleResult<I>,
>(
  tools: S,
  rawEvents: AsyncIterable<VertexAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D | undefined>> {
  const chunks: string[] = []

  for await (const rawEvent of rawEvents) {
    const choice = rawEvent.candidates?.at(0)
    if (!choice) continue

    const isContentFinal = choice.finishReason !== undefined
    const { parts } = choice.content

    for (const [partIndex, part] of parts.entries()) {
      const chunk = part.text
      const isFinal =
        (isContentFinal && partIndex === parts.length - 1) || part.functionCall

      if (chunk) {
        chunks.push(chunk)
        yield { chunk }
      }
      if (isFinal) {
        const { functionCall } = part
        if (functionCall) {
          const { name } = functionCall
          const schema = tools[name]
          if (!schema) {
            throw new Error(
              `Vertex AI tried to call tool ${name} which isn't in the tool set ${JSON.stringify(
                Object.keys(tools)
              )}}`
            )
          }
          const data = {
            name,
            args: applySchemaToFuzzyStructure(schema, functionCall),
          } as D
          const text = JSON.stringify(data.args)
          yield { chunk: text }
          yield { finished: true, text, data }
        } else {
          const text = chunks.join("")
          yield { finished: true, text, data: undefined }
        }
        return // No need to send more events once we've sent a finished event
      }
    }
  }
}

// Vertex AI sometimes gives wonky results that are nested weirdly.
// This function tries to account for the different scenarios we've seen.
//
// If a new scenario is seen, we can add a test for it in KurtVertexAI.spec.ts
// and then add new logic here as needed to handle the new scenario.
function applySchemaToFuzzyStructure<I extends KurtSchemaInner>(
  schema: KurtSchema<I>,
  input: { name: string; args: object }
): KurtSchemaResult<I> {
  const { name, args } = input

  try {
    // First, try the most obvious case.
    return schema.parse(args)
  } catch (firstParseError) {
    // Okay, if that didn't work, we'll try some alternative strategies here.

    // Sometimes the args are double-nested...
    if ("args" in args) {
      try {
        return schema.parse(args.args)
      } catch {}
    }

    // If all the alternative strategies failed, throw the original error.
    throw firstParseError
  }
}
