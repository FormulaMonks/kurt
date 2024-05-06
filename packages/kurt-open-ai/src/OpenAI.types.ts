import type { OpenAI as RealOpenAI } from "openai"
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/index"

export type OpenAI = RealOpenAI

export type OpenAIRequest = ChatCompletionCreateParamsStreaming
export type OpenAIMessage = ChatCompletionMessageParam
export type OpenAIResponse = Promise<AsyncIterable<OpenAIResponseChunk>>
export type OpenAIResponseChunk = {
  choices: Pick<
    ChatCompletionChunk["choices"][number],
    "delta" | "finish_reason"
  >[]
}
