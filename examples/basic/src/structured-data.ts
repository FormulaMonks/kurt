import { z } from "zod"
import { createKurt } from "./util/createKurt"
const kurt = createKurt(process.env.KURT_MODEL)

const structuredDataStream = kurt.generateStructuredData({
  prompt: "Say hello!",
  schema: z.object({
    say: z.string().describe("A single word to say"),
  }),
})

for await (const event of structuredDataStream) {
  console.log(event)
}
// { chunk: '{"' }
// { chunk: "say" }
// { chunk: '":"' }
// { chunk: "hello" }
// { chunk: '"}' }
// { finished: true, text: '{"say":"hello"}', data: { say: "hello" } }

const { data } = await structuredDataStream.result
console.log(data)
// { say: "hello" }
