import { ViewTransition } from "react";

/** Wraps a page's content so it rises into place when it arrives. */
export function PageIn({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="content-in" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
