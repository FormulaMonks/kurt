import type { OpenAI as RealOpenAI } from "openai"
import type { FunctionParameters } from "openai/resources"
import type {
  EasyInputMessage,
  FunctionTool,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseInputItem,
  WebSearchTool,
} from "openai/src/resources/responses/responses"
import type { ResponseStreamEvent } from "openai/resources/responses/responses"

export type OpenAI = RealOpenAI

export type OpenAIRequest = ResponseCreateParamsStreaming
export type OpenAIMessage =
  | EasyInputMessage
  | ResponseFunctionToolCall
  | ResponseInputItem.FunctionCallOutput

export type OpenAISchema = FunctionParameters
export type OpenAITool = FunctionTool | WebSearchTool
export type OpenAIResponse = Promise<AsyncIterable<OpenAIResponseChunk>>
export type OpenAIResponseChunk = ResponseStreamEvent
