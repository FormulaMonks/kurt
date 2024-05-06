import type { KurtResult } from "./KurtResult"
import type { KurtSchema, KurtSchemaInner } from "./KurtSchema"

export interface Kurt {
  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtResult

  generateStructuredData<T extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<T>
  ): KurtResult<T>
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
