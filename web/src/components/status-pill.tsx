import type { RunStatus } from "../../../src/shared/events";

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting for you",
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

export function StatusPill({ status, suffix }: { status: RunStatus; suffix?: string }) {
  const live = status === "running" || status === "queued" || status === "waiting";
  return (
    <span className={`pill ${status}`} data-status={status}>
      {live ? <span className="pulse" /> : status === "finished" ? "✓" : null}
      {STATUS_LABEL[status]}
      {suffix ? ` · ${suffix}` : ""}
    </span>
  );
}
