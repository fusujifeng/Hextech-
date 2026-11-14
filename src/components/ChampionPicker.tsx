import { useEffect, useMemo, useRef, useState } from "react";
import type { ChampionBrief } from "../lib/types";

interface Props {
  open: boolean;
  champions: ChampionBrief[];
  onClose: () => void;
  onPick: (id: number) => void;
}

/** 名称、称号、英文名、外号 四路匹配，例如「男枪」「法外狂徒」「格雷福斯」都能搜到 */
function matches(c: ChampionBrief, q: string): boolean {
  return (
    c.name.toLowerCase().includes(q) ||
    c.title.toLowerCase().includes(q) ||
    c.alias.toLowerCase().includes(q) ||
    c.nicknames.some((n) => n.toLowerCase().includes(q))
  );
}

export function ChampionPicker({ open, champions, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return champions;
    return champions.filter((c) => matches(c, q));
  }, [champions, query]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#060a11]/97 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="搜索：英雄名 / 称号 / 外号，如 男枪"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/90 outline-none placeholder:text-white/30 focus:border-gold-400/50"
        />
        <button
          onClick={onClose}
          className="shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition hover:border-gold-400/40 hover:text-gold-200"
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-white/35">没有匹配的英雄</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="flex items-center gap-2 rounded-md border border-white/6 bg-white/3 px-2 py-1.5 text-left transition hover:border-gold-400/45 hover:bg-gold-400/8"
              >
                <img
                  src={c.icon}
                  alt=""
                  draggable={false}
                  className="h-8 w-8 shrink-0 rounded border border-white/10 object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="truncate text-[12.5px] text-gold-200/90">{c.name}</span>
                    {c.tier && <span className="shrink-0 text-[9px] text-white/30">{c.tier}</span>}
                  </span>
                  <span className="w-full truncate text-[10px] text-white/40">{c.title}</span>
                  {c.nicknames.length > 0 && (
                    <span className="w-full truncate text-[9.5px] text-teal-300/45">
                      {c.nicknames.join(" / ")}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/8 px-3 py-1.5 text-[10px] text-white/25">
        共 {filtered.length} 位英雄 · 支持名称 / 称号 / 外号 · 仅用于预览，不会影响游戏
      </div>
    </div>
  );
}
