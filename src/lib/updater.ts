import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

/** Rust 后台线程查到的待更新版本（字段对应 `PendingUpdate`）。 */
export interface AvailableUpdate {
  version: string;
  notes: string;
  currentVersion: string;
}

/**
 * 更新相关的全部 UI 状态。
 * - `kind` 区分错误来源：手动检查失败只在底栏提示，安装失败要留在弹窗里让用户重试。
 */
export type UpdateState =
  | { status: "idle" | "checking" | "latest" }
  | { status: "available"; version: string; notes: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "error"; message: string; kind: "manual" | "install"; version?: string };

/** 启动时取一次后台线程已经查到的结果（避免事件早于监听器注册而丢失）。 */
export const getPendingUpdate = () => invoke<AvailableUpdate | null>("get_pending_update");

/** 订阅后台线程的检查结果。 */
export const onUpdateAvailable = (cb: (update: AvailableUpdate) => void): Promise<UnlistenFn> =>
  listen<AvailableUpdate>("update-available", (event) => cb(event.payload));

/**
 * 手动检查 GitHub Releases 上的 latest.json。
 * 网络不可用时抛错，由调用方提示「检查失败」。
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check();
  if (!update) return null;

  const info: AvailableUpdate = {
    version: update.version,
    notes: update.body ?? "",
    currentVersion: update.currentVersion,
  };
  // Update 在 Rust 侧持有资源，只读版本号也要及时释放
  await update.close().catch(() => undefined);
  return info;
}

/**
 * 下载并安装更新。Windows 使用 passive 安装模式，完成后重启应用。
 * `onProgress` 回调 0–100（无法拿到总长度时回调 -1 表示未知）。
 */
export async function installUpdate(onProgress: (percent: number) => void): Promise<void> {
  const update = await check();
  if (!update) throw new Error("没有可用的更新");

  let total = 0;
  let received = 0;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress(total > 0 ? 0 : -1);
        break;
      case "Progress":
        received += event.data.chunkLength;
        onProgress(total > 0 ? Math.min(99, Math.round((received / total) * 100)) : -1);
        break;
      case "Finished":
        onProgress(100);
        break;
    }
  });

  await relaunch();
}
