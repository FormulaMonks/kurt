import { zodToJsonSchema } from "zod-to-json-schema"
import type {
  KurtAdapterV1,
  KurtMessage,
  KurtStreamEvent,
  KurtStreamEventChunk,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaInnerMaybe,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaMaybe,
  KurtSchemaResult,
  KurtSchemaResultMaybe,
  KurtSchema,
  KurtSamplingOptions,
  KurtResult,
} from "@formula-monks/kurt"
import type {
  OpenAI,
  OpenAIMessage,
  OpenAIRequest,
  OpenAIResponseChunk,
  OpenAISchema,
  OpenAITool,
} from "./OpenAI.types"

// These models support function calling.
const COMPATIBLE_MODELS = [
  "gpt-4o",
  "gpt-4o-2024-05-13",
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

    if (options.forceTool)
      req.tool_choice = {
        type: "function",
        function: { name: options.forceTool },
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
    return transformStream(undefined, rawEvents)
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<OpenAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    return transformStream(schema, rawEvents)
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<OpenAIResponseChunk>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    return transformStreamWithOptionalTools<
      I,
      KurtSchemaMap<I>,
      KurtSchemaMapSingleResult<I>
    >(tools, rawEvents)
  }
}

const openAIRoleMapping = {
  model: "assistant",
  system: "system",
  user: "user",
} as const satisfies Record<KurtMessage["role"], OpenAIMessage["role"]>

function toOpenAIMessages(messages: KurtMessage[]): OpenAIMessage[] {
  const openAIMessages: OpenAIMessage[] = []

  for (const [messageIndex, message] of messages.entries()) {
    const { text, toolCall } = message
    if (text) {
      const role = openAIRoleMapping[message.role]
      openAIMessages.push({ role, content: text })
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

      openAIMessages.push({
        role: "assistant",
        tool_calls: [
          {
            id,
            type: "function" as const,
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      })
      openAIMessages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(result),
      })
    } else {
      throw new Error(`Invalid KurtMessage: ${JSON.stringify(message)}`)
    }
  }

  return openAIMessages
}

async function* transformStream<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
  D extends KurtSchemaResultMaybe<I>,
>(
  schema: S,
  rawEvents: AsyncIterable<OpenAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D>> {
  const chunks: string[] = []
  let lastRawEvent: OpenAIResponseChunk | undefined

  for await (const rawEvent of rawEvents) {
    lastRawEvent = rawEvent

    const choice = rawEvent.choices[0]
    if (!choice) continue

    const textChunk = choice.delta.content
    if (textChunk) {
      chunks.push(textChunk)
      yield { chunk: textChunk }
    }

    const dataChunk = choice.delta.tool_calls?.at(0)?.function?.arguments
    if (dataChunk) {
      chunks.push(dataChunk)
      yield { chunk: dataChunk }
    }
  }

  const rawEvent = lastRawEvent
  if (rawEvent) {
    const text = chunks.join("")
    const metadata: KurtResult["metadata"] = {}
    if (rawEvent.usage) {
      metadata.totalInputTokens = rawEvent.usage?.prompt_tokens
      metadata.totalOutputTokens = rawEvent.usage?.completion_tokens
    }
    if (rawEvent.system_fingerprint) {
      metadata.systemFingerprint = rawEvent.system_fingerprint
    }

    if (schema) {
      const data = schema.parse(JSON.parse(text)) as D
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
  tools: S,
  rawEvents: AsyncIterable<OpenAIResponseChunk>
): AsyncGenerator<KurtStreamEvent<D | undefined>> {
  const textChunks: string[] = []
  const dataChunks: string[][] = []
  const functionNames: string[] = []
  let lastRawEvent: OpenAIResponseChunk | undefined

  for await (const rawEvent of rawEvents) {
    lastRawEvent = rawEvent

    const choice = rawEvent.choices[0]
    if (!choice) continue

    const textChunk = choice.delta.content
    if (textChunk) {
      textChunks.push(textChunk)
      yield { chunk: textChunk }
    }

    const functionCall = choice.delta.tool_calls?.at(0)
    if (functionCall?.function) {
      const {
        index,
        function: { name, arguments: dataChunk },
      } = functionCall

      if (name !== undefined) {
        functionNames[index] = name
      }
      if (dataChunk) {
        // biome-ignore lint/suspicious/noAssignInExpressions: this single-line lazy initialization pattern is good, actually
        ;(dataChunks[index] ||= []).push(dataChunk)
        textChunks.push(dataChunk)
        yield { chunk: dataChunk }
      } else if (index > 0) {
        // Insert a line break chunk in between parallel tool calls.
        const lineBreakChunk = "\n"
        textChunks.push(lineBreakChunk)
        yield { chunk: lineBreakChunk }
      }
    }
  }

  const rawEvent = lastRawEvent
  if (rawEvent) {
    const metadata: KurtResult["metadata"] = {}
    if (rawEvent.usage) {
      metadata.totalInputTokens = rawEvent.usage?.prompt_tokens
      metadata.totalOutputTokens = rawEvent.usage?.completion_tokens
    }
    if (rawEvent.system_fingerprint) {
      metadata.systemFingerprint = rawEvent.system_fingerprint
    }

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
          args: schema.parse(JSON.parse(chunks.join(""))),
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
