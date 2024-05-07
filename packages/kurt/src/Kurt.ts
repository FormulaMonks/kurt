import type { RequireExactlyOne } from "type-fest"
import type { KurtStream } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
} from "./KurtSchema"

export abstract class Kurt {
  abstract generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream

  abstract generateStructuredData<I extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<I>
  ): KurtStream<KurtSchemaResult<I>>

  abstract generateWithOptionalTools<I extends KurtSchemaInnerMap>(
    options: KurtGenerateWithOptionalToolsOptions<I>
  ): KurtStream<KurtSchemaMapSingleResult<I> | undefined>
}

export type KurtMessage = {
  role: "user" | "model" | "system"
} & RequireExactlyOne<{
  text: string
  toolCall: {
    name: string
    args: object
    result: object
  }
}>

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

export type KurtGenerateWithOptionalToolsOptions<I extends KurtSchemaInnerMap> =
  KurtGenerateNaturalLanguageOptions & {
    tools: KurtSchemaMap<I>
  }
