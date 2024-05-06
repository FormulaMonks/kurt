import "./VertexAI.patch.generateContentStream" // monkey-patches VertexAI GenerativeModel.prototype.generateContentStream

import zodToJsonSchema from "zod-to-json-schema"
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
} from "./KurtSchema"
import type {
  VertexAI,
  VertexAIGenerativeModel,
  VertexAIMessage,
  VertexAIResponse,
  VertexAISchema,
} from "./VertexAI.types"

// These models support function calling.
const COMPATIBLE_MODELS = ["gemini-1.0-pro", "gemini-1.5-pro"] as const

export type KurtVertexAISupportedModel = (typeof COMPATIBLE_MODELS)[number]

export type KurtVertexAICreateOptions = KurtCreateOptions & {
  model: KurtVertexAISupportedModel
  vertexAI: VertexAI
}

export class KurtVertexAI implements Kurt {
  constructor(private options: KurtVertexAICreateOptions) {}

  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream {
    const llm = this.options.vertexAI.getGenerativeModel({
      model: this.options.model,
    }) as VertexAIGenerativeModel

    return this.handleStream(
      undefined,
      llm.generateContentStreamPATCHED({
        contents: this.toVertexAIMessages(options),
      })
    )
  }

  generateStructuredData<T extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<T>
  ): KurtStream<T> {
    const schema = options.schema

    const llm = this.options.vertexAI.getGenerativeModel({
      model: this.options.model,
    }) as VertexAIGenerativeModel

    return this.handleStream(
      schema as KurtSchemaMaybe<T>,
      llm.generateContentStreamPATCHED({
        contents: this.toVertexAIMessages(options),
        tool_config: { function_calling_config: { mode: "ANY" } },
        tools: [
          {
            functionDeclarations: [
              {
                name: "structured_data",
                description: schema.description,
                parameters: jsonSchemaForVertexAI(schema),
              },
            ],
          },
        ],
      })
    )
  }

  private handleStream<T extends KurtSchemaInnerMaybe>(
    schema: KurtSchemaMaybe<T>,
    response: VertexAIResponse
  ): KurtStream<T> {
    async function* generator<T extends KurtSchemaInnerMaybe>() {
      const { stream } = await response
      const chunks: string[] = []

      for await (const streamChunk of stream) {
        const choice = streamChunk.candidates?.at(0)
        if (!choice) continue

        const isContentFinal = choice.finishReason !== undefined
        const { parts } = choice.content

        for (const [partIndex, part] of parts.entries()) {
          const chunk = part.text
          const isFinal = isContentFinal && partIndex === parts.length - 1
          const data = isFinal
            ? applySchemaToFuzzyStructure(schema, part.functionCall)
            : undefined

          if (chunk) {
            yield { chunk }
            chunks.push(chunk)
          }
          if (isFinal) {
            if (data) {
              const text = JSON.stringify(data)
              yield { chunk: text }
              yield {
                finished: true,
                text,
                data,
              } as KurtStreamEvent<T>
            } else {
              const text = chunks.join("")
              const data = undefined
              yield {
                finished: true,
                text,
                data,
              } as KurtStreamEvent<T>
            }
          }
        }
      }
    }

    return new KurtStream<T>(generator())
  }

  private toVertexAIMessages = ({
    prompt,
    systemPrompt = this.options.systemPrompt,
    extraMessages = [],
  }: KurtGenerateNaturalLanguageOptions): VertexAIMessage[] => {
    const systemMessage: VertexAIMessage[] = systemPrompt
      ? [toVertexAIMessage({ role: "system", text: systemPrompt })]
      : []

    const userMessage = toVertexAIMessage({ role: "user", text: prompt })

    const extras = extraMessages.map(toVertexAIMessage)

    return systemMessage.concat(userMessage, extras)
  }
}

const toVertexAIMessage = ({ role, text }: KurtMessage): VertexAIMessage => ({
  role,
  parts: [{ text }],
})

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

// Vertex AI sometimes gives wonky results that are nested weirdly.
// This function tries to account for the different scenarios we've seen.
//
// If a new scenario is seen, we can add a test for it in KurtVertexAI.spec.ts
// and then add new logic here as needed to handle the new scenario.
function applySchemaToFuzzyStructure<T extends KurtSchemaInnerMaybe>(
  schema: KurtSchemaMaybe<T>,
  input: { name: string; args: object } | undefined
  // biome-ignore lint/suspicious/noExplicitAny: TODO: no any
): any {
  if (schema === undefined || input === undefined) return undefined

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
