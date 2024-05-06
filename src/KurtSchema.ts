import type { ZodObject, ZodRawShape, infer as zodInfer } from "zod"

export type KurtSchemaInner = ZodRawShape
export type KurtSchema<T extends KurtSchemaInner> = ZodObject<T>
export type KurtSchemaResult<T extends KurtSchemaInner> = zodInfer<ZodObject<T>>

export type KurtSchemaInnerMaybe = KurtSchemaInner | undefined
export type KurtSchemaMaybe<T extends KurtSchemaInnerMaybe> =
  T extends KurtSchemaInner ? KurtSchema<T> : undefined
export type KurtSchemaResultMaybe<T extends KurtSchemaInnerMaybe> =
  T extends KurtSchemaInner ? KurtSchemaResult<T> : undefined
