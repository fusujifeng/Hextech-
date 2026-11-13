import { useState } from "react";
import { ItemSlot } from "./ItemSlot";
import { pct, QUALITY_LABEL, type AugmentView, type Recommendation } from "../lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="h-[10px] w-[2px] rounded-full bg-gold-400/70" />
      <span className="text-[11px] tracking-[0.18em] text-white/45">{children}</span>
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

function AugmentSlot({ augment }: { augment: AugmentView }) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="group flex w-full flex-col items-center gap-1" title={augment.desc}>
      <div
        className={`relative h-[56px] w-[56px] overflow-hidden rounded-lg border-2 bg-black/50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition group-hover:-translate-y-0.5 ${
          QUALITY_RING[augment.quality] ?? "border-white/20"
        }`}
      >
        {broken ? (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-gold-300/80">
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
        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-[1px] text-center text-[8.5px] text-white/70">
          {QUALITY_LABEL[augment.quality] ?? ""}
        </span>
      </div>
      <span className="line-clamp-2 h-[24px] w-full text-center text-[10px] leading-[1.2] text-white/65">
        {augment.name}
      </span>
      <span className={`text-[9px] tabular-nums ${QUALITY_TEXT[augment.quality] ?? "text-white/40"}`}>
        {pct(augment.winRate)}
      </span>
    </div>
  );
}

export function BuildSections({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3.5">
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

      {rec.augments.length > 0 && (
        <section>
          <Label>推荐海克斯强化</Label>
          <div className="grid grid-cols-6 gap-1.5">
            {rec.augments.map((augment) => (
              <AugmentSlot key={augment.id} augment={augment} />
            ))}
          </div>
        </section>
      )}

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
