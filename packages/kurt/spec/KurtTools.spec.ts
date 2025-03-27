import { describe, expect, it } from "@jest/globals"
import { KurtTools } from "../src"

describe("KurtTools.isKurtTool", () => {
  it("should return true for tools created via KurtTools factory methods", () => {
    const webSearchTool = KurtTools.WebSearch()
    expect(KurtTools.isKurtTool(webSearchTool)).toBe(true)
  })

  it("should create new instances each time a factory method is called", () => {
    const tool1 = KurtTools.WebSearch()
    const tool2 = KurtTools.WebSearch()

    expect(tool1).not.toBe(tool2) // Different instances
    expect(tool1).toEqual(tool2) // But equivalent in structure
  })

  it("should return false for objects that look like KurtTools but are not instances", () => {
    const fakeTool = { type: "web_search" }
    expect(KurtTools.isKurtTool(fakeTool)).toBe(false)
  })

  it("should return false for primitive values", () => {
    expect(KurtTools.isKurtTool(null)).toBe(false)
    expect(KurtTools.isKurtTool(undefined)).toBe(false)
    expect(KurtTools.isKurtTool(42)).toBe(false)
    expect(KurtTools.isKurtTool("string")).toBe(false)
    expect(KurtTools.isKurtTool(true)).toBe(false)
  })

  it("should return false for objects that are not KurtTools", () => {
    const randomObject = { foo: "bar" }
    const date = new Date()

    expect(KurtTools.isKurtTool(randomObject)).toBe(false)
    expect(KurtTools.isKurtTool(date)).toBe(false)
    expect(KurtTools.isKurtTool([])).toBe(false)
  })
})
