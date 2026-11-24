import type { RunStatus } from "../../../src/shared/events";
import { CheckIcon } from "./icons";

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
      {live ? <span className="pulse" /> : status === "finished" ? <CheckIcon size={12} /> : null}
      <span>{STATUS_LABEL[status]}</span>
      {suffix ? <span className="pill-suffix">{suffix}</span> : null}
    </span>
  );
}
