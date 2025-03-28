export type KurtToolType = "web_search"

export abstract class KurtTool {
  abstract type: KurtToolType
}

class WebSearchTool extends KurtTool {
  readonly type = "web_search"
}

/**
 * A collection of tools that can be used in Kurt.
 */

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class KurtTools {
  static WebSearch = (): WebSearchTool => new WebSearchTool()
  static isKurtTool = (tool: unknown): tool is KurtTool =>
    tool instanceof KurtTool
}
