import { createContext, useContext } from "react";

export interface RunDialogApi {
  openRunDialog(skillKey: string, opts?: { fromRun?: string }): void;
}

export const RunDialogContext = createContext<RunDialogApi>({ openRunDialog: () => {} });
export const useRunDialog = () => useContext(RunDialogContext);
