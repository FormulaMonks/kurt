import type { Promisable } from "type-fest"
import { KurtSchemaInnerMaybe, KurtSchemaResultMaybe } from "./KurtSchema"

export type KurtResultEventChunk = { chunk: string }
export type KurtResultEventFinal<T extends KurtSchemaInnerMaybe = undefined> = {
  finished: true
  text: string
  data: KurtSchemaResultMaybe<T>
}
export type KurtResultEvent<T extends KurtSchemaInnerMaybe = undefined> =
  | KurtResultEventChunk
  | KurtResultEventFinal<T>

type _AdditionalListener<T extends KurtSchemaInnerMaybe = undefined> = (
  event: KurtResultEvent<T> | { uncaughtError: unknown }
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
// It also exposes a few convenience getters for callers who are only
// interested in the final result event, or the text/data from that event.
export class KurtResult<T extends KurtSchemaInnerMaybe = undefined>
  implements AsyncIterable<KurtResultEvent<T>>
{
  private started: boolean = false
  private finished: boolean = false
  private seenEvents: KurtResultEvent<T>[] = []
  private additionalListeners = new Set<_AdditionalListener<T>>()
  private finalEventValue?: KurtResultEventFinal<T>
  private finalEventPromise: Promise<KurtResultEventFinal<T>>
  private finalEventResolve!: (e: Promisable<KurtResultEventFinal<T>>) => void
  private finalEventReject!: (reason?: unknown) => void

  // Create a new result stream, from the given underlying stream generator.
  constructor(private gen: AsyncGenerator<KurtResultEvent<T>>) {
    this.finalEventPromise = new Promise((resolve, reject) => {
      this.finalEventResolve = resolve
      this.finalEventReject = reject
    })
  }

  // Get the final event from the end of the result stream, when it is ready.
  get finalEvent(): Promise<KurtResultEventFinal<T>> {
    return this._finalEvent()
  }
  private async _finalEvent() {
    // If nobody has started listening to the stream yet, we need to be
    // the first listener of it. This makes sure we will eventually fulfill
    // the promise that we are about to await on.
    if (!this.started) for await (const _ of this) null

    // Now wait for the underlying promise to fulfill.
    return this.finalEventPromise
  }

  // Get the text from the end of the result stream, when it is ready.
  get finalText(): Promise<string> {
    return this._finalText()
  }
  private async _finalText() {
    return (await this.finalEvent).text
  }

  // Get the data from the end of the result stream, when it is ready.
  get finalData(): Promise<KurtSchemaResultMaybe<T>> {
    return this._finalData()
  }
  private async _finalData() {
    return (await this.finalEvent).data
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
        // Yield the event, capture it in our internal event history,
        // and push it to any additional listeners who are waiting.
        yield event
        this.seenEvents.push(event)
        for (const listener of this.additionalListeners) listener(event)

        // If this is the final event, store it, resolve the final promise,
        // and break out of the event-receiving loop.
        //
        // If we have a misbehaving underlying generator that has more events
        // after the finish event, we'll be ignoring those.
        if ("finished" in event) {
          this.finalEventValue = event
          this.finalEventResolve(event)
          break
        }
      }
    } catch (e) {
      // If we catch an error, we need to reject the final promise and also
      // notify any additional listeners, so that each of them can stop
      // listening and throw the error to their outer caller.
      this.finalEventReject(e)
      for (const listener of this.additionalListeners)
        listener({ uncaughtError: e })

      // Finally we'll await on the promise we rejected above, to make sure
      // that the error is thrown to the outer caller, and ensure that it
      // doesn't "appear to be" an uncaught promise rejection.
      await this.finalEventPromise
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

    // If the stream is already finished (or errored), we don't need to actually
    // set up a listener. We can just join onto the final event promise,
    // to make sure we throw the error from it if the promise was rejected.
    if (this.finished) {
      await this.finalEventPromise
      return
    }

    // To make this generator work, we need to set up a replaceable promise
    // that will receive the next event (or error) via the listener callback.
    let nextEventResolve: (value: Promisable<KurtResultEvent<T>>) => void
    let nextEventReject: (reason?: unknown) => void
    let createNextEventPromise = () => {
      return new Promise<KurtResultEvent<T>>((resolve, reject) => {
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
      while (!this.finalEventValue) {
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

export const toFinal = async <T extends KurtSchemaInnerMaybe = undefined>(
  result: KurtResult<T>
): Promise<KurtResultEventFinal<T>> => {
  for await (const event of result) {
    if ("finished" in event) {
      return event
    }
  }
  throw new Error("Result didn't finish")
}
