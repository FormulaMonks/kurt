import type {
  Content,
  FinishReason,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  GenerateContentCandidate,
  GenerateContentRequest,
  GenerativeModel,
  GoogleSearchRetrievalTool,
  UsageMetadata,
  VertexAI as RealVertexAI,
} from "@google-cloud/vertexai"

export type VertexAI = RealVertexAI

export type VertexAIGenerativeModel = GenerativeModel & {
  generateContentStreamPATCHED(req: VertexAIRequest): VertexAIResponse
}

export type VertexAIMessage = Content

export type VertexAIRequest = GenerateContentRequest
export type VertexAISchema = FunctionDeclarationSchema
export type VertexAITool = FunctionDeclaration | GoogleSearchRetrievalTool
export type VertexAIResponse = Promise<{
  stream: AsyncIterable<VertexAIResponseChunk>
}>
export type VertexAIResponseChunk = {
  candidates?: VertexAIResponseChunkCandidate[]
  usageMetadata?: VertexAIUsageMetadata
}
export type VertexAIResponseChunkCandidate = Pick<
  GenerateContentCandidate,
  "content" | "finishReason"
> & {
  safetyRatings?: object[]
}
export type VertexAIResponseFunctionCall = NonNullable<
  VertexAIResponseChunkCandidate["content"]["parts"][number]["functionCall"]
>
export type VertexAIFinishReach = FinishReason
export type VertexAIUsageMetadata = UsageMetadata
