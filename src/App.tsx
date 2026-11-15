import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import * as api from "./lib/api";
import { checkForUpdate, installUpdate } from "./lib/updater";
import { ChampionDetail } from "./components/ChampionDetail";
import { ChampionPicker } from "./components/ChampionPicker";
import {
  PHASE_LABEL,
  type ChampionBrief,
  type LcuState,
  type Meta,
  type Recommendation,
} from "./lib/types";

type UpdateState =
  | { status: "idle" | "checking" | "latest" }
  | { status: "available"; version: string; notes: string }
  | { status: "downloading"; percent: number }
  | { status: "error"; message: string; manual: boolean };

function IconPin({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4h6l-1 6 4 3v2H6v-2l4-3-1-6Z" className={active ? "fill-current" : ""} />
      <path d="M12 15v5" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [lcu, setLcu] = useState<LcuState | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [appVersion, setAppVersion] = useState("");

  const [champions, setChampions] = useState<ChampionBrief[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 支持 #preview/222 深链，方便开发时直接看某位英雄（不影响正常使用）
  const [previewId, setPreviewId] = useState<number | null>(() => {
    const match = /preview\/(\d+)/.exec(window.location.hash);
    return match ? Number(match[1]) : null;
  });

  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const [pinned, setPinned] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  // 订阅 Rust 侧 500ms 轮询推送的状态
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    api
      .getLcuState()
      .then((s) => !disposed && setLcu(s))
      .catch(() => undefined);

    api
      .onLcuState((s) => !disposed && setLcu(s))
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    api.listChampions().then(setChampions).catch(() => undefined);
    api.getMeta().then(setMeta).catch(() => undefined);
    getVersion().then(setAppVersion).catch(() => undefined);
    api.isPinned().then(setPinned).catch(() => undefined);
  }, []);

  // 启动后静默检查一次更新；失败不打扰用户（发布地址可能尚未配置）
  useEffect(() => {
    checkForUpdate()
      .then((info) => {
        if (info) setUpdate({ status: "available", version: info.version, notes: info.notes });
        else setUpdate({ status: "latest" });
      })
      .catch(() => setUpdate({ status: "error", message: "检查更新失败", manual: false }));
  }, []);

  const liveMode = lcu && (lcu.mode === "mayhem" || lcu.mode === "aram") ? lcu.mode : null;
  const liveChampionId = liveMode ? lcu?.championId ?? null : null;
  const championId = previewId ?? liveChampionId;
  const mode = liveMode ?? "mayhem";

  useEffect(() => {
    if (championId === null) {
      setRec(null);
      setRecError(null);
      return;
    }
    let cancelled = false;
    setRecLoading(true);
    setRecError(null);
    api
      .getRecommendation(championId, mode)
      .then((r) => {
        if (!cancelled) setRec(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRec(null);
          setRecError(typeof e === "string" ? e : "获取推荐失败");
        }
      })
      .finally(() => {
        if (!cancelled) setRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [championId, mode]);

  const togglePin = useCallback(async () => {
    const next = !pinned;
    setPinned(next);
    try {
      await api.setPinned(next);
    } catch {
      setPinned(!next);
    }
  }, [pinned]);

  const handleInstall = useCallback(async () => {
    setUpdate({ status: "downloading", percent: -1 });
    try {
      await installUpdate((percent) => setUpdate({ status: "downloading", percent }));
    } catch (e) {
      setUpdate({ status: "error", message: typeof e === "string" ? e : "更新安装失败", manual: true });
    }
  }, []);

  const checkUpdateManually = useCallback(async () => {
    setUpdate({ status: "checking" });
    try {
      const info = await checkForUpdate();
      setUpdate(
        info
          ? { status: "available", version: info.version, notes: info.notes }
          : { status: "latest" },
      );
    } catch {
      setUpdate({ status: "error", message: "无法连接到更新服务器", manual: true });
    }
  }, []);

  const phaseLabel = lcu ? PHASE_LABEL[lcu.phase] ?? lcu.phase : "";
  const statusText = !lcu
    ? "正在连接客户端…"
    : lcu.connected
      ? `${phaseLabel || "已连接"}${lcu.source ? ` · ${lcu.source}` : ""}`
      : lcu.error ?? "等待英雄联盟客户端…";

  const emptyState = useMemo(() => {
    if (!lcu || !lcu.connected) {
      return {
        title: "等待英雄联盟客户端",
        desc: "请先启动英雄联盟（WeGame 或官方启动器），进入海克斯大乱斗选人后会自动识别英雄。",
      };
    }
    if (lcu.phase !== "ChampSelect") {
      return {
        title: `客户端已连接 · ${phaseLabel || "待机"}`,
        desc: "进入海克斯大乱斗选人阶段后，这里会自动显示当前英雄的推荐出装。",
      };
    }
    if (lcu.mode === "other") {
      return {
        title: "当前模式不提供推荐",
        desc: `队列 ${lcu.queueId ?? "未知"}（${lcu.queueType || "非大乱斗"}）不在支持范围内，仅海克斯大乱斗 / 极地大乱斗会展示出装。`,
      };
    }
    return {
      title: `已进入${lcu.mode === "mayhem" ? "海克斯大乱斗" : "极地大乱斗"}选人`,
      desc:
        lcu.benchCount > 0
          ? `等待你确定英雄，备战席还有 ${lcu.benchCount} 个英雄可以换。`
          : "等待你选择或锁定英雄，确定后立即显示推荐出装。",
    };
  }, [lcu, phaseLabel]);

  const showBuild = championId !== null && rec !== null;

  return (
    <div className="relative flex h-full flex-col">
      {/* 顶栏 */}
      <header className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              lcu?.connected ? "bg-teal-400 pulse-ring" : "bg-white/25"
            }`}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-medium tracking-[0.06em] text-gold-200">
              海克斯大乱斗助手
            </div>
            <div className="truncate text-[10px] text-white/35">{statusText}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={togglePin}
            title={pinned ? "取消置顶" : "窗口置顶"}
            className={`rounded-md border p-1.5 transition ${
              pinned
                ? "border-gold-400/60 bg-gold-400/15 text-gold-300"
                : "border-white/10 text-white/45 hover:border-gold-400/40 hover:text-gold-200"
            }`}
          >
            <IconPin active={pinned} />
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            title="浏览英雄出装"
            className="rounded-md border border-white/10 p-1.5 text-white/45 transition hover:border-gold-400/40 hover:text-gold-200"
          >
            <IconSearch />
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {update.status === "available" && (
          <div className="animate-fade-up flex items-center justify-between gap-2 rounded-lg border border-gold-400/35 bg-gold-400/10 px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-[12px] text-gold-200">发现新版本 v{update.version}</div>
              <div className="truncate text-[10px] text-white/40">静默安装，完成后自动重启</div>
            </div>
            <button
              onClick={handleInstall}
              className="shrink-0 rounded-md bg-gold-400 px-2.5 py-1 text-[11px] font-medium text-[#1a1206] transition hover:bg-gold-300"
            >
              立即更新
            </button>
          </div>
        )}

        {update.status === "downloading" && (
          <div className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-2">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>正在下载更新…</span>
              <span className="tabular-nums">
                {update.percent >= 0 ? `${update.percent}%` : ""}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gold-400 transition-all"
                style={{ width: `${update.percent >= 0 ? update.percent : 12}%` }}
              />
            </div>
          </div>
        )}

        {previewId !== null && (
          <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/4 px-2 py-1 text-[10px] text-white/50">
            <span>预览模式 · 不跟随游戏状态</span>
            <button onClick={() => setPreviewId(null)} className="text-gold-300 hover:text-gold-200">
              返回实战
            </button>
          </div>
        )}

        {recLoading && !rec && (
          <div className="space-y-2">
            <div className="h-[92px] animate-pulse rounded-xl bg-white/5" />
            <div className="h-16 animate-pulse rounded-lg bg-white/4" />
            <div className="h-16 animate-pulse rounded-lg bg-white/4" />
          </div>
        )}

        {recError && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/8 px-2.5 py-2 text-[11px] text-red-200/80">
            {recError}
          </div>
        )}

        {showBuild ? (
          <div className="animate-fade-up space-y-3">
            <ChampionDetail rec={rec} />
            <div className="flex items-center justify-between border-t border-white/6 pt-2 text-[9.5px] text-white/25">
              <span>
                {rec.source} · 数据 {rec.version}
              </span>
              <span>仅供参考</span>
            </div>
          </div>
        ) : (
          !recLoading &&
          !recError && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/2 px-5 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold-400/25 bg-gold-400/8 text-lg text-gold-300">
                ⚔
              </div>
              <div>
                <div className="text-[13px] text-gold-200/90">{emptyState.title}</div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">{emptyState.desc}</p>
              </div>
              <button
                onClick={() => setPickerOpen(true)}
                className="mt-1 rounded-md border border-gold-400/40 px-3 py-1.5 text-[11px] text-gold-200 transition hover:bg-gold-400/12"
              >
                浏览英雄出装
              </button>
            </div>
          )
        )}
      </main>

      {/* 底栏 */}
      <footer className="flex items-center justify-between border-t border-white/8 px-3.5 py-1.5 text-[9.5px] text-white/30">
        <span>
          {pinned ? "已置顶 · " : ""}
          v{appVersion || "0.1.0"}
          {meta ? ` · 数据 ${meta.version}` : ""}
          <span className="text-white/20"> · F1 唤起</span>
        </span>
        <button
          onClick={checkUpdateManually}
          className="transition hover:text-gold-300"
          title={update.status === "error" ? update.message : "检查更新"}
        >
          {update.status === "checking"
            ? "检查中…"
            : update.status === "latest"
              ? "已是最新版"
              : update.status === "error" && update.manual
                ? "更新检查失败"
                : "检查更新"}
        </button>
      </footer>

      <ChampionPicker
        open={pickerOpen}
        champions={champions}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          setPreviewId(id);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

