import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16">
      <h1 className="text-2xl font-semibold">No such page</h1>
      <p className="mt-2 text-fade">The claim or page you asked for doesn&apos;t exist.</p>
      <Link href="/markets" className="mt-6 inline-block text-ledger underline decoration-rule">Browse markets</Link>
    </div>
  );
}
