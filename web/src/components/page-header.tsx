import type { ReactNode } from "react";

/** The bar at the top of a page: the title side shrinks (its long lines end in …), the actions never do. */
export function PageHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="top">
      <div className="top-main">{children}</div>
      {actions ? <div className="top-actions">{actions}</div> : null}
    </div>
  );
}
