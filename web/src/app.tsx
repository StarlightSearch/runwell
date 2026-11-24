import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, ApiError } from "./lib/api";
import { Sidebar } from "./components/sidebar";
import { RunDialogProvider } from "./components/run-dialog";
import { CommandPalette } from "./components/command-palette";
import { SkillsPage } from "./pages/skills";
import { SkillPage } from "./pages/skill";
import { RunsPage } from "./pages/runs";
import { RunPage } from "./pages/run";
import { OutputsPage } from "./pages/outputs";
import { SettingsPage } from "./pages/settings";
import { Logo } from "./components/logo";

export const SIGN_IN_GATE = "Open Workflows with /workflows in Claude Code or npx workflows in a terminal.";

function Gate({ message }: { message: string }) {
  return (
    <div className="gate">
      <div className="box">
        <Logo size={40} className="logo" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<"checking" | "ok" | "no">("checking");
  useEffect(() => {
    api("/api/ping").then(
      () => setAuth("ok"),
      (e: ApiError) => setAuth(e.status === 401 ? "no" : "ok"),
    );
  }, []);
  if (auth === "checking") return null;
  if (auth === "no") return <Gate message={SIGN_IN_GATE} />;
  return (
    <BrowserRouter>
      <RunDialogProvider>
      <div className="app">
        <Sidebar onSearch={() => window.dispatchEvent(new CustomEvent("workflows:palette"))} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/skills" replace />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/skills/:key" element={<SkillPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:id" element={<RunPage />} />
            <Route path="/outputs" element={<OutputsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/skills" replace />} />
          </Routes>
        </main>
      </div>
      <CommandPalette />
      </RunDialogProvider>
    </BrowserRouter>
  );
}
