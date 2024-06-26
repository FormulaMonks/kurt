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
  KurtSamplingOptions,
  KurtResult,
} from "@formula-monks/kurt"
import type {
  VertexAI,
  VertexAIGenerativeModel,
  VertexAIMessage,
  VertexAIRequest,
  VertexAIResponseChunk,
  VertexAIResponseChunkCandidate,
  VertexAIResponseFunctionCall,
  VertexAISchema,
  VertexAITool,
  VertexAIUsageMetadata,
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
    sampling: Required<KurtSamplingOptions>
    tools: { [key: string]: VertexAITool }
    forceTool?: string | undefined
  }): AsyncIterable<VertexAIResponseChunk> {
    const llm = this.options.vertexAI.getGenerativeModel({
      model: this.options.model,
    }) as VertexAIGenerativeModel

    const req: VertexAIRequest = {
      generationConfig: {
        maxOutputTokens: options.sampling.maxOutputTokens,
        temperature: options.sampling.temperature,
        topP: options.sampling.topP,
      },
      contents: options.messages,
    }

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

/**
 * Mutate the given JSON object (recursively) to remove the given key,
 * at every object within its deeply nested structure.
 */
function recursivelyRemoveJSONProperty<K extends string>(
  value: unknown,
  key: K
) {
  // Do nothing for non-objects (and no, null, you're not really an object).
  if (typeof value !== "object" || value === null) return

  // If it's an array, run recursively run on each element.
  if (Array.isArray(value)) {
    for (const child of value) recursivelyRemoveJSONProperty(child, key)
    return
  }

  // Otherwise, it's an object, so we can remove the property (if present).
  if (key in value) delete value[key as keyof typeof value]

  // And then we recursively run on each other property of the object.
  for (const child of Object.values(value)) {
    recursivelyRemoveJSONProperty(child, key)
  }
}

function jsonSchemaForVertexAI<T extends KurtSchemaInner>(
  zodSchema: KurtSchema<T>
) {
  // Vertex AI supports only a limited version of JSON schema,
  // so we need to make modifications here to make it work properly.
  const schema = zodToJsonSchema(zodSchema, { $refStrategy: "none" })
  schema.description = undefined
  recursivelyRemoveJSONProperty(schema, "additionalProperties")
  recursivelyRemoveJSONProperty(schema, "$schema")

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
  let lastRawEvent: VertexAIResponseChunk | undefined
  const chunks: string[] = []
  const functionCalls: VertexAIResponseFunctionCall[] = []

  for await (const rawEvent of rawEvents) {
    lastRawEvent = rawEvent

    const choice = rawEvent.candidates?.at(0)
    if (!choice) continue

    for (const part of choice.content.parts) {
      const { functionCall } = part
      if (functionCall) functionCalls.push(functionCall)

      const chunk = part.text
      if (chunk) {
        chunks.push(chunk)
        yield { chunk }
      }
    }
  }

  const rawEvent = lastRawEvent
  if (rawEvent) {
    const metadata = convertMetadata(rawEvent)

    if (schema) {
      const functionCall = functionCalls[0]
      if (!functionCall) throw new Error("Expected function call, but got none")
      if (functionCalls.length > 1)
        throw new Error(
          `Expected just function call, but got ${functionCalls.length}`
        )

      const data = applySchemaToFuzzyStructure(schema, functionCall) as D
      const text = JSON.stringify(data)
      yield { chunk: text }
      yield { finished: true, text, data, metadata }
    } else {
      const text = chunks.join("")
      yield {
        finished: true,
        text,
        data: undefined,
        metadata,
      } as KurtStreamEvent<D>
    }
    return // No need to send more events once we've sent a finished event
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
  let lastRawEvent: VertexAIResponseChunk | undefined
  const chunks: string[] = []
  const functionCalls: VertexAIResponseFunctionCall[] = []

  for await (const rawEvent of rawEvents) {
    lastRawEvent = rawEvent

    const choice = rawEvent.candidates?.at(0)
    if (!choice) continue

    for (const part of choice.content.parts) {
      const { functionCall } = part
      if (functionCall) functionCalls.push(functionCall)

      const chunk = part.text
      if (chunk) {
        chunks.push(chunk)
        yield { chunk }
      }
    }
  }

  const rawEvent = lastRawEvent
  if (rawEvent) {
    const metadata = convertMetadata(rawEvent)

    if (functionCalls.length >= 0) {
      const allData = functionCalls.map((functionCall) => {
        const { name } = functionCall

        const schema = tools[name]
        if (!schema) {
          throw new Error(
            `Vertex AI tried to call tool ${name} which isn't in the tool set ${JSON.stringify(
              Object.keys(tools)
            )}}`
          )
        }
        return {
          name,
          args: applySchemaToFuzzyStructure(schema, functionCall),
        } as D
      })

      // Emit a text chunk for each tool call (with line breaks in between).
      for (const [dataIndex, data] of allData.entries()) {
        if (dataIndex > 0) {
          chunks.push("\n")
          yield { chunk: "\n" }
        }
        const text = JSON.stringify(data.args)
        chunks.push(text)
        yield { chunk: text }
      }

      // if (!isNonEmptyArray(allData))
      //   throw new Error("Empty here is impossible but TS doesn't know it")
      const [data, ...additionalData] = allData
      const text = chunks.join("")

      if (additionalData.length > 0) {
        yield {
          finished: true,
          text,
          data: data as D,
          additionalData,
          metadata,
        }
      } else {
        yield { finished: true, text, data, metadata }
      }
    } else {
      const text = chunks.join("")
      yield { finished: true, text, data: undefined, metadata }
    }
    return // No need to send more events once we've sent a finished event
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

/**
 * Return true if this array has at least one element, also refining the
 * Typescript type to indicate that the first element won't be undefined.
 */
function isNonEmptyArray<T>(array: T[]): array is [T, ...T[]] {
  return array.length > 0
}

/**
 * Convert the raw metadata from Vertex AI into Kurt's metadata format.
 */
function convertMetadata(info: {
  usageMetadata?: VertexAIUsageMetadata
}): KurtResult["metadata"] {
  return {
    totalInputTokens: info.usageMetadata?.promptTokenCount,
    totalOutputTokens: info.usageMetadata?.candidatesTokenCount,
  }
}
