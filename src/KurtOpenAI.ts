import { zodToJsonSchema } from "zod-to-json-schema"
import type {
  Kurt,
  KurtCreateOptions,
  KurtGenerateNaturalLanguageOptions,
  KurtGenerateStructuredDataOptions,
  KurtMessage,
} from "./Kurt"
import { KurtResult, type KurtResultEvent } from "./KurtResult"
import type {
  KurtSchemaInner,
  KurtSchemaInnerMaybe,
  KurtSchemaMaybe,
} from "./KurtSchema"
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
  ): KurtResult {
    const systemPrompt = options.systemPrompt ?? this.options.systemPrompt
    const prompt = options.prompt
    const extraMessages = options.extraMessages ?? []

    return this.handleStream(
      undefined,
      this.options.openAI.chat.completions.create({
        stream: true,
        model: this.options.model,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt } as const]
            : []),
          { role: "user", content: prompt },
          ...toOpenAIMessages(extraMessages),
        ],
      })
    )
  }

  generateStructuredData<T extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<T>
  ): KurtResult<T> {
    const systemPrompt = options.systemPrompt ?? this.options.systemPrompt
    const prompt = options.prompt
    const schema = options.schema
    const extraMessages = options.extraMessages ?? []

    return this.handleStream(
      schema as KurtSchemaMaybe<T>,
      this.options.openAI.chat.completions.create({
        stream: true,
        model: this.options.model,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt } as const]
            : []),
          { role: "user", content: prompt },
          ...toOpenAIMessages(extraMessages),
        ],
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
  }

  private handleStream<T extends KurtSchemaInnerMaybe>(
    schema: KurtSchemaMaybe<T>,
    response: OpenAIResponse
  ): KurtResult<T> {
    async function* generator<T extends KurtSchemaInnerMaybe>() {
      const stream = await response
      const chunks: string[] = []

      for await (const streamChunk of stream) {
        const choice = streamChunk.choices[0]
        if (!choice) continue

        const textChunk = choice.delta.content
        if (textChunk) {
          yield { chunk: textChunk } as KurtResultEvent<T>
          chunks.push(textChunk)
        }

        const dataChunk = choice.delta.tool_calls?.at(0)?.function?.arguments
        if (dataChunk) {
          yield { chunk: dataChunk } as KurtResultEvent<T>
          chunks.push(dataChunk)
        }

        const isFinal = choice.finish_reason !== null

        if (isFinal) {
          const text = chunks.join("")
          if (schema) {
            const data = schema?.parse(JSON.parse(chunks.join("")))
            yield {
              finished: true,
              text,
              data,
            } as KurtResultEvent<T>
          } else {
            yield {
              finished: true,
              text,
              data: undefined,
            } as KurtResultEvent<T>
          }
        }
      }
    }

    return new KurtResult<T>(generator())
  }
}

function toOpenAIMessages(messages: KurtMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    const { role, text } = message
    return {
      role: role === "model" ? "assistant" : role,
      content: text,
    }
  })
}
