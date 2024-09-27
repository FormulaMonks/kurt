import type { RequireExactlyOne } from "type-fest"
import { KurtStream } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
} from "./KurtSchema"
import type { KurtAdapter } from "./KurtAdapter"

/**
 * Kurt wraps an LLM. You can use it to generate some output.
 *
 * The output will be non-deterministic, making it most suitable for
 * applications where next steps are slightly ambiguous or under-determined,
 * and where adaptation, statistical fuzziness, and small intuitive leaps
 * are more helpful than purely mechanical rule-following.
 *
 * This class has the common methods available across each of the LLMs
 * supported by Kurt, so you can use this class for building
 * structured AI applications should work with any supported LLM.
 * That is, the only place your application should need to know about the
 * specific LLM is at the point of instantiation of one of adapters.
 */
export class Kurt {
  constructor(
    readonly adapter: KurtAdapter,
    readonly options: KurtCreateOptions = {}
  ) {}

  /**
   * Ask Kurt to generate some text in a natural language.
   *
   * This is useful for use cases such as:
   * - simple chatbot experiences
   * - summarizing or explaining some retrieved information
   * - transforming structured data to natural language
   */
  generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream {
    return new KurtStream(
      this.adapter.transformNaturalLanguageFromRawEvents(
        this.adapter.generateRawEvents({
          messages: this.adapter.transformToRawMessages(
            this.makeMessages(options)
          ),
          sampling: this.makeSamplingOptions(options.sampling),
          tools: {},
        })
      )
    )
  }

  /**
   * Ask Kurt to generate some structured data with a particular schema.
   *
   * This is useful for use cases such as:
   * - making decisions or taking actions
   * - extracting structured data from natural language
   * - transforming structured data to a different structure
   * - generating synthetic data
   * - calling an API or creating a database record
   */
  generateStructuredData<I extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<I>
  ): KurtStream<KurtSchemaResult<I>> {
    return new KurtStream(
      this.adapter.transformStructuredDataFromRawEvents(
        options.schema,
        this.adapter.generateRawEvents({
          messages: this.adapter.transformToRawMessages(
            this.makeMessages(options)
          ),
          sampling: this.makeSamplingOptions(options.sampling),
          tools: {
            structured_data: this.adapter.transformToRawTool({
              name: "structured_data",
              description: options.schema.description ?? "",
              parameters: this.adapter.transformToRawSchema(options.schema),
            }),
          },
          forceTool: "structured_data",
        })
      )
    )
  }

  /**
   * Ask Kurt to either generate some text in natural language or invoke
   * one of the given tools (using the structured data schema for the tool),
   * using its own best judgment about what should come next.
   *
   * This is useful for use cases such as:
   * - tool-assisted chatbot experiences
   * - autonomous, open-ended decision-making or action-taking
   *
   * The `data` field of the result will be `undefined` if Kurt decides to
   * generate natural language. Otherwise it will contain a tool call.
   *
   * Your application can decide if and how it should fulfill the tool call.
   *
   * If you want to tell Kurt the result of the tool call so it can
   * generate again, call one Kurt's methods with the `extraMessages` option
   * set to an array containing a message with the `toolCall` property set
   * to convey the name, arguments, and result of the tool call, giving
   * information that Kurt can use to give a more informed response,
   * or to continue to the next step in a multi-step process.
   */
  generateWithOptionalTools<I extends KurtSchemaInnerMap>(
    options: KurtGenerateWithOptionalToolsOptions<I>
  ): KurtStream<KurtSchemaMapSingleResult<I> | undefined> {
    return new KurtStream(
      this.adapter.transformWithOptionalToolsFromRawEvents<I>(
        options.tools,
        this.adapter.generateRawEvents({
          messages: this.adapter.transformToRawMessages(
            this.makeMessages(options)
          ),
          sampling: this.makeSamplingOptions(options.sampling),
          tools: Object.fromEntries(
            Object.entries(options.tools).map(([name, schema]) => [
              name,
              this.adapter.transformToRawTool({
                name,
                description: schema.description,
                parameters: this.adapter.transformToRawSchema(schema),
              }),
            ])
          ),
        })
      )
    )
  }

  private makeMessages({
    systemPrompt = this.options.systemPrompt,
    prompt,
    extraMessages,
  }: KurtGenerateNaturalLanguageOptions): KurtMessage[] {
    const messages: KurtMessage[] = []

    if (systemPrompt) messages.push({ role: "system", text: systemPrompt })
    messages.push({ role: "user", text: prompt })
    if (extraMessages) messages.push(...extraMessages)

    return messages
  }

  private makeSamplingOptions(overrides?: KurtSamplingOptions) {
    const sampling = {
      ...KurtSamplingOptionsDefault,
      ...this.options.sampling,
      ...overrides,
    }

    // Round integers.
    sampling.maxOutputTokens = Math.round(sampling.maxOutputTokens)

    // Enforce "hard" limits.
    if (sampling.maxOutputTokens < 1)
      throw new Error(
        `maxOutputTokens must be at least 1 (got: ${sampling.maxOutputTokens})`
      )
    if (sampling.temperature < 0)
      throw new Error(
        `temperature must be no less than 0 (got: ${sampling.temperature})`
      )
    if (sampling.topP < 0)
      throw new Error(`topP must be no less than 0 (got: ${sampling.topP})`)
    if (sampling.topP > 1)
      throw new Error(`topP must be no greater than 1 (got: ${sampling.topP})`)

    // Enforce "soft" limits.
    if (sampling.temperature === 0) sampling.temperature = Number.MIN_VALUE
    if (sampling.topP === 0) sampling.topP = Number.MIN_VALUE

    return sampling
  }
}

export type KurtMessage = {
  /**
   * The originator of the message, being one of:
   * - "user" - the one whose request/prompt Kurt should aim to satisfy
   * - "model" - Kurt, the one generating the response to satisfy the prompt
   * - "system" - the governing system which guides Kurt's behavior
   */
  role: "user" | "model" | "system"
} & RequireExactlyOne<{
  /**
   * When present, this is a text message (often natural language).
   *
   * Only one of these content fields can be present in any given message.
   */
  text: string

  /**
   * When present, this is an image data message, with a base64-encoded image.
   * This is often used with "multi-modal" LLMs that support image mode input.
   *
   * Not all LLM providers or underlying models support this kind of message.
   * Check your LLM provider's documentation for confirmaton.
   */
  imageData: {
    /**
     * The IANA standard MIME type of the inline image data.
     *
     * Not all MIME types are supported by all LLM providers.
     * "image/png" and "image/jpeg" are the most commonly supported.
     * Check your LLM provider's documentation for the right list.
     */
    mimeType: string

    /** Base64-encoded image data, as a string. */
    base64Data: string
  }

  /**
   * When present, this is a tool call message, with structured data input
   * in the `args` object, and structured data output in the `result` object.
   *
   * Only one of these content fields can be present in any given message.
   *
   * Usually a message like this should be added into the message history
   * when the last generation from Kurt was a tool call generated from the
   * `generateWithOptionalTools` method, in which case this message will
   * inform Kurt in the next generation call about the result of the tool call.
   *
   * However, it sometimes may also be appropriate to insert a tool call
   * after a response from the `generateStructuredData` method, to keep the
   * structured data in the message history, along with any effects.
   * In other words, you can insert a tool call message at any time and for
   * any reason, and you can even insert one that Kurt never requested at all.
   *
   * The underlying LLM won't know the difference, because LLMs are not
   * stateful systems - the only state is kept here on the application side,
   * so you can manipulate or even fabricate the message history as you see fit.
   */
  toolCall: {
    /** The name of the tool that was called. */
    name: string

    /** The arguments object that the tool was called with as its input. */
    args: object

    /** The result object that the tool produced (outside of Kurt) as output. */
    result: object
  }
}>

export interface KurtCreateOptions {
  /**
   * The default system prompt to use, for any generation method call which
   * does not specify a different system prompt to override this one.
   *
   * The system prompt is intended to give extra guidance to Kurt about how
   * to behave, before the user prompt is given.
   *
   * Please note that while LLMs have been trained to follow system guidance,
   * they will not do so perfectly, and certain user prompts may still elicit
   * behavior that violates the guidance given in the system prompt. Therefore,
   * you shouldn't rely on system prompts alone for safety/security features.
   * But it's a good start and an easy first step to guide the LLM's behavior.
   */
  systemPrompt?: string

  /**
   * Default sampling options to use, for any generation method call which
   * does not specify a different sampling options that override these ones.
   */
  sampling?: KurtSamplingOptions
}

/**
 * Options which control how output tokens are sampled from the underlying LLM.
 */
export type KurtSamplingOptions = Partial<typeof KurtSamplingOptionsDefault>

/**
 * The default values to use for `KurtSamplingOptions` when the application
 * doesn't specify any explicit values to override them.
 *
 * These values are loosely based on the defaults for major LLM providers,
 * erring on the side of more conservative choices where there is variance.
 *
 * Kurt has uniform defaults no matter which LLM you select, rather than
 * using defaults which vary from one LLM provider to another, to make it
 * easier to "compare apples to apples" when using different LLMs with Kurt.
 */
export const KurtSamplingOptionsDefault = {
  /**
   * Maximum number of output tokens to sample from the model.
   *
   * This is mean to be a cost control measure, to protect against scenarios
   * where the model might get "stuck" and generate excessive output.
   *
   * When the model hits the output limit, whatever it has generated will
   * be cut off abruptly - the model has no awareness of this limit or how
   * concise its output needs to be, so if you need more concise output,
   * you'll need to include that in the (user or system) prompt instructions,
   * rather than relying on this parameter alone.
   */
  maxOutputTokens: 4096,

  /**
   * A factor to increase the amount of randomness in final token sampling.
   *
   * Along with `temperature`, this parameter can control the amount of
   * variation, "creativity", and topic drift of the generated output.
   * Higher values for each of these parameters will increase the variation,
   * but most LLM vendors recommend only adjusting one and not the other.
   * If you know what you're doing, then adjusting both may be helpful.
   *
   * Using a temperature value near 0 will cause sampling to almost always
   * choose the "most likely" next token from the "top tokens" set,
   * while increasing toward a value near 1 will make sampling more random.
   *
   * In all cases, the sampling occurs within the set of "top tokens" that
   * were above the cutoff thresholds introduced by `topK` and `topP`, so
   * even high temperatures will be constrained by those thresholds.
   *
   * Some models allow for values higher than 1, and the precise meaning
   * of this parameter is not consistently defined for all models,
   * so as much as Kurt would like to make the behavior uniform across
   * all supported LLMs, in practice you may need to tune this parameter
   * differently for different models used by your application.
   */
  temperature: 0.5,

  /**
   * The width of the "probability"-based filter for initial token sampling.
   *
   * Along with `temperature`, this parameter can control the amount of
   * variation, "creativity", and topic drift of the generated output.
   * Higher values for each of these parameters will increase the variation,
   * but most LLM vendors recommend only adjusting one and not the other.
   * If you know what you're doing, then adjusting both may be helpful.
   *
   * This parameter specifies the inclusiveness of the probability threshold
   * that must be met in order to consider a token for inclusion in the
   * "top tokens" set that is to be sampled from. This threshold filtering
   * happens before the `temperature` parameter is applied for sampling.
   *
   * Therefore, narrowing or widening this value will narrow/widen the set of
   * tokens that are considered for sampling, and decreasing or increasing
   * the temperature will modify how the selection happens within that set.
   *
   * Valid values are greater than 0 and less than or equal to 1.
   * A value of 1 means that all tokens are considered for sampling,
   * without any "top tokens" filtering being applied before sampling.
   */
  topP: 0.95,
}

export interface KurtGenerateNaturalLanguageOptions {
  /**
   * The system prompt to use for this generation, as the first message.
   *
   * The system prompt is intended to give extra guidance to Kurt about how
   * to behave, before the user prompt is given.
   *
   * Please note that while LLMs have been trained to follow system guidance,
   * they will not do so perfectly, and certain user prompts may still elicit
   * behavior that violates the guidance given in the system prompt. Therefore,
   * you shouldn't rely on system prompts alone for safety/security features.
   * But it's a good start and an easy first step to guide the LLM's behavior.
   */
  systemPrompt?: string

  /**
   * The initial user prompt to use for this generation.
   * This will often specify the main objective for Kurt to aim to satisfy,
   * or the main user question to be answered.
   *
   * Additional user prompts can be given as `extraMessages` in the message
   * history, carrying on a further conversation or refining the request.
   */
  prompt: string

  /**
   * Any extra messages to include in the message history, beyond the initial
   * user prompt and optional system prompt.
   *
   * The content of these messages will often be sourced from prior calls to
   * Kurt, but there's no constraint that requires this - the message history
   * can contain any messages you like, and you can even fabricate an entire
   * conversation or series of prior steps, and the LLM will behave as if
   * it is merely continuing from that point.
   *
   * The underlying LLM won't know the difference, because LLMs are not
   * stateful systems - the only state is kept here on the application side,
   * so you can manipulate or even fabricate the message history as you see fit.
   */
  extraMessages?: KurtMessage[]

  /**
   * Sampling options to use for this generation.
   *
   * Any options not specified here will be taken from the options given
   * in the constructor call for this Kurt instance if present there, or
   * otherwise from the `KurtSamplingOptionsDefault` values.
   */
  sampling?: KurtSamplingOptions
}

export type KurtGenerateStructuredDataOptions<I extends KurtSchemaInner> =
  KurtGenerateNaturalLanguageOptions & {
    /**
     * The structured data schema specifying the shape of the output for
     * this generation. Kurt will be forced to generate output that matches
     * this schema (or raise an error if the LLM failed to do so).
     *
     * Note that Kurt only supports LLMs that have a feature to force the
     * generation of structured data, so any failure to do so should be a bug
     * within the LLM. That said, this does happen with some LLM providers.
     */
    schema: KurtSchema<I>
  }

export type KurtGenerateWithOptionalToolsOptions<I extends KurtSchemaInnerMap> =
  KurtGenerateNaturalLanguageOptions & {
    /**
     * A map of tools that Kurt can optionally invoke during the generation.
     *
     * Each key is the name of an available tool, and the corresponding value
     * is the structured data schema specifying the shape of the input for
     * invoking that tool, should Kurt choose to invoke it.
     */
    tools: KurtSchemaMap<I>
  }
