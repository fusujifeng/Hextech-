import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { ChampionRank } from "../lib/types";

interface Props {
  championId: number | null;
  benchIds: number[];
  /** 开局三张英雄牌（OCR 识别），按全英雄强度排好序 */
  cards?: ChampionRank[];
  /** 重抽卡牌后重新截屏识别；undefined 表示当前模式不支持 */
  onRefreshCards?: () => void;
  refreshing?: boolean;
}

function ChampionTile({ c, current }: { c: ChampionRank; current: boolean }) {
  return (
    <div
      className="flex w-[50px] shrink-0 flex-col items-center gap-0.5"
      title={`${c.name} · ${c.tier} · 胜率 ${(c.winRate * 100).toFixed(2)}%`}
    >
      <img
        src={c.icon}
        alt={c.name}
        draggable={false}
        className={`h-11 w-11 rounded-lg border object-cover ${
          current ? "border-gold-400 ring-1 ring-gold-400/50" : "border-white/10"
        }`}
      />
      <span
        className={`text-[10.5px] font-medium tabular-nums ${
          current ? "text-gold-300" : c.rank <= 20 ? "text-gold-200/85" : "text-white/55"
        }`}
      >
        {c.rank}
      </span>
      <span className="w-full truncate text-center text-[8.5px] text-white/35">{c.name}</span>
    </div>
  );
}

/**
 * 选人强度榜：
 * - 开局三张英雄牌（OCR 识别）单独一组
 * - 当前英雄 + 备战席英雄合并按 OP.GG 强度排序
 * 头像下面显示全英雄排名。
 */
export function ChampSelectBoard({
  championId,
  benchIds,
  cards = [],
  onRefreshCards,
  refreshing = false,
}: Props) {
  const ids = useMemo(() => {
    const all = [championId, ...benchIds].filter(
      (id): id is number => typeof id === "number" && id > 0,
    );
    return Array.from(new Set(all));
  }, [championId, benchIds]);

  // 用 id 串当依赖：LCU 每 500ms 推一次状态，但只有可选英雄变化时才重新请求
  const key = ids.join(",");
  const [board, setBoard] = useState<ChampionRank[]>([]);

  useEffect(() => {
    if (!key) {
      setBoard([]);
      return;
    }

    let cancelled = false;
    const list = key.split(",").map(Number);
    api
      .getChampionBoard(list)
      .then((rows) => {
        if (!cancelled) setBoard(rows);
      })
      .catch(() => {
        if (!cancelled) setBoard([]);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const showCards = cards.length > 0 || Boolean(onRefreshCards);
  if (board.length === 0 && !showCards) return null;

  return (
    <section className="rounded-xl border border-white/8 bg-white/3 px-2 py-2">
      {showCards && (
        <div className={board.length > 0 ? "mb-2" : ""}>
          <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <span className="text-[10.5px] text-gold-200/80">开局英雄牌 · 三选一</span>
            <div className="flex items-center gap-2">
              {onRefreshCards && (
                <button
                  onClick={onRefreshCards}
                  disabled={refreshing}
                  title="重抽卡牌后重新截屏识别"
                  className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/55 transition hover:border-gold-400/40 hover:text-gold-200 disabled:cursor-wait disabled:opacity-50"
                >
                  {refreshing ? "识别中…" : "刷新"}
                </button>
              )}
              <span className="shrink-0 text-[9px] text-white/25">左强右弱 · 全英雄排名</span>
            </div>
          </div>
          {cards.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {cards.map((c) => (
                <ChampionTile key={`card-${c.id}`} c={c} current={c.id === championId} />
              ))}
            </div>
          ) : (
            <p className="px-0.5 text-[9.5px] text-white/30">
              还没识别到牌面，点「刷新」重试
            </p>
          )}
        </div>
      )}

      {board.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <span className="text-[10.5px] text-gold-200/80">本局可选 · OP.GG 强度</span>
            <span className="shrink-0 text-[9px] text-white/25">左强右弱 · 数字为全英雄排名</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {board.map((c) => (
              <ChampionTile key={c.id} c={c} current={c.id === championId} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
