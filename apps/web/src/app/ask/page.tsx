import { AskFlow } from "./ask-flow";

export const metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <AskFlow initial={q ?? ""} />;
}
