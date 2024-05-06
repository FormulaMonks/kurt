import { describe, expect, test } from "@jest/globals"
import { z } from "zod"
import { KurtStream, type KurtStreamEvent } from "../src/KurtStream"

function kurtSayHelloEvents() {
  return [
    { chunk: '{"' },
    { chunk: "say" },
    { chunk: '":"' },
    { chunk: "hello" },
    { chunk: '"}' },
    {
      finished: true,
      text: '{"say":"hello"}',
      data: { say: "hello" },
    },
  ]
}

function kurtSayHelloResult() {
  const events = kurtSayHelloEvents()
  // biome-ignore lint/style/noNonNullAssertion: Pending explanation
  return events[events.length - 1]!
}

function kurtStreamSayHello(
  opts: {
    errorBeforeFinish?: boolean
  } = {}
) {
  const schema = z.object({ say: z.string() })
  return new KurtStream<(typeof schema)["shape"]>(
    (async function* gen() {
      const events = kurtSayHelloEvents()

      for (const event of events) {
        // Wait a bit before sending the event, so we can interleave things.
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Throw an error before finishing, if requested.
        if (opts.errorBeforeFinish && event.finished) throw new Error("Whoops!")

        // Send the event.
        yield event as KurtStreamEvent<(typeof schema)["shape"]>
      }
    })()
  )
}

async function expectThrow(message: string, fn: () => Promise<unknown>) {
  let error: unknown
  try {
    await fn()
  } catch (e: unknown) {
    error = e
  }
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toBe(message)
}

describe("KurtResult", () => {
  test("with an await for final event", async () => {
    const stream = kurtStreamSayHello()

    expect(await stream.result).toEqual(kurtSayHelloResult())
  })

  test("with an await for final event catching an error", async () => {
    const stream = kurtStreamSayHello({ errorBeforeFinish: true })

    expectThrow("Whoops!", async () => await stream.result)
  })

  test("with one event listener", async () => {
    const stream = kurtStreamSayHello()

    const events: unknown[] = []
    for await (const event of stream) events.push(event)

    expect(events).toEqual(kurtSayHelloEvents())
  })

  test("with one event listener, catching an error", async () => {
    const stream = kurtStreamSayHello({ errorBeforeFinish: true })

    const events: unknown[] = []
    await expectThrow("Whoops!", async () => {
      for await (const event of stream) events.push(event)
    })

    expect(events).toEqual(kurtSayHelloEvents().slice(0, -1))
  })

  test("with final awaits before listener", async () => {
    const stream = kurtStreamSayHello()

    expect(await stream.result).toEqual(kurtSayHelloResult())
    expect(await stream.result).toEqual(kurtSayHelloResult())
    expect(await stream.result).toEqual(kurtSayHelloResult())

    const events: unknown[] = []
    for await (const event of stream) events.push(event)

    expect(events).toEqual(kurtSayHelloEvents())
  })

  test("with final awaits after listener", async () => {
    const stream = kurtStreamSayHello()

    const events: unknown[] = []
    for await (const event of stream) events.push(event)

    expect(await stream.result).toEqual(kurtSayHelloResult())
    expect(await stream.result).toEqual(kurtSayHelloResult())
    expect(await stream.result).toEqual(kurtSayHelloResult())

    expect(events).toEqual(kurtSayHelloEvents())
  })

  test("with three listeners, each after the last one finished", async () => {
    const stream = kurtStreamSayHello()

    const events1: unknown[] = []
    const events2: unknown[] = []
    const events3: unknown[] = []
    for await (const event of stream) events1.push(event)
    for await (const event of stream) events2.push(event)
    for await (const event of stream) events3.push(event)

    expect(events1).toEqual(kurtSayHelloEvents())
    expect(events2).toEqual(kurtSayHelloEvents())
    expect(events2).toEqual(kurtSayHelloEvents())
  })

  test("with three listeners, each catching an error", async () => {
    const stream = kurtStreamSayHello({ errorBeforeFinish: true })

    const events1: unknown[] = []
    const events2: unknown[] = []
    const events3: unknown[] = []
    await expectThrow("Whoops!", async () => {
      for await (const event of stream) events1.push(event)
    })
    await expectThrow("Whoops!", async () => {
      for await (const event of stream) events2.push(event)
    })
    await expectThrow("Whoops!", async () => {
      for await (const event of stream) events3.push(event)
    })

    expect(events1).toEqual(kurtSayHelloEvents().slice(0, -1))
    expect(events2).toEqual(kurtSayHelloEvents().slice(0, -1))
    expect(events2).toEqual(kurtSayHelloEvents().slice(0, -1))
  })

  test("with many listeners, interleaved with one another", async () => {
    const stream = kurtStreamSayHello()

    const events: unknown[][] = []
    const listeners: Promise<unknown>[] = []
    async function listen(spawnMoreListeners = false) {
      events.push([])
      const listenerIndex = events.length - 1
      for await (const event of stream) {
        events[listenerIndex]?.push(event)
        if (spawnMoreListeners) listeners.push(listen())
      }
    }
    listeners.push(listen(true))

    let lastListenerCount = 0
    while (listeners.length !== lastListenerCount) {
      lastListenerCount = listeners.length
      await Promise.all(listeners)
    }

    expect(events.length).toBe(7)
    for (const e of events) {
      expect(e).toEqual(kurtSayHelloEvents())
    }
  })

  test("with many listeners, interleaved with final event awaits", async () => {
    const stream = kurtStreamSayHello()

    const events: unknown[][] = []
    const listeners: Promise<unknown>[] = []
    const awaits: Promise<unknown>[] = []
    async function listen(spawnMoreListeners = false) {
      events.push([])
      const listenerIndex = events.length - 1
      for await (const event of stream) {
        events[listenerIndex]?.push(event)
        if (spawnMoreListeners) {
          listeners.push(listen())
          awaits.push(
            (async () =>
              expect(await stream.result).toEqual(kurtSayHelloResult()))()
          )
        }
      }
    }
    listeners.push(listen(true))

    let lastListenerCount = 0
    while (listeners.length !== lastListenerCount) {
      lastListenerCount = listeners.length
      await Promise.all(listeners)
    }
    await Promise.all(awaits)

    expect(events.length).toBe(7)
    for (const e of events) {
      expect(e).toEqual(kurtSayHelloEvents())
    }
  })

  test("with many listeners/awaits, interleaved, with error", async () => {
    const stream = kurtStreamSayHello({ errorBeforeFinish: true })

    const events: unknown[][] = []
    const listeners: Promise<unknown>[] = []
    const errors: Promise<unknown>[] = []
    async function listen(spawnMoreListeners = false) {
      events.push([])
      const listenerIndex = events.length - 1
      for await (const event of stream) {
        events[listenerIndex]?.push(event)
        if (spawnMoreListeners) {
          const listener = listen()
          listeners.push(listener)
          errors.push(expectThrow("Whoops!", async () => await listener))
          errors.push(expectThrow("Whoops!", async () => await stream.result))
        }
      }
    }
    listeners.push(listen(true))

    let lastListenerCount = 0
    while (listeners.length !== lastListenerCount) {
      lastListenerCount = listeners.length
      await expectThrow("Whoops!", async () => await Promise.all(listeners))
    }
    await Promise.all(errors)

    expect(events.length).toBe(6)
    for (const e of events) {
      expect(e).toEqual(kurtSayHelloEvents().slice(0, -1))
    }
  })
})
