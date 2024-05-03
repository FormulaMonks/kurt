import { KurtSchemaInnerMaybe, KurtSchemaResultMaybe } from "./KurtSchema"

export type KurtResultEvent<T extends KurtSchemaInnerMaybe = undefined> =
  | {
      chunk: string
    }
  | {
      finished: true
      text: string
      data: KurtSchemaResultMaybe<T>
    }

export class KurtResult<T extends KurtSchemaInnerMaybe = undefined>
  implements AsyncIterable<KurtResultEvent<T>>
{
  constructor(private gen: AsyncGenerator<KurtResultEvent<T>>) {}

  async *[Symbol.asyncIterator]() {
    for await (const event of this.gen) {
      yield event
      if ("finished" in event) break
    }
  }
}
