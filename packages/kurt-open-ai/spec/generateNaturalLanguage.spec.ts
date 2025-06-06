import { describe, test, expect } from "@jest/globals"
import { snapshotAndMock, snapshotAndMockWithError } from "./snapshots"
import { KurtResultLimitError } from "@formula-monks/kurt"

describe("KurtOpenAI generateNaturalLanguage", () => {
  test("says hello", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Say hello!",
      })
    )
    expect(result.text).toEqual("Hello! How can I assist you today?")
  })

  test("writes a haiku with high temperature", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Compose a haiku about a mountain stream at night.",
        sampling: {
          maxOutputTokens: 100,
          temperature: 1.0,
          topP: 1.0,
        },
      })
    )
    expect(result.text).toEqual(
      [
        "Moonlight threads the pines,  ",
        "Whispers ripple in the stream—  ",
        "Stone dreams in darkness.",
      ].join("\n")
    )
  })

  test("throws a limit error", async () => {
    await snapshotAndMockWithError(
      "gpt-4o-2024-05-13",
      (kurt) =>
        kurt.generateNaturalLanguage({
          prompt: "Compose a haiku about content length limitations.",
          sampling: { maxOutputTokens: 5 }, // too few for a haiku
        }),

      (errorAny) => {
        expect(errorAny).toBeInstanceOf(KurtResultLimitError)
        const error = errorAny as KurtResultLimitError

        expect(error.text).toEqual(
          "The maximum output tokens limit was below the minimum value"
        )
      }
    )
  })

  test("describes a base64-encoded image (imageData)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Describe this emoji, in two words.",
        extraMessages: [
          {
            role: "user",
            imageData: {
              mimeType: "image/png",
              base64Data:
                "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=",
            },
          },
        ],
      })
    )
    expect(result.text).toEqual("Heart eyes.")
  })

  test("describes a base64-encoded image (inlineData)", async () => {
    const result = await snapshotAndMock("gpt-4o-2024-05-13", (kurt) =>
      kurt.generateNaturalLanguage({
        prompt: "Describe this emoji, in two words.",
        extraMessages: [
          {
            role: "user",
            inlineData: {
              mimeType: "image/png",
              base64Data:
                "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=",
            },
          },
        ],
      })
    )
    expect(result.text).toEqual("Heart eyes.")
  })

  test("throws an error when a message includes inline audio data", async () => {
    await snapshotAndMockWithError(
      "gpt-4o-2024-05-13",
      (kurt) =>
        kurt.generateNaturalLanguage({
          prompt: "Transcribe this audio file.",
          extraMessages: [
            {
              role: "user",
              inlineData: {
                mimeType: "audio/mpeg",
                base64Data: "DUMMYDATA",
              },
            },
          ],
        }),
      (errorAny) => {
        expect(errorAny).toBeInstanceOf(Error)
        expect(errorAny.message).toEqual(
          "Unsupported image MIME type: audio/mpeg"
        )
      }
    )
  })
})
