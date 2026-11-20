import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AugmentView,
  ChampionBrief,
  ChampionRank,
  LcuState,
  Meta,
  Recommendation,
} from "./types";

export const getLcuState = () => invoke<LcuState>("get_lcu_state");

export const getRecommendation = (championId: number, mode: string) =>
  invoke<Recommendation>("get_recommendation", { championId, mode });

export const listChampions = () => invoke<ChampionBrief[]>("list_champions");

export const getMeta = () => invoke<Meta>("get_meta");

/** 当前英雄 + 备战席，按 OP.GG 强度排序 */
export const getChampionBoard = (ids: number[]) =>
  invoke<ChampionRank[]>("get_champion_board", { ids });

/** 手动触发符文三选一识别（不看等级/血量） */
export const captureAugmentOptions = () =>
  invoke<AugmentView[] | null>("capture_augment_options");

export const onLcuState = (cb: (state: LcuState) => void): Promise<UnlistenFn> =>
  listen<LcuState>("lcu-state", (event) => cb(event.payload));

export async function setPinned(pinned: boolean): Promise<void> {
  await getCurrentWindow().setAlwaysOnTop(pinned);
}

export async function isPinned(): Promise<boolean> {
  return getCurrentWindow().isAlwaysOnTop();
}
