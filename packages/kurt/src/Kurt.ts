import type { KurtStream } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaResult,
} from "./KurtSchema"

export interface Kurt {
  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream

  generateStructuredData<I extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<I>
  ): KurtStream<KurtSchemaResult<I>>
}

export interface KurtMessage {
  role: "user" | "model" | "system"
  text: string
}

export interface KurtCreateOptions {
  systemPrompt?: string
}

export interface KurtGenerateNaturalLanguageOptions {
  systemPrompt?: string
  prompt: string
  extraMessages?: KurtMessage[]
}

export type KurtGenerateStructuredDataOptions<I extends KurtSchemaInner> =
  KurtGenerateNaturalLanguageOptions & {
    schema: KurtSchema<I>
  }
