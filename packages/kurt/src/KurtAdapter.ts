import type { KurtMessage, KurtSamplingOptions } from "./Kurt"
import type { KurtStreamEvent } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
} from "./KurtSchema"
import type { KurtTool } from "./KurtTools"

type V1TypeParams = {
  rawMessage: object
  rawSchema: object
  rawTool: object
  rawEvent: object
}

// In future, other versions will be added, to allow evolving the adapter
// interface without breaking changes in the linkage between the central
// Kurt library and the adapter sub-libraries.
export type KurtAdapter = KurtAdapterV1<{
  // biome-ignore lint/suspicious/noExplicitAny: we use any here to ignore the adapter implementation details
  rawMessage: any
  // biome-ignore lint/suspicious/noExplicitAny: we use any here to ignore the adapter implementation details
  rawSchema: any
  // biome-ignore lint/suspicious/noExplicitAny: we use any here to ignore the adapter implementation details
  rawTool: any
  // biome-ignore lint/suspicious/noExplicitAny: we use any here to ignore the adapter implementation details
  rawEvent: any
}>

export type RawToolInput<A extends V1TypeParams = V1TypeParams> =
  | {
      name: string
      description: string
      parameters: A["rawSchema"]
    }
  | KurtTool

export interface KurtAdapterV1<A extends V1TypeParams = V1TypeParams> {
  kurtAdapterVersion: "v1"

  transformToRawMessages(messages: KurtMessage[]): A["rawMessage"][]

  transformToRawSchema<I extends KurtSchemaInner>(
    schema: KurtSchema<I>
  ): A["rawSchema"]

  transformToRawTool(tool: RawToolInput<A>): A["rawTool"]

  generateRawEvents(options: {
    messages: A["rawMessage"][]
    sampling: Required<KurtSamplingOptions>
    tools: { [key: string]: A["rawTool"] }
    forceTool?: string
  }): AsyncIterable<A["rawEvent"]>

  transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<A["rawEvent"]>
  ): AsyncIterable<KurtStreamEvent<undefined>>

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<A["rawEvent"]>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>>

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<A["rawEvent"]>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>>
}
