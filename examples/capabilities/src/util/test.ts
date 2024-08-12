import type { Kurt } from "@formula-monks/kurt"

type TestResult = TestAssertError | undefined

const results = new Map<string, Map<string, [string, TestResult]>>()

let resultsFinishedPromiseResolve: () => void
const resultsFinishedPromise = new Promise<void>((resolve) => {
  resultsFinishedPromiseResolve = resolve
})
let additionalResultsExpectedCount = 0
resultsFinishedPromise
  .then(() => printTestResultsAndExit())
  .catch(console.error)

function testBegin(
  capabilityCategory: string,
  capability: string,
  description: string
) {
  const categoryMap =
    results.get(capabilityCategory) ?? new Map<string, [string, TestResult]>()
  results.set(capabilityCategory, categoryMap)

  additionalResultsExpectedCount += 1
}

function testDone(
  capabilityCategory: string,
  capability: string,
  description: string,
  result: TestResult
) {
  results.get(capabilityCategory)?.set(capability, [description, result])

  additionalResultsExpectedCount -= 1
  if (additionalResultsExpectedCount === 0) resultsFinishedPromiseResolve()
}

function printTestResultsAndExit() {
  let sawFailure = false

  for (const [category, categoryResults] of results) {
    console.log(`\n${category}`)
    for (const [capability, [description, error]] of categoryResults) {
      if (error) {
        sawFailure = true
        console.error(
          `  ❌ ${capability} (${description})\n${error.constructor.name}: ${error.message}`
        )
      } else {
        console.log(`  ✅ ${capability}`)
      }
    }
  }

  if (sawFailure) process.exit(1)
}

export function test(
  kurt: Kurt,
  category: string,
  capability: string,
  description: string,
  fn: (k: Kurt) => Promise<void>
) {
  testBegin(category, capability, description)

  fn(kurt)
    .then(() => testDone(category, capability, description, undefined))
    .catch((error) => testDone(category, capability, description, error))
}

export abstract class TestAssertError extends Error {}
export class TestAssertEqualError extends Error {
  constructor(
    readonly expected: unknown,
    readonly actual: unknown
  ) {
    super(`Expected:\n${expected}\nbut got:\n${actual}`)
  }
}

export function assertEqual(expected: unknown, actual: unknown) {
  if (actual !== expected) throw new TestAssertEqualError(expected, actual)
}
