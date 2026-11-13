import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export interface AvailableUpdate {
  version: string;
  notes: string;
}

/**
 * 查询 GitHub Releases 上的 latest.json。
 * 未配置发布地址 / 网络不可用时抛错，由调用方降级为「检查失败」而不是阻塞 UI。
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check();
  if (!update) return null;
  return { version: update.version, notes: update.body ?? "" };
}

/**
 * 下载并安装更新。Windows 使用 passive 安装模式，完成后重启应用。
 * `onProgress` 回调 0–100（无法拿到总长度时回调 -1 表示未知）。
 */
export async function installUpdate(onProgress: (percent: number) => void): Promise<void> {
  const update = await check();
  if (!update) return;

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
