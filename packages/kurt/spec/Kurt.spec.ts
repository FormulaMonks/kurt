import { describe, expect, test } from "@jest/globals"
import { FakeAdapterV1 } from "./FakeAdapterV1"
import {
  Kurt,
  type KurtCreateOptions,
  type KurtSamplingOptions,
  KurtSamplingOptionsDefault,
} from "../src/Kurt"

function createV1(options: KurtCreateOptions = {}) {
  const adapter = new FakeAdapterV1()
  const kurt = new Kurt(adapter, options)
  return { adapter, kurt }
}

describe("Kurt", () => {
  describe("sampling options", () => {
    test("using entirely default values by default", async () => {
      const { adapter, kurt } = createV1()

      kurt.generateNaturalLanguage({ prompt: "Hello!" })

      expect(adapter.lastGenerateRawEventsCall?.sampling).toEqual(
        KurtSamplingOptionsDefault
      )
    })

    test("using full overrides on creation", async () => {
      const sampling: Required<KurtSamplingOptions> = {
        maxOutputTokens: 1024,
        temperature: 0.1,
        topP: 0.5,
        forceSchemaConstrainedTokens: true,
      }
      const { adapter, kurt } = createV1({ sampling })

      kurt.generateNaturalLanguage({ prompt: "Hello!" })

      expect(adapter.lastGenerateRawEventsCall?.sampling).toEqual(sampling)
    })

    test("using full overrides on generate call", async () => {
      const { adapter, kurt } = createV1()

      const sampling: Required<KurtSamplingOptions> = {
        maxOutputTokens: 1024,
        temperature: 0.1,
        topP: 0.5,
        forceSchemaConstrainedTokens: true,
      }
      kurt.generateNaturalLanguage({ prompt: "Hello!", sampling })

      expect(adapter.lastGenerateRawEventsCall?.sampling).toEqual(sampling)
    })

    test("using partial overrides at each layer", async () => {
      const { adapter, kurt } = createV1({
        sampling: {
          maxOutputTokens: 999, // will be shadowed by the generate call value
          temperature: 0.1, // will not be shadowed
        },
      })

      kurt.generateNaturalLanguage({
        prompt: "Hello!",
        sampling: { maxOutputTokens: 1024 },
      })

      expect(adapter.lastGenerateRawEventsCall?.sampling).toEqual({
        ...KurtSamplingOptionsDefault,
        temperature: 0.1,
        maxOutputTokens: 1024,
      })
    })

    test("complains when values violate certain bounds", () => {
      const { kurt } = createV1()

      expect(() =>
        kurt.generateNaturalLanguage({
          prompt: "Hello!",
          sampling: { maxOutputTokens: 0 },
        })
      ).toThrow("maxOutputTokens must be at least 1 (got: 0)")

      expect(() =>
        kurt.generateNaturalLanguage({
          prompt: "Hello!",
          sampling: { temperature: -0.1 },
        })
      ).toThrow("temperature must be no less than 0 (got: -0.1)")

      expect(() =>
        kurt.generateNaturalLanguage({
          prompt: "Hello!",
          sampling: { topP: -0.1 },
        })
      ).toThrow("topP must be no less than 0 (got: -0.1)")

      expect(() =>
        kurt.generateNaturalLanguage({
          prompt: "Hello!",
          sampling: { topP: 1.1 },
        })
      ).toThrow("topP must be no greater than 1 (got: 1.1)")
    })

    test("silently coerces values when violating certain other constraints", () => {
      const { adapter, kurt } = createV1()

      kurt.generateNaturalLanguage({
        prompt: "Hello!",
        sampling: { maxOutputTokens: 1023.5, temperature: 0, topP: 0 },
      })

      expect(adapter.lastGenerateRawEventsCall?.sampling).toEqual({
        ...KurtSamplingOptionsDefault,
        maxOutputTokens: 1024,
        temperature: Number.MIN_VALUE,
        topP: Number.MIN_VALUE,
      })
    })
  })
})
