import { AskFlow } from "./ask-flow";
import { STARTER_CLAIMS } from "@/lib/starter-claims";

export const metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string; draft?: string }> }) {
  const { q, draft } = await searchParams;
  const starter = STARTER_CLAIMS.find((s) => s.id === draft);
  return <AskFlow initial={starter?.draft.question ?? q ?? ""} starter={starter ? { draft: starter.draft, prob: starter.prob } : undefined} />;
}
