import { Kurt } from "@formula-monks/kurt"
import { KurtCache } from "@formula-monks/kurt-cache"
import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import OpenAI from "openai"
import { z } from "zod"

const cacheAdapter = new KurtCache(
  // This is the directory where the cache will be stored.
  `${__dirname}/.kurt-cache`,
  // This is the cache prefix. It should identify this adapter configuration,
  // If the prefix changes, prior matching cache entries will no longer match.
  "openai-gpt-3.5-turbo-0125",
  // This function will only be run the first time we encounter a cache miss.
  () =>
    new KurtOpenAI({
      openAI: new OpenAI(),
      model: "gpt-3.5-turbo-0125",
    })
)

const kurt = new Kurt(cacheAdapter)

const schema = z.object({ say: z.string().describe("A single word to say") })
const stream1 = kurt.generateStructuredData({ prompt: "Say hello!", schema })
const stream2 = kurt.generateStructuredData({ prompt: "Say hello!", schema })
const stream3 = kurt.generateStructuredData({ prompt: "Say hi!", schema })

console.log((await stream1.result).data) // (cache miss on first run)
console.log((await stream2.result).data) // (always cached; identical to prior)
console.log((await stream3.result).data) // (cache miss on first run)
