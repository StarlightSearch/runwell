import type { ReactNode } from "react";

export function PageHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="top">
      {children}
      {actions ? <span className="sp" /> : null}
      {actions}
    </div>
  );
}
