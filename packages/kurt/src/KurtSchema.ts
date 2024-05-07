import type { ZodObject, ZodRawShape, infer as zodInfer } from "zod"

export type KurtSchemaInner = ZodRawShape
export type KurtSchema<I extends KurtSchemaInner> = ZodObject<I>
export type KurtSchemaResult<I extends KurtSchemaInner> = zodInfer<ZodObject<I>>

export type KurtSchemaInnerMaybe = KurtSchemaInner | undefined
export type KurtSchemaMaybe<I extends KurtSchemaInnerMaybe> =
  I extends KurtSchemaInner ? KurtSchema<I> : undefined
export type KurtSchemaResultMaybe<I extends KurtSchemaInnerMaybe> =
  I extends KurtSchemaInner ? KurtSchemaResult<I> : undefined

export type KurtSchemaInnerMap = { [key: string]: KurtSchemaInner }
export type KurtSchemaMap<I extends KurtSchemaInnerMap> = {
  [key in keyof I]: KurtSchema<I[key]>
}
export type KurtSchemaMapSingleResult<I extends KurtSchemaInnerMap> = {
  [K in keyof I]: {
    name: K
    args: KurtSchemaResult<I[K]>
  }
}[keyof I]
