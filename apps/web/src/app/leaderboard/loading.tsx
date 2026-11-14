import { ListSkeleton, Shell, TitleSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <Shell label="Loading">
      <TitleSkeleton />
      <ListSkeleton />
    </Shell>
  );
}
