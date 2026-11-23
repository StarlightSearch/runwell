// Ported from Pulsar (Starlight), released here under the MIT license.
/** The input shapes the workflow graph reads. */

export interface OverviewStep {
  id: string;
  title: string;
  detail: string;
  kind: "action" | "decision" | "loop";
  branches?: { when: string; then: string }[];
  children?: OverviewStep[];
  agents?: { name: string; role: string }[];
  maxPasses?: number;
}
