import type {
  VertexAI as RealVertexAI,
  GenerativeModel,
  Content,
  GenerateContentRequest,
  GenerateContentCandidate,
  FunctionDeclaration,
  FunctionDeclarationSchema,
} from "@google-cloud/vertexai"

export type VertexAI = RealVertexAI

export type VertexAIGenerativeModel = GenerativeModel & {
  generateContentStreamPATCHED(req: VertexAIRequest): VertexAIResponse
}

export type VertexAIMessage = Content

export type VertexAIRequest = GenerateContentRequest & {
  tool_config?: {
    function_calling_config?: {
      mode: "AUTO" | "NONE" | "ANY"
      allowed_function_names?: string[]
    }
  }
}
export type VertexAISchema = FunctionDeclarationSchema
export type VertexAITool = FunctionDeclaration
export type VertexAIResponse = Promise<{
  stream: AsyncGenerator<VertexAIResponseChunk>
}>
export type VertexAIResponseChunk = {
  candidates?: VertexAIResponseChunkCandidate[]
}
export type VertexAIResponseChunkCandidate = Pick<
  GenerateContentCandidate,
  "content" | "finishReason"
>
