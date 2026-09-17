import type { ReactNode } from "react";

/**
 * Standard centered/padded content width for ordinary pages. The field
 * editor deliberately does not use this -- it needs the full width below
 * the header for its three-panel workspace.
 */
export function PageContainer({ children }: { children: ReactNode }) {
  // min-w-0: this is a flex item of <main> (see AppShell) -- without it, a
  // wide child (e.g. a DataTable) can force this container, and the page
  // along with it, wider than the viewport instead of scrolling locally.
  return <div className="min-w-0 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">{children}</div>;
}
