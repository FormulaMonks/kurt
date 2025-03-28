import "./VertexAI.patch.generateContentStream" // monkey-patches VertexAI GenerativeModel.prototype.generateContentStream
import zodToJsonSchema from "zod-to-json-schema"
import {
  type KurtAdapterV1,
  KurtCapabilityError,
  type KurtMessage,
  type KurtResult,
  KurtResultBlockedError,
  KurtResultLimitError,
  KurtResultValidateError,
  type KurtSamplingOptions,
  type KurtSchema,
  type KurtSchemaInner,
  type KurtSchemaInnerMap,
  type KurtSchemaInnerMaybe,
  type KurtSchemaMap,
  type KurtSchemaMapSingleResult,
  type KurtSchemaMaybe,
  type KurtSchemaResult,
  type KurtSchemaResultMaybe,
  type KurtStreamEvent,
  KurtTools,
  type RawToolInput,
} from "@formula-monks/kurt"
import type {
  VertexAI,
  VertexAIGenerativeModel,
  VertexAIMessage,
  VertexAIRequest,
  VertexAIResponseChunk,
  VertexAIResponseFunctionCall,
  VertexAISchema,
  VertexAITool,
  VertexAIUsageMetadata,
} from "./VertexAI.types"
import { ZodError } from "zod"
import type {
  FunctionDeclaration,
  GoogleSearchRetrievalTool,
} from "@google-cloud/vertexai"

// These models support function calling.
const COMPATIBLE_MODELS = [
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
] as const

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

type KurtVertexAITypeParams = {
  rawMessage: VertexAIMessage
  rawSchema: VertexAISchema
  rawTool: VertexAITool
  rawEvent: VertexAIResponseChunk
}

export class KurtVertexAI implements KurtAdapterV1<KurtVertexAITypeParams> {
  kurtAdapterVersion = "v1" as const

  constructor(private options: KurtVertexAICreateOptions) {}

  static isSupportedModel(model: string): model is KurtVertexAISupportedModel {
    return COMPATIBLE_MODELS.includes(model as KurtVertexAISupportedModel)
  }

  transformToRawMessages = toVertexAIMessages

  transformToRawSchema = jsonSchemaForVertexAI

  transformToRawTool = (
    tool: RawToolInput<KurtVertexAITypeParams>
  ): VertexAITool => {
    if (KurtTools.isKurtTool(tool)) {
      switch (tool.type) {
        case "web_search":
          return { googleSearchRetrieval: {} }
        default:
          throw new Error(`The tool ${tool} isn't supported by KurtVertexAI`)
      }
    }

    return tool
  }

  isFunctionDeclarationTool(tool: VertexAITool): tool is FunctionDeclaration {
    return "name" in tool && "parameters" in tool
  }

  isGoogleSearchRetrievalTool(
    tool: VertexAITool
  ): tool is GoogleSearchRetrievalTool {
    return "googleSearchRetrieval" in tool
  }

  generateRawEvents(options: {
    messages: VertexAIMessage[]
    sampling: Required<KurtSamplingOptions>
    tools: { [key: string]: VertexAITool }
    forceTool?: string | undefined
  }): AsyncIterable<VertexAIResponseChunk> {
    const llm = this.options.vertexAI.getGenerativeModel({
      model: this.options.model,
    }) as VertexAIGenerativeModel

    if (options.sampling.forceSchemaConstrainedTokens) {
      throw new KurtCapabilityError(
        this,
        "forceSchemaConstrainedTokens is not available for Vertex AI"
      )
    }

    // VertexAI requires that system messages be sent as a single message,
    // so we filter them out from the main messages array to send separately.
    const normalMessages = options.messages.filter((m) => m.role !== "system")
    const systemMessages = options.messages.filter((m) => m.role === "system")
    const singleSystemMessage: VertexAIMessage | undefined =
      systemMessages.length === 0
        ? undefined
        : {
            role: "system",
            parts: systemMessages.flatMap((m) => m.parts),
          }

    const req: VertexAIRequest = {
      generationConfig: {
        maxOutputTokens: options.sampling.maxOutputTokens,
        temperature: options.sampling.temperature,
        topP: options.sampling.topP,
      },
      contents: normalMessages,
      systemInstruction: singleSystemMessage,
    }

    const tools = Object.values(options.tools)

    if (tools.length > 0) {
      req.tools = []
      const functionDeclarations = tools.filter((t) =>
        this.isFunctionDeclarationTool(t)
      ) as FunctionDeclaration[]
      if (functionDeclarations.length) {
        req.tools.push({ functionDeclarations: functionDeclarations })
      }
      const searchTool = this.getSearchTool(tools)
      if (searchTool) {
        req.tools.push(searchTool)
      }
    }

    if (options.forceTool) {
      if (!req.generationConfig) throw new Error("Expected generationConfig")
      const toolFunction = options.tools[options.forceTool]
      if (!toolFunction) {
        throw new Error(
          `The tool ${options.forceTool} wasn't found in the tools list`
        )
      }

      if (!this.isFunctionDeclarationTool(toolFunction)) {
        throw new Error(
          `The tool ${options.forceTool} isn't a function declaration`
        )
      }

      req.tools = undefined
      req.generationConfig.responseMimeType = "application/json"
      req.generationConfig.responseSchema = toolFunction.parameters
    }

    const promise = llm.generateContentStreamPATCHED(req)

    async function* gen() {
      const { stream } = await promise
      for await (const chunk of stream) yield chunk
    }

    return gen()
  }

  private getSearchTool(
    tools: (FunctionDeclaration | GoogleSearchRetrievalTool)[]
  ) {
    return tools.find((t) => this.isGoogleSearchRetrievalTool(t)) as
      | GoogleSearchRetrievalTool
      | undefined
  }

  transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<undefined>> {
    return transformStream(this, undefined, rawEvents)
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    return transformStream(this, schema, rawEvents)
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<VertexAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    return transformStreamWithOptionalTools<
      I,
      KurtSchemaMap<I>,
      KurtSchemaMapSingleResult<I>
    >(this, tools, rawEvents)
  }
}

function toVertexAIMessages(messages: KurtMessage[]): VertexAIMessage[] {
  const vertexAIMessages: VertexAIMessage[] = []

  for (const message of messages) {
    const { role, text, toolCall, imageData, inlineData } = message
    if (text) {
      vertexAIMessages.push({ role, parts: [{ text }] })
    } else if (toolCall) {
      const { name, args, result } = toolCall
      const functionCall = { name, args }
      const functionResponse = { name, response: result }
      vertexAIMessages.push({ role, parts: [{ functionCall }] })
      vertexAIMessages.push({ role, parts: [{ functionResponse }] })
    } else if (imageData || inlineData) {
      const { mimeType, base64Data } = inlineData ?? imageData
      const dataPart = { mimeType, data: base64Data }
      vertexAIMessages.push({ role, parts: [{ inlineData: dataPart }] })
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

function parseSchemaResult<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
>(
  adapter: KurtVertexAI,
  schema: S,
  input: string | object
): object | undefined {
  if (!schema) return undefined

  const data = typeof input === "string" ? JSON.parse(input) : input
  try {
    return schema.parse(data)
  } catch (e) {
    if (e instanceof ZodError) {
      throw new KurtResultValidateError(
        adapter,
        schema,
        typeof input === "string" ? input : JSON.stringify(input),
        data,
        e
      )
    }
    throw e
  }
}

async function* transformStream<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
  D extends KurtSchemaResultMaybe<I>,
>(
  adapter: KurtVertexAI,
  schema: S,
  rawEvents: AsyncIterable<VertexAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D>> {
  const state = new StreamState(adapter)
  for await (const event of state.observeAndTransform(rawEvents)) yield event
  throwIfStreamWasInterrupted(state)

  const { chunks, lastRawEvent: rawEvent } = state
  const text = chunks.join("")
  if (rawEvent) {
    const metadata = convertMetadata(rawEvent)

    if (schema) {
      yield { chunk: text }
      yield {
        finished: true,
        text,
        data: parseSchemaResult(adapter, schema, text) as D,
        metadata,
      }
    } else {
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
  adapter: KurtVertexAI,
  tools: S,
  rawEvents: AsyncIterable<VertexAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D | undefined>> {
  const state = new StreamState(adapter)
  for await (const event of state.observeAndTransform(rawEvents)) yield event
  throwIfStreamWasInterrupted(state)

  const { chunks, functionCalls, lastRawEvent: rawEvent } = state
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

        if (KurtTools.isKurtTool(schema)) {
          throw new Error(
            `Vertex AI tried to call a KurtTool ${name} which it shouldn't have`
          )
        }

        return {
          name,
          args: parseSchemaResult(adapter, schema, functionCall.args),
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

class StreamState {
  lastRawEvent: VertexAIResponseChunk | undefined
  readonly chunks: string[] = []
  readonly functionCalls: VertexAIResponseFunctionCall[] = []

  constructor(readonly adapter: KurtVertexAI) {}

  async *observeAndTransform(rawEvents: AsyncIterable<VertexAIResponseChunk>) {
    for await (const rawEvent of rawEvents) {
      this.lastRawEvent = rawEvent

      const choice = rawEvent.candidates?.at(0)
      if (!choice) continue

      for (const part of choice.content.parts) {
        const { functionCall } = part
        if (functionCall) this.functionCalls.push(functionCall)

        const chunk = part.text
        if (chunk) {
          this.chunks.push(chunk)
          yield { chunk }
        }
      }
    }
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
 * Throw a relevant `KurtResultError` if the stream was interrupted
 * for any (foreseeable) reason.
 */
function throwIfStreamWasInterrupted(state: StreamState) {
  const finishReason = state.lastRawEvent?.candidates?.at(0)?.finishReason
  switch (finishReason) {
    case undefined:
    case "STOP":
    case "FINISH_REASON_UNSPECIFIED":
      return // (no error thrown here)

    case "MAX_TOKENS":
      throw new KurtResultLimitError(state.adapter, state.chunks.join(""))

    default:
      // Google blocks results for all kinds of varied reasons, and Kurt
      // doesn't try to enumerate all of them in its error classes,
      // particularly because the Google categories seem to overlap in
      // potentially nebulous and under-specified ways.
      // Therefore we lump them all together as `KurtResultBlockedError`,
      // and just include the original finish reason as context.
      throw new KurtResultBlockedError(
        state.adapter,
        state.chunks.join(""),
        finishReason
      )
  }
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
