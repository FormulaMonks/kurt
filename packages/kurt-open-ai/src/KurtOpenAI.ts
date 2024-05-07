import { zodToJsonSchema } from "zod-to-json-schema"
import { KurtStream } from "@formula-monks/kurt"
import type {
  Kurt,
  KurtCreateOptions,
  KurtGenerateNaturalLanguageOptions,
  KurtGenerateStructuredDataOptions,
  KurtGenerateWithOptionalToolsOptions,
  KurtMessage,
  KurtStreamEvent,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaInnerMaybe,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaMaybe,
  KurtSchemaResult,
  KurtSchemaResultMaybe,
} from "@formula-monks/kurt"
import type { OpenAI, OpenAIMessage, OpenAIResponse } from "./OpenAI.types"

// These models support function calling.
const COMPATIBLE_MODELS = [
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-turbo-preview",
  "gpt-4-0125-preview",
  "gpt-4-1106-preview",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
] as const

export type KurtOpenAISupportedModel = (typeof COMPATIBLE_MODELS)[number]

export type KurtOpenAICreateOptions = KurtCreateOptions & {
  model: KurtOpenAISupportedModel
  openAI: OpenAI
}

export class KurtOpenAI implements Kurt {
  constructor(private options: KurtOpenAICreateOptions) {}

  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream {
    return new KurtStream(
      transformStream(
        undefined,
        this.options.openAI.chat.completions.create({
          stream: true,
          model: this.options.model,
          messages: this.toOpenAIMessages(options),
        })
      )
    )
  }

  generateStructuredData<I extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<I>
  ): KurtStream<KurtSchemaResult<I>> {
    const schema = options.schema

    return new KurtStream(
      transformStream(
        schema,
        this.options.openAI.chat.completions.create({
          stream: true,
          model: this.options.model,
          messages: this.toOpenAIMessages(options),
          tool_choice: {
            type: "function",
            function: { name: "structured_data" },
          },
          tools: [
            {
              type: "function",
              function: {
                name: "structured_data",
                description: schema.description,
                parameters: zodToJsonSchema(schema),
              },
            },
          ],
        })
      )
    )
  }

  generateWithOptionalTools<I extends KurtSchemaInnerMap>(
    options: KurtGenerateWithOptionalToolsOptions<I>
  ): KurtStream<KurtSchemaMapSingleResult<I> | undefined> {
    return new KurtStream(
      transformStreamWithOptionalTools<
        I,
        KurtSchemaMap<I>,
        KurtSchemaMapSingleResult<I>
      >(
        options.tools,
        this.options.openAI.chat.completions.create({
          stream: true,
          model: this.options.model,
          messages: this.toOpenAIMessages(options),
          tools: Object.entries(options.tools).map(([name, schema]) => ({
            type: "function",
            function: {
              name,
              description: schema.description,
              parameters: zodToJsonSchema(schema),
            },
          })),
        })
      )
    )
  }

  private toOpenAIMessages = ({
    prompt,
    systemPrompt = this.options.systemPrompt,
    extraMessages = [],
  }: KurtGenerateNaturalLanguageOptions): OpenAIMessage[] => {
    const openAIMessages: OpenAIMessage[] = []

    if (systemPrompt) {
      openAIMessages.push({ role: "system", content: systemPrompt })
    }

    openAIMessages.push({ role: "user", content: prompt })

    for (const [messageIndex, message] of extraMessages.entries()) {
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
}

const openAIRoleMapping = {
  model: "assistant",
  system: "system",
  user: "user",
} as const satisfies Record<KurtMessage["role"], OpenAIMessage["role"]>

async function* transformStream<
  I extends KurtSchemaInnerMaybe,
  S extends KurtSchemaMaybe<I>,
  D extends KurtSchemaResultMaybe<I>,
>(schema: S, response: OpenAIResponse): AsyncGenerator<KurtStreamEvent<D>> {
  const stream = await response
  const chunks: string[] = []

  for await (const streamChunk of stream) {
    const choice = streamChunk.choices[0]
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

    const isFinal = choice.finish_reason !== null

    if (isFinal) {
      const text = chunks.join("")
      if (schema) {
        const data = schema.parse(JSON.parse(text)) as D
        yield { finished: true, text, data }
      } else {
        yield { finished: true, text, data: undefined } as KurtStreamEvent<D>
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
  response: OpenAIResponse
): AsyncGenerator<KurtStreamEvent<D | undefined>> {
  const stream = await response
  const chunks: string[] = []
  let functionName: string | undefined

  for await (const streamChunk of stream) {
    const choice = streamChunk.choices[0]
    if (!choice) continue

    const textChunk = choice.delta.content
    if (textChunk) {
      chunks.push(textChunk)
      yield { chunk: textChunk }
    }

    const functionCall = choice.delta.tool_calls?.at(0)?.function
    functionName ||= functionCall?.name
    const dataChunk = functionCall?.arguments
    if (dataChunk) {
      chunks.push(dataChunk)
      yield { chunk: dataChunk }
    }

    const isFinal = choice.finish_reason !== null

    if (isFinal) {
      const text = chunks.join("")
      if (functionName) {
        const schema = tools[functionName]
        if (!schema) {
          throw new Error(
            `OpenAI tried to call tool ${functionName} which isn't in the tool set ${JSON.stringify(
              Object.keys(tools)
            )}}`
          )
        }
        const data = {
          name: functionName,
          args: schema.parse(JSON.parse(text)),
        } as D
        yield { finished: true, text, data }
      } else {
        yield { finished: true, text, data: undefined }
      }
    }
  }
}
