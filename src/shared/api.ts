import type { OverviewStep } from "./graph/source-types";
/** Request and response shapes of Workflows' HTTP API. Later tasks add their routes here. */
export interface HealthResponse {
  ok: true;
  version: string;
  activeRuns: number;
  /** The server's pid, so a launcher can tell its own server from another one on the same port. */
  pid: number;
}
export interface AuthLinkRequest {
  to?: string;
}
export interface AuthLinkResponse {
  url: string;
}
/** Topics the live stream (`GET /api/stream?topics=...`) carries. */
export type StreamTopic = "runs" | "skills" | "backfill" | `run:${string}`;


/** Where a run's workflow came from: the skill's own map, a cached drawing, or nothing. */
export interface WorkflowSource {
  steps: OverviewStep[] | null;
  from: "block" | "drawn" | "none";
  note: string | null;
}
