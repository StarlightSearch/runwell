import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "workflows:theme";

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* storage blocked: follow the system */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(t: Theme = initial()): void {
  document.documentElement.dataset.theme = t;
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* not remembered */
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}
