import type {
  KurtAdapter,
  KurtAdapterV1,
  KurtMessage,
  KurtStreamEvent,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
  KurtSchema,
  KurtSamplingOptions,
} from "@formula-monks/kurt"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash, type Hash } from "node:crypto"
import { stringify as stringifyYAML, parse as parseYAML } from "yaml"
import { zodToJsonSchema, type JsonSchema7ObjectType } from "zod-to-json-schema"

type CacheData = {
  messages: KurtMessage[]
  sampling: Required<KurtSamplingOptions>
  tools: {
    [key: string]: {
      name: string
      description: string
      parameters: JsonSchema7ObjectType
    }
  }
  forceTool?: string
  response: KurtStreamEvent<unknown>[]
}

type AdapterRawEvent<A extends KurtAdapter> = object &
  (ReturnType<A["generateRawEvents"]> extends AsyncIterable<infer T>
    ? T
    : never)

export class KurtCache<A extends KurtAdapter>
  implements
    KurtAdapterV1<{
      rawMessage: KurtMessage
      rawSchema: KurtSchema<KurtSchemaInner>
      rawTool: {
        name: string
        description: string
        parameters: KurtSchema<KurtSchemaInner>
      }
      rawEvent: AdapterRawEvent<A>
    }>
{
  constructor(
    /**
     * The directory where cache files will be stored.
     */
    readonly cacheDir: string,

    /**
     * A prefix to use for cache files (usually this should be a name for
     * the underlying adapter / LLM being used, so that collisions are avoided
     * when the same generate arguments go to a different underlying adapter).
     */
    readonly cachePrefix: string,

    /**
     * This function will be run at most once, the first time a cache miss
     * is encountered and a "proper" Kurt instance needs to be created.
     *
     * This lazy initialization is helpful because many Kurt adapters may
     * require API keys to be ready, and part of the purpose of the KurtCache
     * is to avoid needing to provide those keys if they're not needed.
     */
    private adapterSetupFn: () => A
  ) {
    // Create the cache dir if it doesn't yet exist.
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
  }

  private lazyAdapterField: A | undefined
  private lazyAdapter() {
    if (!this.lazyAdapterField) this.lazyAdapterField = this.adapterSetupFn()
    return this.lazyAdapterField
  }

  kurtAdapterVersion = "v1" as const

  transformToRawMessages(messages: KurtMessage[]) {
    return messages
  }

  transformToRawSchema<I extends KurtSchemaInner>(schema: KurtSchema<I>) {
    return schema
  }

  transformToRawTool(tool: {
    name: string
    description: string
    parameters: KurtSchema<KurtSchemaInner>
  }) {
    return tool
  }

  generateRawEvents(
    options: Omit<CacheData, "response" | "tools"> & {
      tools: {
        [key: string]: {
          name: string
          description: string
          parameters: KurtSchema<KurtSchemaInner>
        }
      }
    }
  ): AsyncIterable<AdapterRawEvent<A>> {
    // Hash the incoming options to determine the cache key.
    const digest = createHash("sha256")
    hashSamplingOptions(digest, options.sampling)
    hashMessages(digest, options.messages)
    hashTools(digest, options.tools, options.forceTool)
    const hashString = digest.digest("hex")
    const cacheFilePath = `${this.cacheDir}/${this.cachePrefix}-${hashString}.yaml`

    // If there is a cache hit, read it now.
    if (existsSync(cacheFilePath)) {
      const data: CacheData = parseYAML(readFileSync(cacheFilePath, "utf-8"))
      return new ResponseEventsFromCache(data)
    }

    // Otherwise, it's a cache miss and we need to generate new events.
    const adapter = this.lazyAdapter()
    return new ResponseEventsShouldCache(
      cacheFilePath,
      {
        ...options,
        tools: Object.fromEntries(
          Object.entries(options.tools).map(([name, tool]) => [
            name,
            {
              ...tool,
              parameters: zodToJsonSchema(
                tool.parameters
              ) as JsonSchema7ObjectType,
            },
          ])
        ),
      },
      adapter.generateRawEvents({
        ...options,
        messages: adapter.transformToRawMessages(options.messages),
        tools: Object.fromEntries(
          Object.entries(options.tools).map(([name, tool]) => [
            name,
            adapter.transformToRawTool({
              name,
              description: tool.description,
              parameters: adapter.transformToRawSchema(tool.parameters),
            }),
          ])
        ),
      })
    )
  }

  transformNaturalLanguageFromRawEvents(
    rawEvents: AsyncIterable<AdapterRawEvent<A>>
  ): AsyncIterable<KurtStreamEvent<undefined>> {
    if (rawEvents instanceof ResponseEventsFromCache)
      return rawEvents.asyncAlreadyTransformedEvents()

    const events =
      this.lazyAdapter().transformNaturalLanguageFromRawEvents(rawEvents)

    return rawEvents instanceof ResponseEventsShouldCache
      ? new ResponseEventsToCache(
          rawEvents.saveToFilePath,
          rawEvents.cacheData,
          events
        )
      : events
  }

  transformStructuredDataFromRawEvents<I extends KurtSchemaInner>(
    schema: KurtSchema<I>,
    rawEvents: AsyncIterable<AdapterRawEvent<A>>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaResult<I>>> {
    if (rawEvents instanceof ResponseEventsFromCache)
      return rawEvents.asyncAlreadyTransformedEvents()

    const events = this.lazyAdapter().transformStructuredDataFromRawEvents(
      schema,
      rawEvents
    )

    return rawEvents instanceof ResponseEventsShouldCache
      ? new ResponseEventsToCache(
          rawEvents.saveToFilePath,
          rawEvents.cacheData,
          events
        )
      : events
  }

  transformWithOptionalToolsFromRawEvents<I extends KurtSchemaInnerMap>(
    tools: KurtSchemaMap<I>,
    rawEvents: AsyncIterable<AdapterRawEvent<A>>
  ): AsyncIterable<KurtStreamEvent<KurtSchemaMapSingleResult<I> | undefined>> {
    if (rawEvents instanceof ResponseEventsFromCache)
      return rawEvents.asyncAlreadyTransformedEvents()

    const events = this.lazyAdapter().transformWithOptionalToolsFromRawEvents(
      tools,
      rawEvents
    )

    return rawEvents instanceof ResponseEventsShouldCache
      ? new ResponseEventsToCache(
          rawEvents.saveToFilePath,
          rawEvents.cacheData,
          events
        )
      : events
  }
}

/**
 * An internal utility class that carries already-transformed events from
 * a cache hit, masquerading as an async iterable of raw events (which
 * it actually doesn't contain because those weren't stored in the cache).
 *
 * This is kind of a hack/workaround for the fact that the Kurt adapter
 * pattern separates raw event generation from event transformation, and
 * it only works as long as the object is passed directly back to us,
 * rather than being obscured by a wrapping iterable.
 */
class ResponseEventsFromCache<E> implements AsyncIterable<E> {
  constructor(readonly cacheData: CacheData) {}

  async *[Symbol.asyncIterator]() {
    // Yield nothing for raw events - we already have the transformed events.
    // And because this class is for internal use only, we don't even intend
    // to ever call this method - it's just here to satisfy the interface.
  }

  async *asyncAlreadyTransformedEvents<T extends KurtStreamEvent<unknown>>() {
    for (const event of this.cacheData.response) {
      yield event as T
    }
  }
}

/**
 * An internal utility class that carries raw events from a cache miss,
 * and a file path that tells downstream code where to save the events.
 *
 * It is expected that the downstream code will instantiate
 * ResponseEventsToCache with the same file path, and the stream
 * of transformed events to be saved and emitted.
 */
class ResponseEventsShouldCache<E> implements AsyncIterable<E> {
  constructor(
    readonly saveToFilePath: string,
    readonly cacheData: Omit<CacheData, "response">,
    readonly rawEvents: AsyncIterable<E>
  ) {}

  async *[Symbol.asyncIterator]() {
    for await (const event of this.rawEvents) {
      yield event
    }
  }
}

/**
 * A utility class that wraps the inner async iterable of events,
 * so that we can save them to a cache file as each one is emitted
 * to the downstream consumer that is reading the stream.
 */
class ResponseEventsToCache<E extends KurtStreamEvent<unknown>>
  implements AsyncIterable<E>
{
  constructor(
    private saveToFilePath: string | undefined,
    readonly cacheData: Omit<CacheData, "response">,
    readonly inner: AsyncIterable<E>
  ) {}

  async *[Symbol.asyncIterator]() {
    const events: E[] = []
    try {
      for await (const event of this.inner) {
        events.push(event)
        yield event
      }
    } finally {
      if (this.saveToFilePath) {
        writeFileSync(
          this.saveToFilePath,
          stringifyYAML({ ...this.cacheData, response: events })
        )
        this.saveToFilePath = undefined
      }
    }
  }
}

function hashSamplingOptions(digest: Hash, options: KurtSamplingOptions): Hash {
  mayHash(digest, "maxOutputTokens", options.maxOutputTokens)
  mayHash(digest, "temperature", options.temperature)
  mayHash(digest, "topP", options.topP)
  mayHash(
    digest,
    "forceSchemaConstrainedTokens",
    options.forceSchemaConstrainedTokens
  )
  return digest
}

function hashMessages(digest: Hash, messages: KurtMessage[]): Hash {
  for (const m of messages ?? []) {
    mayHash(digest, "role", m.role)
    mayHash(digest, "text", m.text)
    mayHash(digest, "imageDataMimeType", m.imageData?.mimeType)
    mayHash(digest, "imageDataBase64Data", m.imageData?.base64Data)
    mayHash(digest, "audioDataMimeType", m.audioData?.mimeType)
    mayHash(digest, "audioDataBase64Data", m.audioData?.base64Data)
    if (m.toolCall) {
      mayHash(digest, "toolName", m.toolCall.name)
      mayHash(digest, "toolArgs", JSON.stringify(m.toolCall.args))
      mayHash(digest, "toolResult", JSON.stringify(m.toolCall.result))
    }
  }
  return digest
}

function hashTools(
  digest: Hash,
  tools: {
    [key: string]: {
      name: string
      description: string
      parameters: KurtSchema<KurtSchemaInner>
    }
  },
  forceTool?: string
): Hash {
  for (const [name, tool] of Object.entries(tools)) {
    digest.update(name)
    mayHash(digest, "description", tool.description)
    hashSchema(digest, tool.parameters)
  }
  if (forceTool !== undefined) digest.update(forceTool)
  return digest
}

function hashSchema(digest: Hash, schema: KurtSchema<KurtSchemaInner>) {
  // TODO: It would reduce our dependency surface and increase performance
  // if we could avoid using zod-to-json-schema here, and instead hash the
  // schema properties directly. This would require a highly detailed
  // implementation that knows how to traverse the zod internal schema tree.
  //
  // For now it's better for us to avoid the complexity and take the easy hack.
  const jsonSchema = zodToJsonSchema(schema)
  digest.update(JSON.stringify(jsonSchema))
}

function mayHash(
  digest: Hash,
  key: string,
  value: string | number | boolean | undefined
) {
  if (value === undefined || value === false) return
  digest.update(key)
  if (value === true) return
  if (typeof value === "string") digest.update(value)
  else digest.update(value.toString())
}
