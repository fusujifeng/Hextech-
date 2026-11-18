import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateState } from "../lib/updater";
import type { Meta } from "../lib/types";

interface Props {
  open: boolean;
  appVersion: string;
  meta: Meta | null;
  update: UpdateState;
  onClose: () => void;
  onCheck: () => void;
  onInstall: () => void;
}

type Tone = "muted" | "ok" | "gold" | "error";

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-white/45",
  ok: "text-teal-300/85",
  gold: "text-gold-300",
  error: "text-red-300/85",
};

function statusOf(update: UpdateState): { text: string; tone: Tone } {
  switch (update.status) {
    case "checking":
      return { text: "正在检查…", tone: "muted" };
    case "latest":
      return { text: "当前已是最新版本", tone: "ok" };
    case "available":
      return { text: `发现新版本 v${update.version}`, tone: "gold" };
    case "downloading":
      return {
        text: update.percent >= 0 ? `正在下载更新 ${update.percent}%` : "正在下载更新…",
        tone: "gold",
      };
    case "error":
      return { text: update.message, tone: "error" };
    default:
      return { text: "启动时会自动静默检查，也可点右侧主动检查", tone: "muted" };
  }
}

/**
 * 设置面板：主动检查软件版本、查看版本/数据信息。
 * 检查到新版本时由 App 关掉本面板并弹出更新确认框，避免两层遮罩叠在一起。
 */
export function SettingsPanel({
  open,
  appVersion,
  meta,
  update,
  onClose,
  onCheck,
  onInstall,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const status = statusOf(update);
  const busy = update.status === "checking" || update.status === "downloading";

  return (
    <div
      role="dialog"
      aria-label="设置"
      className="absolute inset-0 z-30 flex flex-col bg-[#060a11]/97 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
        <div className="text-[13px] font-medium tracking-[0.06em] text-gold-200">设置</div>
        <button
          onClick={onClose}
          className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/60 transition hover:border-gold-400/40 hover:text-gold-200"
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        <section className="overflow-hidden rounded-lg border border-white/8 bg-white/3">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11.5px] text-gold-200/85">软件更新</span>
            <span className="text-[10px] tabular-nums text-white/30">
              v{appVersion || "0.1.0"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/6 px-3 py-2.5">
            <div className="min-w-0">
              <div className={`text-[11px] ${TONE_CLASS[status.tone]}`}>{status.text}</div>
              <div className="mt-0.5 text-[9.5px] text-white/25">更新来源：GitHub Releases</div>
            </div>
            {update.status !== "available" && (
              <button
                onClick={onCheck}
                disabled={busy}
                className="shrink-0 rounded-md border border-gold-400/45 px-2.5 py-1 text-[11px] text-gold-200 transition hover:bg-gold-400/12 disabled:opacity-50"
              >
                {update.status === "checking" ? "检查中…" : "检查更新"}
              </button>
            )}
          </div>

          {update.status === "available" && (
            <div className="space-y-2 border-t border-white/6 bg-gold-400/8 px-3 py-2.5">
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-white/50">
                {update.notes.trim() || "本次更新包含功能优化与问题修复。"}
              </p>
              <button
                onClick={onInstall}
                className="w-full rounded-md bg-gold-400 px-2.5 py-1.5 text-[11px] font-medium text-[#1a1206] transition hover:bg-gold-300"
              >
                立即更新
              </button>
            </div>
          )}

          {update.status === "downloading" && (
            <div className="border-t border-white/6 px-3 py-2.5">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gold-400 transition-all"
                  style={{ width: `${update.percent >= 0 ? update.percent : 12}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-white/8 bg-white/3">
          <div className="px-3 py-2 text-[11.5px] text-gold-200/85">关于</div>
          <dl className="divide-y divide-white/6 border-t border-white/6 text-[10.5px]">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-white/40">数据版本</dt>
              <dd className="truncate text-white/70">
                {meta?.version || "—"}
                {meta?.opggVersion ? ` / OP.GG ${meta.opggVersion}` : ""}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-white/40">数据来源</dt>
              <dd className="truncate text-white/70">{meta?.source || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-white/40">收录内容</dt>
              <dd className="truncate text-white/70">
                {meta
                  ? `${meta.championCount} 英雄 · ${meta.itemCount} 装备 · ${meta.augmentCount} 强化`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="overflow-hidden rounded-lg border border-white/8 bg-white/3">
          <button
            onClick={() => invoke("quit_app").catch(() => undefined)}
            className="w-full px-3 py-2.5 text-left text-[11px] text-red-300/75 transition hover:bg-red-400/10"
          >
            退出程序
            <span className="ml-1 text-[9.5px] text-white/25">
              （托盘图标也会消失）
            </span>
          </button>
        </section>
      </div>

      <div className="border-t border-white/8 px-3.5 py-1.5 text-[9.5px] text-white/25">
        检查失败不影响使用，下次启动会自动重试
      </div>
    </div>
  );
}
