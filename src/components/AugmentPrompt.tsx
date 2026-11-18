import type { AugmentView } from "../lib/types";

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
const GRADE_LABEL: Record<number, string> = {
  0: "S",
  1: "A",
  2: "B",
  3: "C",
  4: "D",
  5: "E",
};
const GRADE_BADGE: Record<number, string> = {
  0: "border-fuchsia-300/60 bg-fuchsia-400/15 text-fuchsia-200",
  1: "border-emerald-300/50 bg-emerald-400/10 text-emerald-200",
  2: "border-sky-300/45 bg-sky-400/10 text-sky-200",
  3: "border-amber-300/45 bg-amber-400/10 text-amber-200",
  4: "border-orange-300/40 bg-orange-400/10 text-orange-200",
  5: "border-slate-300/30 bg-slate-300/8 text-slate-300/70",
};

interface Props {
  picks: AugmentView[] | null;
  onClose: () => void;
}

/** 悬浮球在符文等级+满血时点击后，展示 OCR 识别出的三张卡及其档内排名 */
export function AugmentPrompt({ picks, onClose }: Props) {
  if (!picks || picks.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[360px] overflow-hidden rounded-xl border border-gold-400/30 bg-[#0c131f] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
          <div>
            <div className="text-[12.5px] text-gold-200">本局符文三选一</div>
            <div className="mt-0.5 text-[9.5px] text-white/30">
              按 OP.GG 强度在该品质池内的排名
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50 transition hover:border-gold-400/40 hover:text-gold-200"
          >
            关闭
          </button>
        </div>

        <div className="space-y-1.5 p-3">
          {picks.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[12px] font-semibold tabular-nums ${
                  p.tierRank === 1
                    ? "border-gold-400/60 bg-gold-400/15 text-gold-200"
                    : "border-white/10 text-white/50"
                }`}
              >
                {p.tierRank}
              </span>
              <img
                src={p.icon}
                alt={p.name}
                className={`h-9 w-9 shrink-0 rounded border-2 object-cover ${
                  QUALITY_RING[p.quality] ?? "border-white/15"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] text-white/90">{p.name}</span>
                  <span
                    className={`shrink-0 rounded-sm border px-1 py-[0.5px] text-[8.5px] ${
                      QUALITY_BADGE[p.quality] ?? "border-white/15 text-white/40"
                    }`}
                  >
                    {QUALITY_LABEL[p.quality] ?? "?"}
                  </span>
                  {p.grade <= 5 && (
                    <span
                      className={`shrink-0 rounded-sm border px-1 py-[0.5px] text-[8.5px] font-semibold ${
                        GRADE_BADGE[p.grade] ?? "border-white/15 text-white/40"
                      }`}
                    >
                      {GRADE_LABEL[p.grade] ?? "?"}
                    </span>
                  )}
                </div>
                <div className="truncate text-[9.5px] text-white/35">{p.desc || "—"}</div>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                {p.tierRank}/{p.tierTotal}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 px-3.5 py-1.5 text-[9px] text-white/25">
          识别自屏幕，若与实际三张卡不符可关闭后手动查看符文页
        </div>
      </div>
    </div>
  );
}
