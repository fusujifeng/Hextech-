import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import * as api from "./lib/api";
import {
  checkForUpdate,
  getPendingUpdate,
  installUpdate,
  onUpdateAvailable,
  type UpdateState,
} from "./lib/updater";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SettingsPanel } from "./components/SettingsPanel";
import { ChampSelectBoard } from "./components/ChampSelectBoard";
import { AugmentPrompt } from "./components/AugmentPrompt";
import { ChampionDetail } from "./components/ChampionDetail";
import { ChampionPicker } from "./components/ChampionPicker";
import {
  PHASE_LABEL,
  type AugmentView,
  type ChampionBrief,
  type ChampionRank,
  type LcuState,
  type Meta,
  type Recommendation,
} from "./lib/types";

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

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
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
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [augmentPicks, setAugmentPicks] = useState<AugmentView[] | null>(null);
  const [augmentBusy, setAugmentBusy] = useState(false);
  const [augmentError, setAugmentError] = useState<string | null>(null);
  const [champCards, setChampCards] = useState<ChampionRank[]>([]);
  const [cardsRefreshing, setCardsRefreshing] = useState(false);

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

  // 启动时 Rust 已单开线程静默查更新；这里只取结果，有新版就问用户要不要更新。
  // 两条路都接：主动取一次（检查早于挂载）+ 订阅事件（检查晚于挂载）。
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const offer = (info: { version: string; notes: string }) => {
      if (disposed) return;
      setUpdate({ status: "available", version: info.version, notes: info.notes });
      setUpdatePromptOpen(true);
    };

    getPendingUpdate()
      .then((info) => {
        if (info) offer(info);
      })
      .catch(() => undefined);

    onUpdateAvailable(offer)
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

  // 更新确认框出现时收起设置面板，避免两层遮罩叠在一起
  useEffect(() => {
    if (updatePromptOpen) setSettingsOpen(false);
  }, [updatePromptOpen]);

  // 悬浮球在符文等级+满血时点击，后端 OCR 出的三张卡通过事件推过来
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<AugmentView[]>("augment-options", (event) => {
      if (!disposed && event.payload?.length) setAugmentPicks(event.payload);
    })
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

  // 选人开局三张英雄牌：后端在进入选人后 OCR 识别，通过事件推过来
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<ChampionRank[]>("champ-select-cards", (event) => {
      if (!disposed && event.payload?.length) setChampCards(event.payload);
    })
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

  // 离开选人阶段清空英雄牌
  useEffect(() => {
    if (lcu?.phase !== "ChampSelect") setChampCards([]);
  }, [lcu?.phase]);

  // 重抽英雄牌后手动刷新：收起助手重新截屏识别
  const refreshChampCards = useCallback(() => {
    setCardsRefreshing(true);
    api
      .refreshChampCards()
      .then((rows) => {
        if (rows?.length) setChampCards(rows);
      })
      .catch(() => undefined)
      .finally(() => setCardsRefreshing(false));
  }, []);

  // 手动触发符文三选一：自动判定偶尔会漏，给一个随时可点的入口
  const captureAugments = useCallback(() => {
    setAugmentBusy(true);
    setAugmentError(null);
    api
      .captureAugmentOptions()
      .then((picks) => {
        if (picks?.length) setAugmentPicks(picks);
        else setAugmentError("没识别到三张符文卡：确认卡片在屏幕上，再点一次");
      })
      .catch(() => setAugmentError("识别失败，请重试"))
      .finally(() => setAugmentBusy(false));
  }, []);

  useEffect(() => {
    if (!augmentError) return;
    const timer = window.setTimeout(() => setAugmentError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [augmentError]);

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

  const closeUpdatePrompt = useCallback(() => setUpdatePromptOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const handleInstall = useCallback(async () => {
    const version =
      update.status === "available" || update.status === "downloading"
        ? update.version
        : update.status === "error"
          ? update.version ?? ""
          : "";

    // 无论在设置里还是弹窗里点更新，都用同一个进度框展示
    setUpdatePromptOpen(true);
    setUpdate({ status: "downloading", version, percent: -1 });
    try {
      await installUpdate((percent) => setUpdate({ status: "downloading", version, percent }));
    } catch {
      setUpdate({
        status: "error",
        kind: "install",
        version: version || undefined,
        message: "下载或安装更新失败，请检查网络后重试；当前版本仍可正常使用。",
      });
    }
  }, [update]);

  const checkUpdateManually = useCallback(async () => {
    setUpdate({ status: "checking" });
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdate({ status: "available", version: info.version, notes: info.notes });
        setUpdatePromptOpen(true);
      } else {
        setUpdate({ status: "latest" });
      }
    } catch {
      // 手动检查失败只在底栏 / 设置里提示，不弹窗打断
      setUpdate({ status: "error", kind: "manual", message: "无法连接到更新服务器" });
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
  // 选人阶段展示「当前英雄 + 备战席」的强度榜（大乱斗 / 海克斯大乱斗才有备战席）
  const inChampSelect =
    lcu?.phase === "ChampSelect" && (lcu.mode === "mayhem" || lcu.mode === "aram");
  const inGame =
    lcu?.phase === "InProgress" ||
    lcu?.phase === "GameStart" ||
    lcu?.phase === "Reconnect";

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
          {inGame && lcu?.mode === "mayhem" && (
            <button
              onClick={captureAugments}
              disabled={augmentBusy}
              title="手动识别当前三张符文卡（不看等级/血量）"
              className={`rounded-md border px-2 py-1 text-[10px] transition ${
                augmentBusy
                  ? "cursor-wait border-gold-400/40 bg-gold-400/10 text-gold-200/70"
                  : "border-gold-400/30 text-gold-200/80 hover:border-gold-400/60 hover:bg-gold-400/10"
              }`}
            >
              {augmentBusy ? "识别中…" : "符文三选一"}
            </button>
          )}
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
          <button
            onClick={() => setSettingsOpen(true)}
            title="设置"
            className={`rounded-md border p-1.5 transition ${
              update.status === "available"
                ? "border-gold-400/60 bg-gold-400/15 text-gold-300"
                : "border-white/10 text-white/45 hover:border-gold-400/40 hover:text-gold-200"
            }`}
          >
            <IconGear />
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {augmentError && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-2.5 py-2 text-[11px] text-amber-200/80">
            {augmentError}
          </div>
        )}

        {inChampSelect && (
          <ChampSelectBoard
            championId={lcu?.championId ?? null}
            benchIds={lcu?.benchChampionIds ?? []}
            cards={champCards}
            onRefreshCards={lcu?.mode === "mayhem" ? refreshChampCards : undefined}
            refreshing={cardsRefreshing}
          />
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
          {meta
            ? ` · 数据 ${meta.version}${
                meta.opggVersion && meta.opggVersion !== meta.version
                  ? ` / OP.GG ${meta.opggVersion}`
                  : ""
              }`
            : ""}
          <span className="text-white/20"> · F1 唤起</span>
        </span>
        <button
          onClick={() => {
            if (update.status === "available" || update.status === "downloading") {
              setUpdatePromptOpen(true);
            } else {
              checkUpdateManually();
            }
          }}
          className={`transition hover:text-gold-300 ${
            update.status === "available" ? "text-gold-300" : ""
          }`}
          title={
            (update.status === "error" && update.message) ||
            (update.status === "available" ? "查看更新详情" : "检查更新")
          }
        >
          {update.status === "checking"
            ? "检查中…"
            : update.status === "latest"
              ? "已是最新版"
              : update.status === "available"
                ? `新版本 v${update.version}`
                : update.status === "downloading"
                  ? `更新中 ${update.percent >= 0 ? `${update.percent}%` : "…"}`
                  : update.status === "error"
                    ? "检查失败"
                    : "检查更新"}
        </button>
      </footer>

      <UpdatePrompt
        open={updatePromptOpen}
        update={update}
        onDismiss={closeUpdatePrompt}
        onInstall={handleInstall}
      />

      <AugmentPrompt picks={augmentPicks} onClose={() => setAugmentPicks(null)} />

      <SettingsPanel
        open={settingsOpen}
        appVersion={appVersion}
        meta={meta}
        update={update}
        onClose={closeSettings}
        onCheck={checkUpdateManually}
        onInstall={handleInstall}
      />

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

