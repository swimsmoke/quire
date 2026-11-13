import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { ModeTag } from "@/components/mode";
import { CopyShare, OwnActions, PnlChart, ProfileTabs } from "@/components/profile-parts";
import { fmtNear, fmtNearCompact, shortAccount, signed, tone } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return { title: decodeURIComponent(account) };
}

export default async function ProfilePage({ params }: { params: Promise<{ account: string }> }) {
  const account = decodeURIComponent((await params).account);
  const [p, health] = await Promise.all([
    api.profile(account).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
    api.health().catch(() => null),
  ]);
  const mode = health?.executionMode ?? "SIMULATED";

  if (!p)
    return (
      <div className="mx-auto max-w-[760px] pt-14">
        <div className="flex items-center gap-5">
          <Avatar account={account} size={88} />
          <h1 className="min-w-0 truncate text-[2rem] font-semibold tracking-[-0.03em]">{shortAccount(account)}</h1>
        </div>
        <p className="mt-6 text-body text-label-2">No trades yet. Once this account trades or opens a market, its record shows up here.</p>
        <OwnActions account={account} />
        <Link href="/markets" className="mt-6 inline-block text-sub text-tint hover:underline">
          Browse markets
        </Link>
      </div>
    );

  const joined = p.joinedAt ? new Date(p.joinedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <div className="mx-auto max-w-[760px] pt-10 md:pt-14">
      <header className="flex items-center gap-5">
        <Avatar account={p.account} size={88} agent={p.actorKind === "AGENT"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] sm:text-[2.25rem]" title={p.account}>
              {p.agentName ?? shortAccount(p.account)}
            </h1>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sub text-label-2">
            {joined && <span>Joined {joined}</span>}
            {p.rank && (
              <Link href="/leaderboard" className="hover:text-label">
                Rank {p.rank} of {p.traders}
              </Link>
            )}
            <ModeTag mode={mode} />
          </p>
        </div>
        <span className="hidden sm:block">
          <CopyShare account={p.account} />
        </span>
      </header>
      <span className="mt-4 block sm:hidden">
        <CopyShare account={p.account} />
      </span>

      <dl className="tabular mt-8 grid grid-cols-3 divide-x hairline text-center">
        {[
          ["Positions value", `${fmtNear(p.stats.positionsValue)} NEAR`],
          ["Biggest win", `${fmtNear(p.stats.biggestWin)} NEAR`],
          ["Claims traded", String(p.stats.marketsTraded)],
        ].map(([k, v]) => (
          <div key={k} className="px-2">
            <dd className="text-title3 font-semibold sm:text-[1.6rem]">{v}</dd>
            <dt className="mt-1 text-footnote text-label-2">{k}</dt>
          </div>
        ))}
      </dl>

      <dl className="tabular mt-8 divide-y hairline border-y hairline text-sub">
        <div className="flex justify-between py-3">
          <dt className="text-label-2">Total profit/loss</dt>
          <dd className={`font-semibold ${tone(p.stats.totalPnl)}`}>{signed(p.stats.totalPnl)} NEAR</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-label-2">Total volume</dt>
          <dd className="font-semibold">{fmtNearCompact(p.stats.totalVolume)} NEAR</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-label-2">Markets opened</dt>
          <dd className="font-semibold">{p.stats.marketsCreated}</dd>
        </div>
      </dl>

      <OwnActions account={p.account} />
      <PnlChart points={p.pnl} />
      <p className="mt-2 text-footnote text-label-3">Open positions are valued at the current Yes or No price, before fees and price impact.</p>
      <ProfileTabs p={p} />
    </div>
  );
}
