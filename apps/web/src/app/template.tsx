import { ViewTransition } from "react";

/** The page you're leaving fades up and away; the next one rises in (see PageIn and the loading screens). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
