import Link from "next/link";
import { PageTitle } from "@/components/section";

export default function NotFound() {
  return (
    <PageTitle title="Page not found" subtitle="The claim or page you asked for doesn't exist.">
      <Link href="/markets" className="mt-6 inline-block text-sub text-tint hover:underline">Browse markets</Link>
    </PageTitle>
  );
}
