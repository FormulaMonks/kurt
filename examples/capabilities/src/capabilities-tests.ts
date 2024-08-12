import { z } from "zod"
import { createKurt } from "./util/createKurt"
import { test, assertEqual } from "./util/test"

const kurt = createKurt(process.env.KURT_MODEL)

test(
  kurt,
  "advanced-schemas",
  "any-of",
  "using a type union in a data schema",
  async (kurt) =>
    assertEqual(
      '{"button":"green"}',
      JSON.stringify(
        (
          await kurt.generateStructuredData({
            prompt: "Press the green button",

            schema: z.object({
              press: z.union([
                z.object({
                  button: z
                    .string()
                    .describe("The color of the button to press"),
                }),
                z.object({
                  coffee: z.string().describe("The coffee kind to press"),
                }),
              ]),
            }),
          }).result
        ).data.press
      )
    )
)

// test(
//   kurt,
//   "data-escapes",
//   "single-quote",
//   "returning a single quote character inside a structured data string",
//   async (kurt) =>
//     assertEqual(
//       "Bob took Alice's ball.",
//       (
//         await kurt.generateStructuredData({
//           prompt: [
//             "Repeat the sentence below that mentions Alice:",
//             "- Bob played.",
//             "- Bob took Alice's ball.",
//           ].join("\n"),

//           schema: z.object({
//             repeat: z.string().describe("The full sentence to repeat"),
//           }),
//         }).result
//       ).data.repeat
//     )
// )

// test(
//   kurt,
//   "data-escapes",
//   "double-quotes",
//   "returning two double quote characters inside a structured data string",
//   async (kurt) =>
//     assertEqual(
//       'Bob said "Hello" to Alice.',
//       (
//         await kurt.generateStructuredData({
//           prompt: [
//             "Repeat the sentence below that mentions Alice:",
//             "- Bob played.",
//             '- Bob said "Hello" to Alice.',
//           ].join("\n"),

//           schema: z.object({
//             repeat: z.string().describe("The full sentence to repeat"),
//           }),
//         }).result
//       ).data.repeat
//     )
// )
