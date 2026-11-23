/** Request and response shapes of Runwell's HTTP API. Later tasks add their routes here. */
export interface HealthResponse {
  ok: true;
  version: string;
  activeRuns: number;
}
export interface AuthLinkRequest {
  to?: string;
}
export interface AuthLinkResponse {
  url: string;
}
/** Topics the live stream (`GET /api/stream?topics=...`) carries. */
export type StreamTopic = "runs" | "skills" | "backfill" | `run:${string}`;
