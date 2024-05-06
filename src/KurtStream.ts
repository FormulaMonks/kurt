import type { Promisable } from "type-fest"
import type { KurtSchemaInnerMaybe, KurtSchemaResultMaybe } from "./KurtSchema"

export type KurtStreamEventChunk = { chunk: string }
export type KurtResult<T extends KurtSchemaInnerMaybe = undefined> = {
  finished: true
  text: string
  data: KurtSchemaResultMaybe<T>
}
export type KurtStreamEvent<T extends KurtSchemaInnerMaybe = undefined> =
  | KurtStreamEventChunk
  | KurtResult<T>

type _AdditionalListener<T extends KurtSchemaInnerMaybe = undefined> = (
  event: KurtStreamEvent<T> | { uncaughtError: unknown }
) => void

// This class represents the result of a call to an LLM.
//
// It acts as an AsyncIterable, so that the caller can observe a stream of
// events (with a common interface across any supported LLM).
//
// The events are buffered such that multiple listeners can all observe
// the stream, without disrupting one anothers' view of events, such that
// each listener will see exactly the same stream of events, regardless
// of when each one started listening.
//
// It also exposes a `result` convenience getter for callers who are only
// interested in the final result event.
export class KurtStream<T extends KurtSchemaInnerMaybe = undefined>
  implements AsyncIterable<KurtStreamEvent<T>>
{
  private started = false
  private finished = false
  private seenEvents: KurtStreamEvent<T>[] = []
  private finalError?: { uncaughtError: unknown }
  private additionalListeners = new Set<_AdditionalListener<T>>()

  // Create a new result stream, from the given underlying stream generator.
  constructor(private gen: AsyncGenerator<KurtStreamEvent<T>>) {}

  // Get the final event from the end of the result stream, when it is ready.
  get result(): Promise<KurtResult<T>> {
    return toFinal(this)
  }

  // Get each event in the stream (each yielded from this `AsyncGenerator`).
  async *[Symbol.asyncIterator]() {
    // If some other caller has already started iterating on this stream,
    // we can't let them consume from the same underlying generator, because the
    // multiple watchers would disrupt each others view of the generated items.
    //
    // So as a workaround, we have a mechanism to "watch as an additional
    // listener", where we return a new generator that will receive events
    // second-hand from this generator, with this generator being the only
    // one that listens to the
    if (this.started)
      for await (const event of this.watchAsAdditionalListener()) yield event

    this.started = true
    try {
      for await (const event of this.gen) {
        // Capture the event in our internal event history,
        // and push it to any additional listeners who are waiting.
        this.seenEvents.push(event)
        for (const listener of this.additionalListeners) listener(event)

        // We need to yield the event *AFTER* we've done the bookkeeping above,
        // because our caller may decide to stop calling the generator at
        // any time, and we wouldn't want that to break other listeners.
        yield event

        // If this is the final event, break out of the event-receiving loop.
        //
        // If we have a misbehaving underlying generator that has more events
        // after the finish event, we'll be ignoring those.
        if ("finished" in event) break
      }
    } catch (e) {
      // If we catch an error, we need to store the error and also
      // notify any additional listeners, so that each of them can stop
      // listening and throw the error to their outer caller.
      this.finalError = { uncaughtError: e }
      for (const listener of this.additionalListeners) listener(this.finalError)

      // Finally, we throw it to our own caller/listener.
      throw e
    } finally {
      // We need to make sure we mark the stream as finished, even in the
      // case where the stream had an error before receiving the final event.
      // This finished flag doesn't mark reception of a final event - it marks
      // the fact that the stream won't receive any further events.
      this.finished = true
    }
  }

  private async *watchAsAdditionalListener() {
    // First, catch up on any events we missed so far.
    for (const event of this.seenEvents) yield event

    // Now, if we have a final error, we need to throw it to our caller.
    if (this.finalError) throw this.finalError.uncaughtError

    // If we know that the stream is already finished, we can stop here and
    // avoid unnecessarily creating an actual listener mechanism.
    if (this.finished) return

    // To make this generator work, we need to set up a replaceable promise
    // that will receive the next event (or error) via the listener callback.
    let nextEventResolve: (value: Promisable<KurtStreamEvent<T>>) => void
    let nextEventReject: (reason?: unknown) => void
    const createNextEventPromise = () => {
      return new Promise<KurtStreamEvent<T>>((resolve, reject) => {
        nextEventResolve = resolve
        nextEventReject = reject
      })
    }
    let nextEvent = createNextEventPromise()

    // Set up an "additional listener" callback to receive events from the main
    // listener (the first to start consuming from the underlying generator).
    //
    // Each time we receive an event we're going to resolve (or reject)
    // the current promise, then we will replace the promise (and its
    // associated resolve/reject functions), using closures.
    const listener: _AdditionalListener<T> = (event) => {
      if ("uncaughtError" in event) nextEventReject(event.uncaughtError)
      else nextEventResolve(event)
      nextEvent = createNextEventPromise()
    }
    this.additionalListeners.add(listener)

    try {
      // Now our generator is as simple as waiting on the next promise,
      // over and over again, until we see the final event.
      while (!this.finished) {
        const event = await nextEvent
        yield event
        if ("finished" in event) break
      }
    } finally {
      // Make sure to remove our listener at the end, even in the case of error.
      this.additionalListeners.delete(listener)
    }
  }
}

async function toFinal<T extends KurtSchemaInnerMaybe = undefined>(
  stream: KurtStream<T>
): Promise<KurtResult<T>> {
  for await (const event of stream) {
    if ("finished" in event) {
      return event
    }
  }
  throw new Error(
    "KurtResult never sent a finish event (or an error). " +
      "This is a bug in the Kurt library that should be reported"
  )
}
