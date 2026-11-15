import { useEffect, useMemo, useState } from "react";
import { ChampionHeader } from "./ChampionHeader";
import { ItemSlot } from "./ItemSlot";
import type { AugmentView, Recommendation } from "../lib/types";

type TabKey = "overview" | "items" | "runes";

const QUALITY_LABEL: Record<number, string> = { 1: "白银", 2: "黄金", 3: "棱彩" };
const QUALITY_BADGE: Record<number, string> = {
  1: "border-slate-300/40 bg-slate-300/10 text-slate-200/80",
  2: "border-amber-300/45 bg-amber-300/10 text-amber-200/85",
  3: "border-cyan-300/50 bg-cyan-300/10 text-cyan-200/85",
};
const QUALITY_RING: Record<number, string> = {
  1: "border-slate-300/45",
  2: "border-amber-300/55",
  3: "border-cyan-300/65",
};

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <span className="h-[10px] w-[2px] rounded-full bg-gold-400/70" />
      <span className="text-[11px] tracking-[0.18em] text-white/45">{children}</span>
      {hint && <span className="text-[9.5px] tracking-normal text-white/25">{hint}</span>}
    </div>
  );
}

const fmt = (n: number) => n.toFixed(1);

// ── 总览 ─────────────────────────────────────────────────────────────

function OverviewTab({ rec, onOpenRunes }: { rec: Recommendation; onOpenRunes: () => void }) {
  const topAugments = rec.augments.slice(0, 6);

  return (
    <div className="space-y-3.5">
      <section>
        <SectionLabel hint="按购买顺序">核心出装</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {rec.core.map((item, i) => (
            <ItemSlot key={item.id} item={item} index={i + 1} />
          ))}
          {rec.core.length === 0 && <span className="text-[11px] text-white/30">暂无数据</span>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section>
          <SectionLabel>首发装备</SectionLabel>
          <div className="flex gap-2">
            {rec.starter.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
            {rec.starter.length === 0 && <span className="text-[11px] text-white/30">—</span>}
          </div>
        </section>
        <section>
          <SectionLabel>鞋子</SectionLabel>
          <div className="flex gap-2">
            {rec.boots.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
            {rec.boots.length === 0 && <span className="text-[11px] text-white/30">—</span>}
          </div>
        </section>
      </div>

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <SectionLabel hint="OP.GG 强度">推荐强化</SectionLabel>
          <button
            onClick={onOpenRunes}
            className="text-[10px] text-gold-300/80 transition hover:text-gold-200"
          >
            查看全部 {rec.augments.length} 个 →
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {topAugments.map((augment, i) => (
            <div key={augment.id} className="flex flex-col items-center gap-1" title={augment.desc}>
              <div
                className={`relative h-[46px] w-[46px] overflow-hidden rounded-lg border-2 bg-black/50 ${
                  QUALITY_RING[augment.quality] ?? "border-white/20"
                }`}
              >
                <img src={augment.icon} alt={augment.name} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute left-0 top-0 rounded-br bg-black/80 px-1 text-[9px] font-semibold text-gold-300">
                  {i + 1}
                </span>
              </div>
              <span className="line-clamp-2 h-[22px] w-full text-center text-[9px] leading-[1.15] text-white/60">
                {augment.name}
              </span>
            </div>
          ))}
          {topAugments.length === 0 && <span className="text-[11px] text-white/30">暂无数据</span>}
        </div>
      </section>

      <p className="rounded-lg border-l-2 border-teal-400/50 bg-teal-400/5 px-2.5 py-2 text-[11px] leading-relaxed text-white/55">
        {rec.tip}
      </p>
    </div>
  );
}

// ── 装备 ─────────────────────────────────────────────────────────────

function ItemsTab({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3.5">
      <section>
        <SectionLabel hint="按购买顺序">核心出装</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {rec.core.map((item, i) => (
            <ItemSlot key={item.id} item={item} index={i + 1} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section>
          <SectionLabel>首发装备</SectionLabel>
          <div className="flex gap-2">
            {rec.starter.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
            {rec.starter.length === 0 && <span className="text-[11px] text-white/30">—</span>}
          </div>
        </section>
        <section>
          <SectionLabel>鞋子</SectionLabel>
          <div className="flex gap-2">
            {rec.boots.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
            {rec.boots.length === 0 && <span className="text-[11px] text-white/30">—</span>}
          </div>
        </section>
      </div>

      {rec.situational.length > 0 && (
        <section>
          <SectionLabel hint="场次 ≥1500 中胜率最高">高胜率备选</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {rec.situational.map((item) => (
              <ItemSlot key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── 符文 ─────────────────────────────────────────────────────────────

function RunesTab({ augments }: { augments: AugmentView[] }) {
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState<number | 0>(0);

  const counts = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const a of augments) map[a.quality] = (map[a.quality] ?? 0) + 1;
    return map;
  }, [augments]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return augments.filter((a) => {
      if (quality !== 0 && a.quality !== quality) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q);
    });
  }, [augments, query, quality]);

  const chips: { value: number | 0; label: string; count: number }[] = [
    { value: 0, label: "全部", count: augments.length },
    { value: 1, label: "白银", count: counts[1] ?? 0 },
    { value: 2, label: "黄金", count: counts[2] ?? 0 },
    { value: 3, label: "棱彩", count: counts[3] ?? 0 },
  ];

  return (
    <div>
      <div className="sticky -top-3 z-10 -mx-3.5 mb-2 space-y-2 bg-[#0a0f18]/95 px-3.5 pb-2 pt-1 backdrop-blur">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜索强化符文"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/90 outline-none placeholder:text-white/30 focus:border-gold-400/50"
          />
          <span className="shrink-0 text-[10px] text-white/30">{list.length} 个</span>
        </div>

        <div className="flex gap-1.5">
          {chips.map((chip) => {
            if (chip.value !== 0 && chip.count === 0) return null;
            const selected = quality === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setQuality(chip.value)}
                className={`flex-1 rounded-md border px-2 py-1 text-[10.5px] transition ${
                  selected
                    ? "border-gold-400/50 bg-gold-400/12 text-gold-200"
                    : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/60"
                }`}
              >
                {chip.label}
                <span className="ml-1 text-[9px] opacity-60">{chip.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-2 text-[9px] tracking-wider text-white/25">
          <span className="w-5 text-right">#</span>
          <span className="h-8 w-8" />
          <span className="min-w-0 flex-1">强化符文</span>
          <span className="w-[46px] text-right">选用率</span>
          <span className="w-[42px] text-right">强度</span>
        </div>
      </div>

      <div className="space-y-[3px]">
        {list.map((augment, index) => (
          <div
            key={augment.id}
            title={augment.desc}
            className="flex items-center gap-2 rounded-md border border-white/5 bg-white/2 px-2 py-1.5 transition hover:border-gold-400/30 hover:bg-white/5"
          >
            <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-white/30">
              {index + 1}
            </span>
            <img
              src={augment.icon}
              alt={augment.name}
              loading="lazy"
              className={`h-8 w-8 shrink-0 rounded border-2 object-cover ${
                QUALITY_RING[augment.quality] ?? "border-white/15"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12px] text-white/85">{augment.name}</span>
                <span
                  className={`shrink-0 rounded-sm border px-1 py-[0.5px] text-[8.5px] ${
                    QUALITY_BADGE[augment.quality] ?? "border-white/15 text-white/40"
                  }`}
                >
                  {QUALITY_LABEL[augment.quality] ?? "?"}
                </span>
              </div>
              <div className="truncate text-[9.5px] leading-[1.3] text-white/30">
                {augment.desc || "—"}
              </div>
            </div>
            <span className="w-[46px] shrink-0 text-right text-[11px] tabular-nums text-white/55">
              {augment.popular != null ? `${augment.popular}%` : "—"}
            </span>
            <span className="w-[42px] shrink-0 text-right text-[11px] font-medium tabular-nums text-gold-300/90">
              {augment.performance != null ? fmt(augment.performance) : "—"}
            </span>
          </div>
        ))}

        {list.length === 0 && (
          <p className="py-10 text-center text-[11.5px] text-white/30">没有匹配的强化符文</p>
        )}
      </div>
    </div>
  );
}

// ── 容器 ─────────────────────────────────────────────────────────────

export function ChampionDetail({ rec }: { rec: Recommendation }) {
  const [tab, setTab] = useState<TabKey>("overview");

  // 换英雄时回到总览
  useEffect(() => {
    setTab("overview");
  }, [rec.champion.id]);

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "总览" },
    { key: "items", label: "装备", badge: rec.core.length },
    { key: "runes", label: "符文", badge: rec.augments.length },
  ];

  return (
    <div className="animate-fade-up space-y-3">
      <ChampionHeader rec={rec} />

      <div className="flex gap-1 rounded-lg border border-white/8 bg-white/3 p-1">
        {tabs.map(({ key, label, badge }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] transition ${
                active
                  ? "bg-gold-400/15 text-gold-200 shadow-[inset_0_-1px_0_rgba(200,170,110,0.6)]"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              {label}
              {badge ? <span className="text-[9.5px] opacity-60">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab rec={rec} onOpenRunes={() => setTab("runes")} />}
      {tab === "items" && <ItemsTab rec={rec} />}
      {tab === "runes" && <RunesTab augments={rec.augments} />}
    </div>
  );
}
