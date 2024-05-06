import type { KurtStream } from "./KurtStream"
import type { KurtSchema, KurtSchemaInner } from "./KurtSchema"

export interface Kurt {
  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream

  generateStructuredData<T extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<T>
  ): KurtStream<T>
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

export type KurtGenerateStructuredDataOptions<T extends KurtSchemaInner> =
  KurtGenerateNaturalLanguageOptions & {
    schema: KurtSchema<T>
  }
