import { createContext, useContext } from "react";

export interface RunDialogApi {
  openRunDialog(skillKey: string, opts?: { fromRun?: string; brief?: string }): void;
}

export const RunDialogContext = createContext<RunDialogApi>({ openRunDialog: () => {} });
export const useRunDialog = () => useContext(RunDialogContext);

/** Opens the skill picker; the chosen skill's Run dialog starts with `brief` (kept when changing skill). */
export function pickSkill(brief = ""): void {
  window.dispatchEvent(new CustomEvent("workflows:pick", { detail: { brief } }));
}
