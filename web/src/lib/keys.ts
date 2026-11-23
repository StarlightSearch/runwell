/** Keyboard helpers: shortcuts are ignored while the person types, except esc and ⌘↵. */
export function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export const dialogOpen = () => !!document.querySelector("[role=dialog]");

export const KEYS: [string, string][] = [
  ["⌘K / Ctrl K", "Search skills and runs"],
  ["R", "Run the focused skill (or pick one)"],
  ["G then S", "Go to Skills"],
  ["G then R", "Go to Runs"],
  ["G then O", "Go to Outputs"],
  ["↑ / ↓, Enter", "Move in a table and open (a skill opens its page)"],
  ["⌘↵", "Start the run in the Run dialog"],
  ["esc", "Close the top dialog"],
  ["?", "Show these keys"],
];
