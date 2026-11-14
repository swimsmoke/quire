import { ViewTransition } from "react";

/** Shown the instant you tap a link, while the page's data is on its way. */
export function Shell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ViewTransition enter="page-in" exit="skeleton-out" default="none">
      <div role="status" aria-label={label} aria-busy="true">
        {children}
      </div>
    </ViewTransition>
  );
}

const Bar = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} />;

export function TitleSkeleton() {
  return (
    <div className="pt-12 pb-10 md:pt-20">
      <Bar className="h-14 w-[min(26rem,80%)] rounded-xl" />
      <Bar className="mt-5 h-4 w-[min(36rem,90%)]" />
      <Bar className="mt-2.5 h-4 w-[min(28rem,70%)]" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-6">
      <div className="flex justify-between">
        <Bar className="h-3.5 w-20" />
        <Bar className="h-3.5 w-24" />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
        <div>
          <Bar className="h-5 w-full" />
          <Bar className="mt-2.5 h-5 w-3/4" />
        </div>
        <Bar className="size-[62px] rounded-full" />
      </div>
      <Bar className="mt-7 h-10 w-full" />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Bar className="h-10 rounded-xl" />
        <Bar className="h-10 rounded-xl" />
      </div>
    </div>
  );
}

export function GridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y hairline border-y hairline">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <Bar className="size-9 rounded-full" />
          <Bar className="h-4 flex-1" />
          <Bar className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
