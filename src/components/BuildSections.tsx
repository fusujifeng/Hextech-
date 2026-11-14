import { useEffect, useMemo, useState } from "react";
import { ItemSlot } from "./ItemSlot";
import type { AugmentView, Recommendation } from "../lib/types";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <span className="h-[10px] w-[2px] rounded-full bg-gold-400/70" />
      <span className="text-[11px] tracking-[0.18em] text-white/45">{children}</span>
      {hint && <span className="text-[9.5px] tracking-normal text-white/25">{hint}</span>}
    </div>
  );
}

const QUALITY_RING: Record<number, string> = {
  1: "border-slate-300/50",
  2: "border-amber-300/60",
  3: "border-cyan-300/70",
};

const QUALITY_TEXT: Record<number, string> = {
  1: "text-slate-300/80",
  2: "text-amber-200/85",
  3: "text-cyan-200/85",
};

const QUALITY_TAB: Record<number, string> = {
  1: "border-slate-300/50 bg-slate-300/10 text-slate-200",
  2: "border-amber-300/60 bg-amber-300/10 text-amber-200",
  3: "border-cyan-300/70 bg-cyan-300/10 text-cyan-200",
};

const TABS = [
  { quality: 1, label: "白银" },
  { quality: 2, label: "黄金" },
  { quality: 3, label: "棱彩" },
];

function AugmentSlot({ augment, rank }: { augment: AugmentView; rank: number }) {
  const [broken, setBroken] = useState(false);

  const tip = [
    augment.desc,
    augment.popular != null ? `选用率 ${augment.popular}%` : "",
    augment.performance != null ? `OP.GG 强度 ${augment.performance}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const score =
    augment.performance != null
      ? augment.performance.toFixed(1)
      : augment.popular != null
        ? `${augment.popular}%`
        : "";

  return (
    <div className="group flex w-full flex-col items-center gap-1" title={tip}>
      <div
        className={`relative h-[50px] w-[50px] overflow-hidden rounded-lg border-2 bg-black/50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition group-hover:-translate-y-0.5 ${
          QUALITY_RING[augment.quality] ?? "border-white/20"
        }`}
      >
        {broken ? (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-gold-300/80">
            {augment.name.slice(0, 3)}
          </div>
        ) : (
          <img
            src={augment.icon}
            alt={augment.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        )}
        <span className="absolute left-0 top-0 rounded-br-md bg-black/80 px-1 text-[9px] font-semibold text-gold-300">
          {rank}
        </span>
      </div>
      <span className="line-clamp-2 h-[22px] w-full text-center text-[9.5px] leading-[1.15] text-white/65">
        {augment.name}
      </span>
      <span className={`text-[9px] tabular-nums ${QUALITY_TEXT[augment.quality] ?? "text-white/40"}`}>
        {score}
      </span>
    </div>
  );
}

function AugmentBoard({ augments }: { augments: AugmentView[] }) {
  const groups = useMemo(() => {
    const map: Record<number, AugmentView[]> = { 1: [], 2: [], 3: [] };
    for (const augment of augments) {
      (map[augment.quality] ??= []).push(augment);
    }
    return map;
  }, [augments]);

  const [active, setActive] = useState<number>(1);

  // 数据换了英雄后，如果当前档位为空就切到第一个有内容的档位
  useEffect(() => {
    if (groups[active]?.length) return;
    const first = TABS.find((t) => groups[t.quality]?.length)?.quality;
    if (first) setActive(first);
  }, [groups, active]);

  const list = groups[active] ?? [];

  return (
    <section>
      <Label hint="OP.GG 强度排序">推荐海克斯强化</Label>

      <div className="flex gap-1.5">
        {TABS.map(({ quality, label }) => {
          const count = groups[quality]?.length ?? 0;
          if (count === 0) return null;
          const selected = active === quality;
          return (
            <button
              key={quality}
              onClick={() => setActive(quality)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                selected
                  ? QUALITY_TAB[quality]
                  : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/60"
              }`}
            >
              <span>{label}</span>
              <span className="text-[9.5px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 max-h-[300px] overflow-y-auto pr-1">
        <div className="grid grid-cols-5 gap-x-1.5 gap-y-2">
          {list.map((augment, index) => (
            <AugmentSlot key={augment.id} augment={augment} rank={index + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function BuildSections({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3.5">
      {/* 选人阶段最急的是强化，放到最上面，避免被下方内容挤出视野 */}
      {rec.augments.length > 0 && <AugmentBoard augments={rec.augments} />}

      <div className="grid grid-cols-2 gap-3">
        <section>
          <Label>首发装备</Label>
          <div className="flex gap-2">
            {rec.starter.length > 0 ? (
              rec.starter.map((item) => <ItemSlot key={item.id} item={item} />)
            ) : (
              <span className="text-[11px] text-white/30">—</span>
            )}
          </div>
        </section>
        <section>
          <Label>鞋子</Label>
          <div className="flex gap-2">
            {rec.boots.length > 0 ? (
              rec.boots.map((item) => <ItemSlot key={item.id} item={item} />)
            ) : (
              <span className="text-[11px] text-white/30">—</span>
            )}
          </div>
        </section>
      </div>

      <section>
        <Label>核心出装</Label>
        <div className="flex flex-wrap gap-2">
          {rec.core.map((item, i) => (
            <ItemSlot key={item.id} item={item} index={i + 1} />
          ))}
        </div>
      </section>

      {rec.situational.length > 0 && (
        <details className="group rounded-lg border border-white/8 bg-white/2 px-2.5 py-2 open:bg-white/4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] tracking-wider text-white/45">
            <span>高胜率备选 · {rec.situational.length}</span>
            <span className="text-gold-400/70 transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {rec.situational.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
          </div>
        </details>
      )}

      <p className="rounded-lg border-l-2 border-teal-400/50 bg-teal-400/5 px-2.5 py-2 text-[11px] leading-relaxed text-white/55">
        {rec.tip}
      </p>
    </div>
  );
}
