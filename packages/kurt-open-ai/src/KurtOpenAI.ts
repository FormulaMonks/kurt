import { zodToJsonSchema } from "zod-to-json-schema"
import {
  type KurtAdapterV1,
  KurtCapabilityError,
  KurtInvalidInputSchemaError,
  type KurtMessage,
  KurtRequestError,
  type KurtResult,
  KurtResultBlockedError,
  KurtResultLimitError,
  KurtResultParseError,
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
  OpenAI,
  OpenAIMessage,
  OpenAIRequest,
  OpenAIResponseChunk,
  OpenAISchema,
  OpenAITool,
} from "./OpenAI.types"
import { ZodError } from "zod"
import type {
  EasyInputMessage,
  ResponseInputMessageContentList,
} from "openai/src/resources/responses/responses"
import type {
  Response,
  ResponseInputText,
} from "openai/resources/responses/responses"
import { BadRequestError } from "openai"

// These models support function calling.
const COMPATIBLE_MODELS = [
  "gpt-4o",
  "gpt-4o-2024-11-20",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-turbo-preview",
  "gpt-4-0125-preview",
  "gpt-4-1106-preview",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
] as const

export type KurtOpenAISupportedModel = (typeof COMPATIBLE_MODELS)[number]

export type KurtOpenAICreateOptions = {
  /**
   * The OpenAI model to use as an underlying LLM for Kurt.
   *
   * These models support function calling, which is necessary for Kurt to
   * force generation of structured data.
   */
  model: KurtOpenAISupportedModel

  /**
   * The properly authenticated OpenAI instance to use as a connection
   * to the upstream OpenAI service that serves up the LLM as an API.
   *
   * For more information on how to set this up, refer to the [OpenAI API
   * reference](https://platform.openai.com/docs/api-reference/authentication).
   */
  openAI: OpenAI
}

type KurtOpenAiAdapterTypeParams = {
  rawMessage: OpenAIMessage
  rawSchema: OpenAISchema
  rawTool: OpenAITool
  rawEvent: OpenAIResponseChunk
}

export class KurtOpenAI implements KurtAdapterV1<KurtOpenAiAdapterTypeParams> {
  kurtAdapterVersion = "v1" as const

  constructor(private options: KurtOpenAICreateOptions) {}

  static isSupportedModel(model: string): model is KurtOpenAISupportedModel {
    return COMPATIBLE_MODELS.includes(model as KurtOpenAISupportedModel)
  }

  static isSupportedModelForSchemaConstrainedTokens(model: string): boolean {
    if (!KurtOpenAI.isSupportedModel(model)) return false
    // gpt-4-* models do NOT support schema-constrained tokens
    if (model.startsWith("gpt-4-")) return false
    // gpt-3.5-* models do NOT support schema-constrained tokens
    if (model.startsWith("gpt-3.5-")) return false
    // gpt-4o-2024-05-13 does NOT support schema-constrained tokens
    if (model === "gpt-4o-2024-05-13") return false

    // Other supported models do support schema-constrained tokens.
    return true
  }

  /**
   * Throw an error if the model doesn't support schema constrained tokens.
   */
  private checkModelForSchemaConstrainedTokens(model: string) {
    if (!KurtOpenAI.isSupportedModelForSchemaConstrainedTokens(model))
      throw new KurtCapabilityError(
        this,
        [
          "forceSchemaConstrainedTokens",
          "is not available for older models, including",
          model,
        ].join(" ")
      )
  }

  transformToRawMessages = toOpenAIMessages

  transformToRawSchema = zodToJsonSchema

  transformToRawTool(
    tool: RawToolInput<KurtOpenAiAdapterTypeParams>
  ): OpenAITool {
    if (KurtTools.isKurtTool(tool)) {
      return { type: "web_search_preview" }
    }
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }
  }

  generateRawEvents(options: {
    messages: OpenAIMessage[]
    sampling: Required<KurtSamplingOptions>
    tools: { [key: string]: OpenAITool }
    forceTool?: string
  }): AsyncIterable<OpenAIResponseChunk> {
    const req: OpenAIRequest = {
      stream: true,
      store: false,
      model: this.options.model,
      max_output_tokens: options.sampling.maxOutputTokens,
      temperature: options.sampling.temperature,
      top_p: options.sampling.topP,
      input: options.messages,
    }

    const tools = Object.values(options.tools)
    if (tools.length > 0) req.tools = tools

    if (options.sampling.forceSchemaConstrainedTokens) {
      this.checkModelForSchemaConstrainedTokens(this.options.model)

      // Mark all tools as strict, enabling schema-constrained token sampling.
      for (const tool of tools) {
        if (tool.type === "function") {
          tool.strict = true
        }
      }
    }

    if (options.forceTool) {
      const toolFunction = options.tools[options.forceTool]
      if (!toolFunction) {
        throw new Error(
          `The tool ${options.forceTool} wasn't found in the tools list`
        )
      }
      if (toolFunction.type !== "function") {
        throw new Error(`The tool ${options.forceTool} isn't a function tool`)
      }

      if (options.sampling.forceSchemaConstrainedTokens) {
        // Forcing a particular tool with schema-constrained tokens is treated
        // as a special case of the response format, instead of a tool call.
        req.tools = undefined
        req.tool_choice = "auto"
        req.text = {
          format: {
            name: toolFunction.name,
            description:
              toolFunction.description === null
                ? undefined
                : toolFunction.description,
            type: "json_schema",
            strict: true,
            schema: toolFunction.parameters,
          },
        }
      } else {
        req.tool_choice = {
          type: "function",
          name: options.forceTool,
        }
        // If we're not using schema-constrained tokens, we can at least use
        // JSON-constrained token sampling to force the tool call as valid JSON.
        req.text = { format: { type: "json_object" } }

        // OpenAI requires us to use the word JSON at least once in the prompt
        // messages when forcing JSON-constrained token sampling.
        // Therefore, we may need to add it here.
        if (!doesMessageListContainSubstring(options.messages, "JSON")) {
          req.input = withInjectedSystemPromptLine(
            options.messages,
            "Respond with JSON."
          )
        }
      }
    }

    const promise = this.options.openAI.responses.create(req)

    // Convert the promise of an async iterable to just an async iterable.
    async function* gen(adapter: KurtOpenAI) {
      try {
        const stream: AsyncIterable<OpenAIResponseChunk> = await promise
        for await (const chunk of stream) yield chunk
      } catch (e) {
        if (e instanceof BadRequestError) {
          switch (e.code) {
            case "integer_below_min_value": {
              if (e.param === "max_output_tokens") {
                throw new KurtResultLimitError(
                  adapter,
                  "The maximum output tokens limit was below the minimum value"
                )
              }
              break
            }
            case "invalid_function_parameters":
              throw new KurtInvalidInputSchemaError(adapter, e.message)
          }
        }
        throw new KurtRequestError(adapter, e as Error)
      }
    }

    return gen(this)
  }

  transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<OpenAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<undefined>> {
    return transformStream(this, undefined, rawEvents)
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<OpenAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    return transformStream(this, schema, rawEvents)
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<OpenAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    return transformStreamWithOptionalTools<
      I,
      KurtSchemaMap<I>,
      KurtSchemaMapSingleResult<I>
    >(this, tools, rawEvents)
  }
}

const openAIRoleMapping = {
  model: "assistant",
  system: "system",
  user: "user",
} as const satisfies Record<KurtMessage["role"], EasyInputMessage["role"]>

function isTextMessage(message?: OpenAIMessage): message is EasyInputMessage {
  return message !== undefined && message.type === "message"
}

function toOpenAIMessages(messages: KurtMessage[]): OpenAIMessage[] {
  const openAIMessages: OpenAIMessage[] = []
  const addMessage = (message: OpenAIMessage) => {
    // If we have two messages with the `user` role, we must combine them
    // into a multi-part message (a constraint which presumably made sense
    // to some OpenAI engineer at some time, but is now totally inscrutable).
    const lastMessage = openAIMessages[openAIMessages.length - 1]
    if (
      isTextMessage(lastMessage) &&
      lastMessage.role === "user" &&
      isTextMessage(message) &&
      message.role === "user"
    ) {
      const lastContent: ResponseInputMessageContentList =
        typeof lastMessage.content === "string"
          ? [
              {
                type: "input_text",
                text: lastMessage.content,
              },
            ]
          : lastMessage.content
      const nextContent = message.content
      for (const part of nextContent) {
        if (typeof part === "string") {
          lastContent.push({ type: "input_text", text: part })
        } else {
          lastContent.push(part)
        }
      }
    } else {
      openAIMessages.push(message)
    }
  }

  for (const [messageIndex, message] of messages.entries()) {
    const { text, toolCall, imageData, inlineData } = message
    if (text) {
      const role = openAIRoleMapping[message.role]

      if (role === "user") {
        addMessage({ role, content: [{ type: "input_text", text }] })
      } else {
        addMessage({ role, content: text })
      }
    } else if (toolCall) {
      const { name, args, result } = toolCall

      // OpenAI supports parallel tool calling, so it expects each tool call
      // and response to be associated by a unique id it gives to each.
      //
      // Kurt doesn't support parallel tool calling (because it isn't
      // supported by the other LLMs that Kurt needs to be compatible with),
      // so the id is useless to us and we don't require the user to track it.
      //
      // We generate a simple sequential id here to satisfy OpenAI's API.
      const id = `call_${messageIndex}`
      addMessage({
        name: name,
        call_id: id,
        type: "function_call",
        arguments: JSON.stringify(args),
        status: "completed",
      })

      addMessage({
        call_id: id,
        type: "function_call_output",
        status: "completed",
        output: JSON.stringify(result),
      })
    } else if ((imageData || inlineData) && message.role === "user") {
      const { mimeType, base64Data } = inlineData ?? imageData

      // OpenAI only supports the following MIME types, according to these docs:
      // https://platform.openai.com/docs/guides/vision
      if (!mimeType.match(/^image\/(jpeg|png|webp|gif)$/))
        throw new Error(`Unsupported image MIME type: ${mimeType}`) // TODO: Use a subclass of KurtError

      const url = `data:${mimeType};base64,${base64Data}`
      addMessage({
        role: "user", // only supported for the user role
        content: [{ type: "input_image", image_url: url, detail: "auto" }],
      })
    } else {
      throw new Error(`Unsupported KurtMessage: ${JSON.stringify(message)}`) // TODO: Use a subclass of KurtError
    }
  }

  return openAIMessages
}

async function* transformStream<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
  D extends KurtSchemaResultMaybe<I>,
>(
  adapter: KurtOpenAI,
  schema: S,
  rawEvents: AsyncIterable<OpenAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D>> {
  const state = new StreamState(adapter)
  for await (const event of state.observeAndTransform(rawEvents)) yield event
  throwIfStreamWasInterrupted(state)

  const { textChunks, lastRawEvent: rawEvent, lastResponse } = state
  if (rawEvent) {
    const text = textChunks.join("")
    const metadata = convertMetadata(lastResponse)

    if (schema) {
      const data = parseAndValidateData(adapter, schema, text) as D
      yield { finished: true, text, data, metadata }
    } else {
      const data = undefined
      yield { finished: true, text, data, metadata } as KurtStreamEvent<D>
    }
  }
}

async function* transformStreamWithOptionalTools<
  I extends KurtSchemaInnerMap,
  S extends KurtSchemaMap<I>,
  D extends KurtSchemaMapSingleResult<I>,
>(
  adapter: KurtOpenAI,
  tools: S,
  rawEvents: AsyncIterable<OpenAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D | undefined>> {
  const state = new StreamState(adapter)
  for await (const event of state.observeAndTransform(rawEvents)) yield event
  throwIfStreamWasInterrupted(state)

  const {
    textChunks,
    dataChunks,
    functionNames,
    lastRawEvent: rawEvent,
    lastResponse,
  } = state
  if (rawEvent) {
    const metadata = convertMetadata(lastResponse)

    const text = textChunks.join("")
    if (dataChunks.length > 0) {
      const allData: D[] = dataChunks.map((chunks, index) => {
        const name = functionNames[index]
        if (!name)
          throw new Error("OpenAI tried to call a tool with no function name")

        const schema = tools[name]
        if (!schema) {
          throw new Error(
            `OpenAI tried to call tool ${name} which isn't in the tool set ${JSON.stringify(
              Object.keys(tools)
            )}}`
          )
        }
        if (KurtTools.isKurtTool(schema)) {
          throw new Error(
            `OpenAI tried to call a tool '${name}' that is not a function tool`
          )
        }

        return {
          name,
          args: parseAndValidateData(adapter, schema, chunks.join("")),
        } as D
      })

      if (!isNonEmptyArray(allData))
        throw new Error("Empty here is impossible but TS doesn't know it")

      // This is how we split parallel tool calls from each other.
      // It is important to filter the undefined values out, because
      // when we use mix built-in tools and custom tools, the custom tools
      // get called in unordered way, so we end up with undefined values
      // in the all data array.
      const [data, ...additionalData] = allData.filter((d) => !!d)

      if (additionalData.length > 0) {
        yield { finished: true, text, data, additionalData, metadata }
      } else {
        yield { finished: true, text, data, metadata }
      }
    } else {
      yield { finished: true, text, data: undefined, metadata }
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

class StreamState {
  readonly textChunks: string[] = []
  readonly dataChunks: string[][] = []
  readonly functionNames: string[] = []
  finishReason: string | undefined
  lastRawEvent: OpenAIResponseChunk | undefined
  lastResponse: Response | undefined

  constructor(readonly adapter: KurtOpenAI) {}

  getFinishedReason(response: Response): string {
    if (response.error) {
      return `${response.error.code}: ${response.error.message}`
    }
    if (response.incomplete_details?.reason) {
      return response.incomplete_details.reason
    }
    return response.status ?? "unknown"
  }

  async *observeAndTransform(rawEvents: AsyncIterable<OpenAIResponseChunk>) {
    for await (const event of rawEvents) {
      this.lastRawEvent = event

      switch (event.type) {
        case "response.completed":
        case "response.failed":
        case "response.incomplete":
        case "response.in_progress":
          this.lastResponse = event.response
          this.finishReason = this.getFinishedReason(event.response)
          break
        case "error":
          this.finishReason = `${event.code}: ${event.message}.${event.param ? ` (${event.param})` : ""}`
          break
        case "response.output_text.delta": {
          const textChunk = event.delta
          if (textChunk) {
            this.textChunks.push(textChunk)
            yield { chunk: textChunk }
          }
          break
        }

        case "response.output_item.done": {
          if (event.item.type === "function_call") {
            const index = event.output_index
            this.functionNames[index] = event.item.name
            if (event.item.arguments) {
              // biome-ignore lint/suspicious/noAssignInExpressions: this single-line lazy initialization pattern is good, actually
              ;(this.dataChunks[index] ||= []).push(event.item.arguments)
              this.textChunks.push(event.item.arguments)
              yield { chunk: event.item.arguments }
            } else if (index > 0) {
              // Insert a line break chunk in between parallel tool calls.
              const lineBreakChunk = "\n"
              this.textChunks.push(lineBreakChunk)
              yield { chunk: lineBreakChunk }
            }
          }

          break
        }

        // All other event types currently have no special handling
        default:
          break
      }
    }
  }
}

/**
 * Throw a relevant `KurtResultError` if the stream was interrupted
 * for any (foreseeable) reason.
 */
function throwIfStreamWasInterrupted(state: StreamState) {
  const finishReason = state.finishReason
  switch (finishReason) {
    case "content_filter":
      // For troubleshooting OpenAI's filter, note that they have an [endpoint](
      // https://platform.openai.com/docs/guides/moderation/overview) where you
      // can check what kind of "harm" categories are getting triggered for
      // a given chunk of content.
      throw new KurtResultBlockedError(
        state.adapter,
        state.textChunks.join(""),
        finishReason
      )
  }
}

/**
 * Parse the argument data from a tool call.
 */
function parseData(adapter: KurtOpenAI, text: string) {
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    if (error instanceof SyntaxError)
      throw new KurtResultParseError(adapter, text, error)

    throw error // (re-throw all other errors)
  }
}

/**
 * Parse and validate the structured data from a tool call.
 */
function parseAndValidateData<I extends KurtSchemaInner>(
  adapter: KurtOpenAI,
  schema: KurtSchema<I>,
  text: string
): KurtSchemaResult<I> {
  const rawData = parseData(adapter, text)

  try {
    return schema.parse(rawData)
  } catch (error: unknown) {
    if (error instanceof ZodError)
      throw new KurtResultValidateError(adapter, schema, text, rawData, error)

    throw error // (re-throw all other errors)
  }
}

/**
 * Convert the raw metadata from an OpenAI event into Kurt's metadata format.
 */
function convertMetadata(response?: Response) {
  const metadata: KurtResult["metadata"] = {}
  if (response?.usage) {
    metadata.totalInputTokens = response.usage?.input_tokens
    metadata.totalOutputTokens = response.usage.output_tokens
  }
  if (response?.model) {
    metadata.systemFingerprint = response.model
  }
  return metadata
}

/**
 * Return true if any of the messages contain the given substring.
 */
function doesMessageListContainSubstring(
  messages: OpenAIMessage[],
  substring: string
) {
  for (const message of messages) {
    const content = isTextMessage(message) ? message.content : undefined
    if (!content) continue

    if (typeof content === "string") {
      if (content.includes(substring)) return true
      continue
    }

    for (const part of content) {
      if ("text" in part && part.text?.includes(substring)) return true
    }
  }

  return false
}

/**
 * Return a new list of messages with the given system prompt line injected.
 */
function withInjectedSystemPromptLine(
  messages: readonly OpenAIMessage[],
  systemPromptLine: string
): OpenAIMessage[] {
  // Find an existing system prompt to modify.
  const existingSystemPrompt = messages.find(
    (message) => isTextMessage(message) && message.role === "system"
  ) as EasyInputMessage | undefined

  // If there is no existing system prompt, we'll simply add one
  // that contains only the new desired line.
  if (!existingSystemPrompt) {
    return [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPromptLine }],
      },
      ...messages,
    ]
  }

  // If there is an existing system prompt, we'll modify it to include
  // the new desired line as part of the last content part.
  const existingParts: ResponseInputText[] =
    typeof existingSystemPrompt.content === "string"
      ? [{ type: "input_text", text: existingSystemPrompt.content }]
      : (existingSystemPrompt.content as ResponseInputText[])

  const lastPart = existingParts[existingParts.length - 1] ?? { text: "" }
  const priorParts = existingParts.slice(0, -1)
  const newParts: ResponseInputText[] = [
    ...priorParts,
    { type: "input_text", text: `${lastPart?.text}\n${systemPromptLine}` },
  ]
  return messages.map(
    (message): OpenAIMessage =>
      message === existingSystemPrompt
        ? { ...message, content: newParts }
        : message
  )
}
