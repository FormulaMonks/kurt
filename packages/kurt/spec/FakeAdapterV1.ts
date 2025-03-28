import type {
  KurtAdapterV1,
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
  KurtStreamEvent,
  RawToolInput,
} from "../src"
import { type KurtMessage, type KurtSamplingOptions, KurtTools } from "../src"

export type FakeMessage = { fake: KurtMessage }
export type FakeSchema = { fake: object }
export type FakeTool = {
  fake: { name: string; description: string; parameters: FakeSchema }
}
export type FakeEvent = { fake: KurtStreamEvent<unknown> }
type FakeAdapterTypeParams = {
  rawMessage: FakeMessage
  rawSchema: FakeSchema
  rawTool: FakeTool
  rawEvent: FakeEvent
}

export class FakeAdapterV1 implements KurtAdapterV1<FakeAdapterTypeParams> {
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

  transformToRawTool(tool: RawToolInput<FakeAdapterTypeParams>): FakeTool {
    if (KurtTools.isKurtTool(tool)) {
      return {
        fake: {
          name: tool.type,
          description: "Kurt tool",
          parameters: { fake: {} },
        },
      }
    }
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
