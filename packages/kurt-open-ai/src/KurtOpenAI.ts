import { zodToJsonSchema } from "zod-to-json-schema"
import {
  type KurtAdapterV1,
  type KurtMessage,
  type KurtStreamEvent,
  type KurtSchemaInner,
  type KurtSchemaInnerMap,
  type KurtSchemaInnerMaybe,
  type KurtSchemaMap,
  type KurtSchemaMapSingleResult,
  type KurtSchemaMaybe,
  type KurtSchemaResult,
  type KurtSchemaResultMaybe,
  type KurtSchema,
  type KurtSamplingOptions,
  type KurtResult,
  KurtResultLimitError,
  KurtResultBlockedError,
  KurtResultParseError,
  KurtResultValidateError,
  KurtCapabilityError,
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

export class KurtOpenAI
  implements
    KurtAdapterV1<{
      rawMessage: OpenAIMessage
      rawSchema: OpenAISchema
      rawTool: OpenAITool
      rawEvent: OpenAIResponseChunk
    }>
{
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

  transformToRawTool(tool: OpenAITool["function"]): OpenAITool {
    return { type: "function", function: tool } as OpenAITool
  }

  generateRawEvents(options: {
    messages: OpenAIMessage[]
    sampling: Required<KurtSamplingOptions>
    tools: { [key: string]: OpenAITool }
    forceTool?: string
  }): AsyncIterable<OpenAIResponseChunk> {
    const req: OpenAIRequest = {
      stream: true,
      stream_options: { include_usage: true },
      model: this.options.model,
      max_tokens: options.sampling.maxOutputTokens,
      temperature: options.sampling.temperature,
      top_p: options.sampling.topP,
      messages: options.messages,
    }

    const tools = Object.values(options.tools)
    if (tools.length > 0) req.tools = tools

    if (options.sampling.forceSchemaConstrainedTokens) {
      this.checkModelForSchemaConstrainedTokens(this.options.model)

      // Mark all tools as strict, enabling schema-constrained token sampling.
      for (const tool of tools) tool.function.strict = true
    }

    if (options.forceTool) {
      const toolFunction = options.tools[options.forceTool]?.function
      if (!toolFunction)
        throw new Error(
          `The tool ${options.forceTool} wasn't found in the tools list`
        )

      if (options.sampling.forceSchemaConstrainedTokens) {
        // Forcing a particular tool with schema-constrained tokens is treated
        // as a special case of the response format, instead of a tool call.
        req.tools = undefined
        req.response_format = {
          type: "json_schema",
          json_schema: {
            strict: true,
            name: toolFunction.name,
            description: toolFunction.description,
            schema: toolFunction.parameters,
          },
        }
      } else {
        req.tool_choice = {
          type: "function",
          function: { name: options.forceTool },
        }
        // If we're not using schema-constrained tokens, we can at least use
        // JSON-constrained token sampling to force the tool call as valid JSON.
        req.response_format = { type: "json_object" }

        // OpenAI requires us to use the word JSON at least once in the prompt
        // messages when forcing JSON-constrained token sampling.
        // Therefore we may need to add it here.
        if (!doesMessageListContainSubstring(options.messages, "JSON")) {
          req.messages = withInjectedSystemPromptLine(
            options.messages,
            "Respond with JSON."
          )
        }
      }
    }

    const promise = this.options.openAI.chat.completions.create(req)

    // Convert the promise of an async iterable to just an async iterable.
    async function* gen() {
      const stream: AsyncIterable<OpenAIResponseChunk> = await promise
      for await (const chunk of stream) yield chunk
    }

    return gen()
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
} as const satisfies Record<KurtMessage["role"], OpenAIMessage["role"]>

function toOpenAIMessages(messages: KurtMessage[]): OpenAIMessage[] {
  const openAIMessages: OpenAIMessage[] = []
  const addMessage = (message: OpenAIMessage) => {
    // If we have two messages with the `user` role, we must combine them
    // into a multi-part message (a constraint which presumably made sense
    // to some OpenAI engineer at some time, but is now totally inscrutable).
    const lastMessage = openAIMessages[openAIMessages.length - 1]
    if (lastMessage && lastMessage.role === "user" && message.role === "user") {
      const lastContent = lastMessage.content
      const nextContent = message.content
      for (const part of nextContent) lastContent.push(part)
    } else {
      openAIMessages.push(message)
    }
  }

  for (const [messageIndex, message] of messages.entries()) {
    const { text, toolCall, imageData, audioData } = message
    if (audioData) throw new Error("Unsupported audio data for OpenAI") // TODO: Use a subclass of KurtError

    if (text) {
      const role = openAIRoleMapping[message.role]

      if (role === "user") {
        addMessage({ role, content: [{ type: "text", text }] })
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
        role: "assistant",
        tool_calls: [
          {
            id,
            type: "function" as const,
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      })
      addMessage({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(result),
      })
    } else if (imageData && message.role === "user") {
      const { mimeType, base64Data } = imageData

      // OpenAI only supports the following MIME types, according to these docs:
      // https://platform.openai.com/docs/guides/vision
      if (!mimeType.match(/^image\/(jpeg|png|webp|gif)$/))
        throw new Error(`Unsupported image MIME type: ${mimeType}`) // TODO: Use a subclass of KurtError

      const url = `data:${mimeType};base64,${base64Data}`
      addMessage({
        role: "user", // only supported for the user role
        content: [{ type: "image_url", image_url: { url } }],
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

  const { textChunks, lastRawEvent: rawEvent } = state
  if (rawEvent) {
    const text = textChunks.join("")
    const metadata = convertMetadata(rawEvent)

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
  } = state
  if (rawEvent) {
    const metadata = convertMetadata(rawEvent)

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

        return {
          name,
          args: parseAndValidateData(adapter, schema, chunks.join("")),
        } as D
      })

      if (!isNonEmptyArray(allData))
        throw new Error("Empty here is impossible but TS doesn't know it")
      const [data, ...additionalData] = allData

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
  finishReason:
    | OpenAIResponseChunk["choices"][number]["finish_reason"]
    | undefined
  lastRawEvent: OpenAIResponseChunk | undefined

  constructor(readonly adapter: KurtOpenAI) {}

  async *observeAndTransform(rawEvents: AsyncIterable<OpenAIResponseChunk>) {
    for await (const rawEvent of rawEvents) {
      this.lastRawEvent = rawEvent

      const choice = rawEvent.choices[0]
      if (!choice) continue

      if (choice.finish_reason) this.finishReason = choice.finish_reason

      const textChunk = choice.delta.content
      if (textChunk) {
        this.textChunks.push(textChunk)
        yield { chunk: textChunk }
      }

      const functionCall = choice.delta.tool_calls?.at(0)
      if (functionCall?.function) {
        const {
          index,
          function: { name, arguments: dataChunk },
        } = functionCall

        if (name !== undefined) {
          this.functionNames[index] = name
        }
        if (dataChunk) {
          // biome-ignore lint/suspicious/noAssignInExpressions: this single-line lazy initialization pattern is good, actually
          ;(this.dataChunks[index] ||= []).push(dataChunk)
          this.textChunks.push(dataChunk)
          yield { chunk: dataChunk }
        } else if (index > 0) {
          // Insert a line break chunk in between parallel tool calls.
          const lineBreakChunk = "\n"
          this.textChunks.push(lineBreakChunk)
          yield { chunk: lineBreakChunk }
        }
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
    case "length":
      throw new KurtResultLimitError(state.adapter, state.textChunks.join(""))

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
function convertMetadata(rawEvent: OpenAIResponseChunk) {
  const metadata: KurtResult["metadata"] = {}
  if (rawEvent.usage) {
    metadata.totalInputTokens = rawEvent.usage?.prompt_tokens
    metadata.totalOutputTokens = rawEvent.usage?.completion_tokens
  }
  if (rawEvent.system_fingerprint) {
    metadata.systemFingerprint = rawEvent.system_fingerprint
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
    const content = message.content
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
    (message) => message.role === "system"
  )

  // If there is no existing system prompt, we'll simply add one
  // that contains only the new desired line.
  if (!existingSystemPrompt) {
    return [
      { role: "system", content: [{ type: "text", text: systemPromptLine }] },
      ...messages,
    ]
  }

  // If there is an existing system prompt, we'll modify it to include
  // the new desired line as part of the last content part.
  const existingParts: { type: "text"; text: string }[] =
    typeof existingSystemPrompt.content === "string"
      ? [{ type: "text", text: existingSystemPrompt.content }]
      : (existingSystemPrompt.content as { type: "text"; text: string }[])
  const lastPart = existingParts[existingParts.length - 1] ?? { text: "" }
  const priorParts = existingParts.slice(0, -1)
  const newParts: { type: "text"; text: string }[] = [
    ...priorParts,
    { type: "text", text: `${lastPart?.text}\n${systemPromptLine}` },
  ]
  return messages.map(
    (message): OpenAIMessage =>
      message === existingSystemPrompt
        ? { ...message, content: newParts }
        : message
  )
}
