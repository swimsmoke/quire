import { Bot } from "lucide-react";

/** Small stable hash so an account always gets the same colours. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Generated avatar: a two-tone orb unique to the account, with its first letter. */
export function Avatar({ account, size = 40, agent = false, className = "" }: { account: string; size?: number; agent?: boolean; className?: string }) {
  const h = hash(account);
  const a = h % 360;
  const b = (a + 40 + ((h >> 9) % 80)) % 360;
  const angle = (h >> 4) % 360;
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(circle at 30% 25%, hsl(${a} 85% 72%), transparent 60%), linear-gradient(${angle}deg, hsl(${a} 70% 48%), hsl(${b} 75% 38%))`,
        textShadow: "0 1px 2px rgba(0,0,0,0.35)",
      }}
    >
      {agent ? <Bot size={size * 0.5} /> : account.slice(0, 1).toUpperCase()}
    </span>
  );
}
