import { zodToJsonSchema } from "zod-to-json-schema"
import type {
  Kurt,
  KurtCreateOptions,
  KurtGenerateNaturalLanguageOptions,
  KurtGenerateStructuredDataOptions,
  KurtMessage,
} from "./Kurt"
import { KurtStream, type KurtStreamEvent } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMaybe,
  KurtSchemaMaybe,
  KurtSchemaResult,
  KurtSchemaResultMaybe,
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

  private toOpenAIMessages = ({
    prompt,
    systemPrompt = this.options.systemPrompt,
    extraMessages = [],
  }: KurtGenerateNaturalLanguageOptions): OpenAIMessage[] => {
    const systemMessage: OpenAIMessage[] = systemPrompt
      ? [toOpenAIMessage({ role: "system", text: systemPrompt })]
      : []

    const userMessage = toOpenAIMessage({ role: "user", text: prompt })

    const extras = extraMessages.map(toOpenAIMessage)

    return systemMessage.concat(userMessage, extras)
  }
}

const toOpenAIMessage = ({ role, text }: KurtMessage): OpenAIMessage => ({
  role: openAIRoleMapping[role],
  content: text,
})

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
