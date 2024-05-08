import type { RequireExactlyOne } from "type-fest"
import type { KurtStream } from "./KurtStream"
import type {
  KurtSchema,
  KurtSchemaInner,
  KurtSchemaInnerMap,
  KurtSchemaMap,
  KurtSchemaMapSingleResult,
  KurtSchemaResult,
} from "./KurtSchema"

/**
 * Kurt wraps an LLM. You can use it to generate some output.
 *
 * The output will be non-deterministic, making it most suitable for
 * applications where next steps are slightly ambiguous or under-determined,
 * and where adaptation, statistical fuzziness, and small intuitive leaps
 * are more helpful than purely mechanical rule-following.
 *
 * This abstract class has the common methods implemented by each of the
 * LLM-specific Kurt libraries, so you can use this type for building
 * structured AI applications should work with any supported LLM.
 * That is, the only place your application should need to know about the
 * specific LLM is at the point of instantiation of one of the Kurt sub-classes.
 */
export abstract class Kurt {
  /**
   * Ask Kurt to generate some text in a natural language.
   *
   * This is useful for use cases such as:
   * - simple chatbot experiences
   * - summarizing or explaining some retrieved information
   * - transforming structured data to natural language
   */
  abstract generateNaturalLanguage(
    options: KurtGenerateNaturalLanguageOptions
  ): KurtStream

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
  abstract generateStructuredData<I extends KurtSchemaInner>(
    options: KurtGenerateStructuredDataOptions<I>
  ): KurtStream<KurtSchemaResult<I>>

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
  abstract generateWithOptionalTools<I extends KurtSchemaInnerMap>(
    options: KurtGenerateWithOptionalToolsOptions<I>
  ): KurtStream<KurtSchemaMapSingleResult<I> | undefined>
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
