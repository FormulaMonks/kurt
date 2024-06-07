import { createKurt } from "./util/createKurt"
const kurt = createKurt(process.env.KURT_MODEL)

const stream = kurt.generateNaturalLanguage({
  prompt: "Say hello!",
})

for await (const event of stream) {
  console.log(event)
}
// { chunk: "Hello" }
// { chunk: "!" }
// { chunk: " How" }
// { chunk: " can" }
// { chunk: " I" }
// { chunk: " assist" }
// { chunk: " you" }
// { chunk: " today" }
// { chunk: "?" }
// {
//   finished: true,
//   text: "Hello! How can I assist you today?",
//   data: undefined,
// }

const { text } = await stream.result
console.log(text) // "Hello! How can I assist you today?"
