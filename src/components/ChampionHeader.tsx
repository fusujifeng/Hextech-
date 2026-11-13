import { useState } from "react";
import { pct, ROLE_LABEL, type Recommendation } from "../lib/types";

const TIER_STYLE: Record<string, string> = {
  T0: "border-red-400/60 bg-red-400/15 text-red-200",
  T1: "border-orange-400/50 bg-orange-400/15 text-orange-200",
  T2: "border-sky-400/45 bg-sky-400/12 text-sky-200",
  T3: "border-white/15 bg-white/5 text-white/50",
};

export function ChampionHeader({ rec }: { rec: Recommendation }) {
  const [splashBroken, setSplashBroken] = useState(false);
  const [iconBroken, setIconBroken] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-gold-400/20 bg-[#0a1019]">
      {!splashBroken && (
        <img
          src={rec.champion.splash}
          alt=""
          aria-hidden
          draggable={false}
          onError={() => setSplashBroken(true)}
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#070b12] via-[#070b12dd] to-[#070b1255]" />

      <div className="relative flex items-center gap-3 p-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gold-400/50 bg-black/50 shadow-lg">
          {iconBroken ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-gold-300">
              {rec.champion.name.slice(0, 1)}
            </div>
          ) : (
            <img
              src={rec.champion.icon}
              alt={rec.champion.name}
              draggable={false}
              onError={() => setIconBroken(true)}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-[19px] font-semibold tracking-wide text-gold-200">
              {rec.champion.name}
            </h1>
            <span className="truncate text-[11px] tracking-wider text-white/35">{rec.champion.title}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {rec.tier && (
              <span
                className={`rounded-sm border px-1.5 py-[1px] text-[10px] font-medium ${
                  TIER_STYLE[rec.tier] ?? TIER_STYLE.T3
                }`}
              >
                {rec.tier}
              </span>
            )}
            <span className="rounded-sm bg-white/8 px-1.5 py-[1px] text-[10px] text-white/65">
              胜率 {pct(rec.winRate)}
            </span>
            <span className="rounded-sm bg-white/8 px-1.5 py-[1px] text-[10px] text-white/45">
              {rec.games >= 10000 ? `${(rec.games / 10000).toFixed(1)} 万场` : `${rec.games} 场`}
            </span>
            {rec.champion.roles.slice(0, 2).map((role) => (
              <span key={role} className="rounded-sm bg-white/8 px-1.5 py-[1px] text-[10px] text-white/50">
                {ROLE_LABEL[role] ?? role}
              </span>
            ))}
          </div>

          {rec.nerf.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-amber-200/55">
              {rec.nerf.map(([k, v]) => (
                <span key={k}>
                  {k} {v}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
