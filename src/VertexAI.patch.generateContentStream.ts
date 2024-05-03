///
// The @google-cloud/vertexai package currently doesn't allow using v1beta1
// APIs, so we need to patch the postRequest function to set that apiVersion.
//
// For more information on why we need this, see the following feature ticket:
// See https://github.com/googleapis/nodejs-vertexai/issues/331
//
// The below code is copy-pasted directly from the @google-cloud/vertexai
// source code, with the only modifications being:
// - the import statements being adjusted to point to the correct file locations
// - the apiVersion being set to "v1beta1" instead of the default "v1"
// - `prettier` formatting applied to match the surrounding codebase
//
// The open source license for that library is reproduced below, and it only
// should be considered to apply to this one file that copies their code.

import type { VertexAIGenerativeModel } from "./VertexAI.types"

/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Make a async call to generate content.
 * @param request A GenerateContentRequest object with the request contents.
 * @returns The GenerateContentResponse object with the response candidates.
 */

import {
  GenerateContentRequest,
  GenerateContentResult,
  GenerationConfig,
  RequestOptions,
  SafetySetting,
  StreamGenerateContentResult,
  Tool,
} from "@google-cloud/vertexai/build/src/types/content"
import { GoogleGenerativeAIError } from "@google-cloud/vertexai/build/src/types/errors"
import * as constants from "@google-cloud/vertexai/build/src/util/constants"

import {
  processUnary,
  processStream,
  throwErrorIfNotOK,
} from "@google-cloud/vertexai/build/src/functions/post_fetch_processing"
import { postRequest } from "@google-cloud/vertexai/build/src/functions/post_request"
import {
  formatContentRequest,
  validateGenerateContentRequest,
  validateGenerationConfig,
} from "@google-cloud/vertexai/build/src/functions/pre_fetch_processing"
import { GenerativeModel, VertexAI } from "@google-cloud/vertexai"

export async function generateContent(
  location: string,
  project: string,
  publisherModelEndpoint: string,
  token: Promise<string | null | undefined>,
  request: GenerateContentRequest | string,
  apiEndpoint?: string,
  generationConfig?: GenerationConfig,
  safetySettings?: SafetySetting[],
  tools?: Tool[],
  requestOptions?: RequestOptions
): Promise<GenerateContentResult> {
  request = formatContentRequest(request, generationConfig, safetySettings)

  validateGenerateContentRequest(request)

  if (request.generationConfig) {
    request.generationConfig = validateGenerationConfig(
      request.generationConfig
    )
  }

  const generateContentRequest: GenerateContentRequest = {
    contents: request.contents,
    systemInstruction: request.systemInstruction,
    generationConfig: request.generationConfig ?? generationConfig,
    safetySettings: request.safetySettings ?? safetySettings,
    tools: request.tools ?? tools,
  }
  const response: Response | undefined = await postRequest({
    region: location,
    project: project,
    resourcePath: publisherModelEndpoint,
    resourceMethod: constants.GENERATE_CONTENT_METHOD,
    token: await token,
    data: generateContentRequest,
    apiEndpoint: apiEndpoint,
    requestOptions: requestOptions,
    apiVersion: "v1beta1", // (CHANGE) Set the apiVersion to "v1beta1"
  }).catch((e) => {
    throw new GoogleGenerativeAIError("exception posting request to model", e)
  })
  await throwErrorIfNotOK(response).catch((e) => {
    throw e
  })
  return processUnary(response)
}

/**
 * Make an async stream request to generate content. The response will be
 * returned in stream.
 * @param {GenerateContentRequest} request - {@link GenerateContentRequest}
 * @returns {Promise<StreamGenerateContentResult>} Promise of {@link
 *     StreamGenerateContentResult}
 */
export async function generateContentStream(
  location: string,
  project: string,
  publisherModelEndpoint: string,
  token: Promise<string | null | undefined>,
  request: GenerateContentRequest | string,
  apiEndpoint?: string,
  generationConfig?: GenerationConfig,
  safetySettings?: SafetySetting[],
  tools?: Tool[],
  requestOptions?: RequestOptions
): Promise<StreamGenerateContentResult> {
  request = formatContentRequest(request, generationConfig, safetySettings)
  validateGenerateContentRequest(request)

  if (request.generationConfig) {
    request.generationConfig = validateGenerationConfig(
      request.generationConfig
    )
  }

  const generateContentRequest: GenerateContentRequest = {
    contents: request.contents,
    systemInstruction: request.systemInstruction,
    generationConfig: request.generationConfig ?? generationConfig,
    safetySettings: request.safetySettings ?? safetySettings,
    tools: request.tools ?? tools,
  }
  const response = await postRequest({
    region: location,
    project: project,
    resourcePath: publisherModelEndpoint,
    resourceMethod: constants.STREAMING_GENERATE_CONTENT_METHOD,
    token: await token,
    data: generateContentRequest,
    apiEndpoint: apiEndpoint,
    requestOptions: requestOptions,
    apiVersion: "v1beta1", // (CHANGE) Set the apiVersion to "v1beta1"
  }).catch((e) => {
    throw new GoogleGenerativeAIError("exception posting request", e)
  })
  await throwErrorIfNotOK(response).catch((e) => {
    throw e
  })
  return processStream(response)
}

///
// Below this section is code from generative_models.ts in the library repo,
// modified to use the patched generateContentStream function.

;(
  GenerativeModel as unknown as { prototype: VertexAIGenerativeModel }
).prototype.generateContentStreamPATCHED = generateContentStreamPATCHED

async function generateContentStreamPATCHED(
  this: VertexAI,
  request: GenerateContentRequest
): Promise<StreamGenerateContentResult> {
  return generateContentStream(
    (this as any).location,
    (this as any).project,
    (this as any).publisherModelEndpoint,
    (this as any).fetchToken(),
    request,
    (this as any).apiEndpoint,
    (this as any).generationConfig,
    (this as any).safetySettings,
    (this as any).tools,
    (this as any).requestOptions
  )
}
