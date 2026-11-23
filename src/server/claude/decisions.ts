/** The spike decisions the driver needs (docs/spikes/DECISIONS.md, Claude Code 2.1.330). */
export interface Decisions {
  askRoute: "permission-tool" | "mod" | "mixed";
  /** The first message for a skill ref ("name" or "plugin:name"). */
  skillInvocation(ref: string, brief: string): string;
  /** The --settings JSON that pre-allows edits inside one folder (double slash: an absolute path rule). */
  folderRule(folder: string): unknown;
  bypassFlag: string[];
  stopSignal: NodeJS.Signals;
  /** Env that lifts the MCP tool timeout, so a card can wait for the person. */
  toolTimeoutEnv: Record<string, string>;
}

export const DECISIONS: Decisions = {
  askRoute: "permission-tool",
  skillInvocation: (ref, brief) => `/${ref}${brief.trim() ? ` ${brief.trim()}` : ""}`,
  folderRule: (folder) => ({ permissions: { allow: [`Edit(/${folder.replace(/\/+$/, "")}/**)`] } }),
  bypassFlag: ["--permission-mode", "bypassPermissions"],
  stopSignal: "SIGINT",
  toolTimeoutEnv: { MCP_TOOL_TIMEOUT: String(24 * 60 * 60 * 1000) },
};
