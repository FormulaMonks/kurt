import { Kurt, type KurtAdapter } from "@formula-monks/kurt"

import { KurtOpenAI } from "@formula-monks/kurt-open-ai"
import { OpenAI } from "openai"

import { KurtVertexAI } from "@formula-monks/kurt-vertex-ai"
import { VertexAI } from "@google-cloud/vertexai"

const DEFAULT_MODEL = "gpt-4o"

export const createKurt = (model: string | undefined): Kurt => {
  const adapter = findAdapter(model ?? DEFAULT_MODEL)
  if (!adapter) throw new Error(`Model ${model} is not supported.`)
  return new Kurt(adapter)
}

const findAdapter = (model: string): KurtAdapter | undefined => {
  if (KurtOpenAI.isSupportedModel(model))
    return new KurtOpenAI({ openAI: new OpenAI(), model })

  if (KurtVertexAI.isSupportedModel(model))
    return new KurtVertexAI({
      vertexAI: new VertexAI({
        project: process.env.VERTEX_AI_PROJECT ?? "my-project",
        location: process.env.VERTEX_AI_LOCATION ?? "us-central1",
      }),
      model,
    })
}
