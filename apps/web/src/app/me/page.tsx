"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { PageTitle } from "@/components/section";

/** Your own profile. Sends signed-in people to /profile/<account>. */
export default function Me() {
  const { me, ready, onchain } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(`/profile/${encodeURIComponent(me.session.accountId)}`);
  }, [me, router]);
  if (!ready || me) return null;
  return <PageTitle title="Your profile" subtitle={onchain ? "Connect your NEAR wallet from the top right to see your profile." : "Sign in from the top right to see your profile."} />;
}
