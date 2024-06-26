import type { OpenAI as RealOpenAI } from "openai"
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  FunctionParameters,
  ChatCompletionTool,
  ChatCompletionChunk,
  CompletionUsage,
} from "openai/resources/index"

export type OpenAI = RealOpenAI

export type OpenAIRequest = ChatCompletionCreateParamsStreaming
export type OpenAIMessage = ChatCompletionMessageParam
export type OpenAISchema = FunctionParameters
export type OpenAITool = ChatCompletionTool
export type OpenAIResponse = Promise<AsyncIterable<OpenAIResponseChunk>>
export type OpenAIResponseChunk = {
  choices: Pick<
    ChatCompletionChunk["choices"][number],
    "delta" | "finish_reason"
  >[]
  usage?: Pick<CompletionUsage, "prompt_tokens" | "completion_tokens"> | null
  system_fingerprint?: string | null
}
