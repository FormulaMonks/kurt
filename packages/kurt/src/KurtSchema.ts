import type { ZodObject, ZodRawShape, infer as zodInfer } from "zod"
import { fromJSONSchema7 } from "./KurtSchema.fromJSONSchema7"
import type { KurtTool } from "./KurtTools"

export const KurtSchema = {
  fromJSONSchema7,
}

/**
 * The inner shape of a Kurt schema; used as a type parameter for functions
 * where the schema type needs to be known by the type system.
 *
 * The schema type itself is given by {@link KurtSchema} with the type argument
 * passed from a type that `extends KurtSchemaInner`.
 *
 * The value type indicated by the schema is given by {@link KurtSchemaResult}
 * with the type argument passed from a type that `extends KurtSchemaInner`.
 */
export type KurtSchemaInner = ZodRawShape

/**
 * A Kurt schema, which is a Zod object schema.
 *
 * See [the Zod docs](https://github.com/colinhacks/zod/blob/master/README.md)
 * for more information on how to define a schema.
 *
 * For functions that take a schema as a parameter, the type argument for
 * the schema should be a type that `extends KurtSchemaInner`.
 */
export type KurtSchema<I extends KurtSchemaInner> = ZodObject<I>

/**
 * The type of a value that has been validated to match a {@link KurtSchema}.
 *
 * For functions that emit a schema-validated value as a return type,
 * the type argument for this type should be the same type argument that
 * `extends KurtSchemaInner` which was given to the {@link KurtSchema} type.
 */
export type KurtSchemaResult<I extends KurtSchemaInner> = zodInfer<ZodObject<I>>

/**
 * An optional {@link KurtSchemaInner}.
 *
 * Used as a type parameter constraint for functions which accept an optional
 * {@link KurtSchema}, and/or emit an optional {@link KurtSchemaResult}.
 */
export type KurtSchemaInnerMaybe = KurtSchemaInner | undefined

/**
 * An optional {@link KurtSchema}, using a type that
 * `extends` {@link KurtSchemaInnerMaybe} as a type argument.
 */
export type KurtSchemaMaybe<I extends KurtSchemaInnerMaybe> =
  I extends KurtSchemaInner ? KurtSchema<I> : undefined

/**
 * An optional {@link KurtSchemaResult}, using a type that
 * `extends` {@link KurtSchemaInnerMaybe} as a type argument.
 */
export type KurtSchemaResultMaybe<I extends KurtSchemaInnerMaybe> =
  I extends KurtSchemaInner ? KurtSchemaResult<I> : undefined

/**
 * A set of named {@link KurtSchemaInner} shapes, used as a type parameter
 * for functions that deal with a {@link KurtSchemaMap} of named schemas.
 */
export type KurtSchemaInnerMap = { [key: string]: KurtSchemaInner }

/**
 * A set of named {@link KurtSchema}s, using a type that
 * `extends` {@link KurtSchemaInnerMaybe} as a type argument.
 *
 * This is often used for a set of named tool schemas available to Kurt.
 */
export type KurtSchemaMap<I extends KurtSchemaInnerMap> = {
  [key in keyof I]: KurtSchema<I[key]> | KurtTool
}

/**
 * A single {@link KurtSchemaResult} value that has been validated to match a
 * particular named result schema from a {@link KurtSchemaMap}.
 *
 * This is often used for representing a tool call from Kurt.
 *
 * It is a mapped type, so the type of the result value will track cleanly
 * with the named schema from a {@link KurtSchemaMap}, as long as both
 * are given the same type argument that `extends` {@link KurtSchemaInnerMap}.
 */
export type KurtSchemaMapSingleResult<I extends KurtSchemaInnerMap> = {
  [K in keyof I]: {
    name: K
    args: KurtSchemaResult<I[K]>
  }
}[keyof I]
