import type { KurtSamplingOptions, KurtMessage } from "../src/Kurt"
import type { KurtAdapterV1 } from "../src/KurtAdapter"
import type { KurtStreamEvent } from "../src/KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
} from "../src/KurtSchema"

export type FakeMessage = { fake: KurtMessage }
export type FakeSchema = { fake: object }
export type FakeTool = {
  fake: { name: string; description: string; parameters: FakeSchema }
}
export type FakeEvent = { fake: KurtStreamEvent<unknown> }
export class FakeAdapterV1
  implements
    KurtAdapterV1<{
      rawMessage: FakeMessage
      rawSchema: FakeSchema
      rawTool: FakeTool
      rawEvent: FakeEvent
    }>
{
  kurtAdapterVersion = "v1" as const

  // Hook-in points for testing.
  lastGenerateRawEventsCall?: Parameters<FakeAdapterV1["generateRawEvents"]>[0]
  nextEmitKurtStreamEvents: KurtStreamEvent<unknown>[] = []

  transformToRawMessages(messages: KurtMessage[]) {
    return messages.map((message) => ({ fake: message }))
  }

  transformToRawSchema<I extends KurtSchemaInner>(schema: KurtSchema<I>) {
    return { fake: schema }
  }

  transformToRawTool(tool: {
    name: string
    description: string
    parameters: { fake: object }
  }) {
    return { fake: tool }
  }

  generateRawEvents(options: {
    messages: { fake: KurtMessage }[]
    sampling: KurtSamplingOptions
    tools: {
      [key: string]: ReturnType<FakeAdapterV1["transformToRawTool"]>
    }
    forceTool?: string
  }) {
    this.lastGenerateRawEventsCall = options
    const events = this.nextEmitKurtStreamEvents
    this.nextEmitKurtStreamEvents = []

    async function* gen() {
      for (const event of events) {
        yield { fake: event }
      }
    }

    return gen()
  }

  async *transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<FakeEvent>
  ) {
    for await (const rawEvent of rawEvents) {
      yield rawEvent.fake as KurtStreamEvent<undefined>
    }
  }

  async *transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<FakeEvent>
  ) {
    for await (const rawEvent of rawEvents) {
      yield rawEvent.fake as KurtStreamEvent<KurtSchemaResult<I>>
    }
  }

  async *transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<FakeEvent>
  ) {
    for await (const rawEvent of rawEvents) {
      yield rawEvent.fake as KurtStreamEvent<
        KurtSchemaMapSingleResult<I> | undefined
      >
    }
  }
}
