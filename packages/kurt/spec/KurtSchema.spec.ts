import { describe, expect, test } from "@jest/globals"
import { KurtSchema } from "../src/KurtSchema"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { JSONSchema7 } from "json-schema"

// The following examples can all go from JSONSchema7 to KurtSchema and
// back to JSONSchema7 without losing any information or changing shape.
//
// Not every case will be lossless, but these ones are proven to be
// by our test suite here.
const LOSSLESS_EXAMPLES: Record<string, JSONSchema7 & { type: "object" }> = {
  "minimal type examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description:
      "This is a simple object showing a few types with minimal specs",
    type: "object",
    additionalProperties: false,
    properties: {
      any: {},
      null: { type: "null" },
      bool: { type: "boolean" },
      int: { type: "integer" },
      num: { type: "number" },
      str: { type: "string" },
      arr: { type: "array" },
      obj: { type: "object", properties: {}, additionalProperties: false },
    },
  },

  "numeric constraint examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different numeric type constraints",
    type: "object",
    additionalProperties: false,
    properties: {
      percent: { type: "number", minimum: 0, maximum: 100 },
      even: { type: "integer", multipleOf: 2 },
      u64: { type: "integer", minimum: 0, maximum: 2 ** 64 - 1 },
    },
  },

  "string constraint examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different string type constraints",
    type: "object",
    additionalProperties: false,
    properties: {
      tweet: { type: "string", minLength: 1, maxLength: 280 },
      properNounEnglish: { type: "string", pattern: "^[A-Z][a-z]*$" },
    },
  },

  "string format examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different string type formates",
    type: "object",
    additionalProperties: false,
    properties: {
      mailAddr: { type: "string", format: "email" },
      ipAddrV4: { type: "string", format: "ipv4" },
      ipAddrV6: { type: "string", format: "ipv6" },
      webAddr: { type: "string", format: "uri" },
      isoDateTime: { type: "string", format: "date-time" },
      isoDate: { type: "string", format: "date" },
      isoTime: { type: "string", format: "time" },
      uniqueId: { type: "string", format: "uuid" },
    },
  },

  "enum examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different enum type examples",
    type: "object",
    additionalProperties: false,
    properties: {
      primaryColor: { type: "string", enum: ["red", "green", "blue"] },
    },
  },

  "array nesting examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types nested in an array type",
    type: "object",
    additionalProperties: false,
    properties: {
      threeNames: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
    },
  },

  "tuple nesting examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types nested in a tuple type",
    type: "object",
    additionalProperties: false,
    properties: {
      coord: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: [{ type: "number" }, { type: "number" }],
      },
    },
  },

  "object nesting examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types nested in an object type",
    type: "object",
    additionalProperties: false,
    properties: {
      person: {
        type: "object",
        properties: {
          name: { type: "string" },
          birth: { type: "string", format: "date" },
          isStudent: { type: "boolean" },
        },
        required: ["name", "birth"],
        additionalProperties: false,
      },
    },
  },

  "record examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types nested in a record type",
    type: "object",
    additionalProperties: false,
    properties: {
      addressBook: {
        type: "object",
        additionalProperties: { type: "string", format: "email" },
      },
    },
  },

  "intersection examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description:
      "This is showcasing different types nested in an intersection type",
    type: "object",
    additionalProperties: false,
    properties: {
      emailWithReasonableLength: {
        allOf: [
          { type: "string", format: "email" },
          { type: "string", minLength: 1, maxLength: 50 },
        ],
      },
    },
  },

  "union examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types nested in a union type",
    type: "object",
    additionalProperties: false,
    properties: {
      intOrString: {
        anyOf: [{ type: "integer" }, { type: "string" }],
      },
    },
  },

  "examples with descriptions": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types with descriptions",
    type: "object",
    additionalProperties: false,
    properties: {
      any: { description: "This could be anything" },
      none: { type: "null", description: "This must be nothing" },
      bool: { type: "boolean", description: "This is a boolean" },
      num: { type: "number", description: "This is a number" },
      int: { type: "integer", description: "This is an integer" },
      str: { type: "string", description: "This is a string" },
      arr: { type: "array", description: "This is an array" },
      tup: {
        type: "array",
        items: [
          { type: "number", description: "This is another number" },
          { type: "string", description: "This is another string" },
        ],
        minItems: 2,
        maxItems: 2,
        description: "This is a tuple",
      },
      obj: {
        type: "object",
        description: "This is an object",
        additionalProperties: false,
        properties: { foo: { type: "string", description: "This is nested" } },
      },
      rec: {
        type: "object",
        description: "This is a record",
        additionalProperties: { type: "string" },
      },
    },
  },

  "constant value examples": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types with constant values",
    type: "object",
    additionalProperties: false,
    properties: {
      alwaysTrue: { type: "boolean", const: true },
      alwaysFalse: { type: "boolean", const: false },
      alwaysZero: { type: "number", const: 0 },
      alwaysHello: { type: "string", const: "hello" },
    },
  },

  "examples with defaults": {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "This is showcasing different types with default values",
    type: "object",
    additionalProperties: false,
    properties: {
      defaultInt: { type: "integer", default: 42 },
      defaultStr: { type: "string", default: "hello" },
      defaultBool: { type: "boolean", default: true },
      defaultArr: { type: "array", default: [1, 2, 3] },
      defaultObj: {
        type: "object",
        additionalProperties: false,
        properties: { foo: { type: "string" } },
        default: { foo: "bar" },
      },
    },
  },
}

function withProp(type: JSONSchema7): JSONSchema7 & { type: "object" } {
  return { type: "object", properties: { nope: type } }
}

type UnsupportedExample = [string, JSONSchema7 & { type: "object" }]

const UNSUPPORTED_EXAMPLES: UnsupportedExample[] = [
  ...["if", "then", "else", "not"].map(
    (key): UnsupportedExample => [
      `'${key}' in JSONSchema7 is not supported by KurtSchema`,
      withProp({ [key]: { type: "string" } }),
    ]
  ),
  [
    "'oneOf' in JSONSchema7 is not supported by KurtSchema " +
      "(only 'anyOf' is supported)",
    withProp({ oneOf: [{ type: "integer" }, { type: "string" }] }),
  ],
  [
    "'bogus' in JSONSchema7 is not supported by KurtSchema as a string format",
    withProp({ type: "string", format: "bogus" }),
  ],
  ...["uniqueItems", "contains"].map(
    (key): UnsupportedExample => [
      `'${key}' in JSONSchema7 is not supported by KurtSchema in an array`,
      withProp({ type: "array", [key]: true }),
    ]
  ),
  ...["uniqueItems", "contains"].map(
    (key): UnsupportedExample => [
      `'${key}' in JSONSchema7 is not supported by KurtSchema in a tuple array`,
      withProp({
        type: "array",
        items: [{ type: "string" }, { type: "boolean" }],
        [key]: true,
      }),
    ]
  ),
  ...["minItems", "maxItems"].map(
    (key): UnsupportedExample => [
      [
        `'${key}' in JSONSchema7 is not supported by KurtSchema `,
        "in a tuple array (unless it exactly matches the number of 'items'",
      ].join(""),
      withProp({
        type: "array",
        items: [{ type: "string" }, { type: "number" }],
        [key]: 3,
      }),
    ]
  ),
  ...[
    "maxProperties",
    "minProperties",
    "required",
    "properties",
    "patternProperties",
    "dependencies",
    "propertyNames",
  ].map(
    (key): UnsupportedExample => [
      [
        `'${key}' in JSONSchema7 is not supported by KurtSchema `,
        "in an object with 'additionalProperties' (i.e. a 'Record' type)",
      ].join(""),
      withProp({
        type: "object",
        [key]: { type: "string" },
        additionalProperties: { type: "string" },
      }),
    ]
  ),
  ...[
    "maxProperties",
    "minProperties",
    "patternProperties",
    "dependencies",
    "propertyNames",
  ].map(
    (key): UnsupportedExample => [
      [
        `'${key}' in JSONSchema7 is not supported by KurtSchema `,
        "in an object (expected to have either entirely statically defined ",
        "'properties' or entirely open-ended 'additionalProperties')",
      ].join(""),
      withProp({
        type: "object",
        [key]: { type: "string" },
        properties: { foo: { type: "string" } },
      }),
    ]
  ),
  [
    "'$ref' in JSONSchema7 is not supported by KurtSchema",
    withProp({ $ref: "#/definitions/foo" }),
  ],
  [
    "an array value in JSONSchema7 is not supported by KurtSchema " +
      "as a constant/literal value",
    withProp({ type: "array", const: [1, 2, 3] }),
  ],
  [
    "an object value in JSONSchema7 is not supported by KurtSchema " +
      "as a constant/literal value",
    withProp({ type: "object", const: { foo: "bar" } }),
  ],
]

describe("KurtSchema", () => {
  describe("fromJSONSchema7", () => {
    for (const [testName, schema] of Object.entries(LOSSLESS_EXAMPLES)) {
      test(testName, () => {
        expect(zodToJsonSchema(KurtSchema.fromJSONSchema7(schema))).toEqual(
          schema
        )
      })
    }

    for (const [error, schema] of UNSUPPORTED_EXAMPLES) {
      test(`unsupported: ${error}`, () => {
        expect(() => KurtSchema.fromJSONSchema7(schema)).toThrow(error)
      })
    }
  })
})
