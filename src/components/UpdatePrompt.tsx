import { useEffect, useRef } from "react";
import type { UpdateState } from "../lib/updater";

interface Props {
  open: boolean;
  update: UpdateState;
  onDismiss: () => void;
  onInstall: () => void;
}

type PromptView =
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "error"; version?: string; message: string; fromInstall: boolean };

function toView(update: UpdateState): PromptView | null {
  switch (update.status) {
    case "available":
      return { kind: "available", version: update.version, notes: update.notes };
    case "downloading":
      return { kind: "downloading", version: update.version, percent: update.percent };
    case "error":
      return {
        kind: "error",
        version: update.version,
        message: update.message,
        fromInstall: update.kind === "install",
      };
    default:
      return null;
  }
}

/**
 * 发现新版本时的确认弹窗：由用户决定「立即更新」还是「稍后再说」。
 * 下载过程中禁止关闭，安装完成后应用会自动重启。
 */
export function UpdatePrompt({ open, update, onDismiss, onInstall }: Props) {
  const view = open ? toView(update) : null;
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busy = view?.kind === "downloading";
  const visible = view !== null;

  // 弹窗出现时把焦点放到主按钮，Esc 关闭（下载中不响应）。
  // 依赖用布尔值而不是 view 对象：父组件因游戏状态每 500ms 重渲染时不该反复抢焦点。
  useEffect(() => {
    if (!visible || busy) return;
    const timer = window.setTimeout(() => primaryRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [visible, busy]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, busy, onDismiss]);

  if (!view) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={() => !busy && onDismiss()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="animate-fade-up w-full max-w-[340px] overflow-hidden rounded-xl border border-gold-400/30 bg-[#0c131f] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/8 px-4 py-3">
          <div id="update-title" className="text-[13px] font-medium text-gold-200">
            {view.kind === "error"
              ? view.fromInstall
                ? "更新安装失败"
                : "检查更新失败"
              : `发现新版本 v${view.version}`}
          </div>
          <div className="mt-0.5 text-[10px] text-white/40">
            {view.kind === "error"
              ? "可以稍后再试，不影响当前使用"
              : "更新会静默安装，完成后自动重启"}
          </div>
        </div>

        <div className="max-h-[220px] overflow-y-auto px-4 py-3">
          {view.kind === "error" ? (
            <p className="text-[11px] leading-relaxed text-red-200/80">{view.message}</p>
          ) : (
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/55">
              {view.kind === "available" && view.notes.trim()
                ? view.notes.trim()
                : "本次更新包含功能优化与问题修复。"}
            </p>
          )}

          {view.kind === "downloading" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-white/50">
                <span>正在下载更新…</span>
                <span className="tabular-nums">
                  {view.percent >= 0 ? `${view.percent}%` : ""}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gold-400 transition-all"
                  style={{ width: `${view.percent >= 0 ? view.percent : 12}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-2.5">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-md px-2.5 py-1 text-[11px] text-white/45 transition hover:text-white/70 disabled:opacity-40"
          >
            稍后再说
          </button>
          <button
            ref={primaryRef}
            onClick={onInstall}
            disabled={busy}
            className="rounded-md bg-gold-400 px-2.5 py-1 text-[11px] font-medium text-[#1a1206] transition hover:bg-gold-300 disabled:opacity-60"
          >
            {view.kind === "downloading" ? "更新中…" : view.kind === "error" ? "重试" : "立即更新"}
          </button>
        </div>
      </div>
    </div>
  );
}
