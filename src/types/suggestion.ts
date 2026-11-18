/** A bookmark an AI assistant proposed through MCP, awaiting the user's decision. */
export interface Suggestion {
  id: string;
  /** "url" for a web page, "path" for a file or folder on this computer. */
  kind: "url" | "path";
  /** The address, or the local path. */
  url: string;
  /** May be empty; the add form looks the title up in that case. */
  title: string;
  /** Why the assistant thinks it is worth keeping. May be empty. */
  reason: string;
  /** Only tags the user already has. */
  tags: string[];
}
