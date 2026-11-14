import { Shell } from "@/components/skeletons";

const Bar = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} />;

/** The shape of a claim page: title, big number and chart, trade panel. */
export default function Loading() {
  return (
    <Shell label="Loading the claim">
      <div className="pt-8 pb-10">
        <Bar className="h-4 w-20" />
        <Bar className="mt-6 h-4 w-48" />
        <Bar className="mt-4 h-12 w-[min(36rem,92%)] rounded-xl" />
        <Bar className="mt-3 h-12 w-[min(22rem,70%)] rounded-xl" />
        <Bar className="mt-5 h-4 w-[min(26rem,80%)]" />
      </div>
      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <Bar className="h-16 w-44 rounded-xl" />
          <Bar className="mt-8 h-64 w-full rounded-2xl" />
          <div className="mt-8 grid grid-cols-3 gap-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Bar key={i} className="h-10" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Bar className="h-7 w-24" />
          <Bar className="h-11 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Bar className="h-14 rounded-xl" />
            <Bar className="h-14 rounded-xl" />
          </div>
          <Bar className="h-20 w-full rounded-xl" />
        </div>
      </div>
    </Shell>
  );
}
