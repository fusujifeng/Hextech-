/** 与 Rust 侧 `lcu::State` / `data::Recommendation` 一一对应（camelCase）。 */

export type GameMode = "mayhem" | "aram" | "other" | "idle";

export interface LcuState {
  connected: boolean;
  /** 凭证来源：进程扫描 / lockfile / 日志解析 */
  source: string;
  phase: string;
  queueId: number | null;
  queueType: string;
  mode: GameMode;
  championId: number | null;
  championName: string | null;
  championAlias: string | null;
  benchEnabled: boolean;
  benchCount: number;
  updatedAt: number;
  error: string | null;
}

export interface ItemView {
  id: number;
  name: string;
  icon: string;
}

export interface AugmentView {
  id: number;
  name: string;
  icon: string;
  /** 1 = 白银, 2 = 黄金, 3 = 棱彩 */
  quality: number;
  /** OP.GG 强度分（100 ≈ 该模式平均），无数据为 null */
  performance: number | null;
  /** OP.GG 选用率（百分比） */
  popular: number | null;
  /** 名次，从 1 开始 */
  rank: number;
  desc: string;
}

export interface ChampionView {
  id: number;
  /** 英雄名称，例如「格雷福斯」 */
  name: string;
  /** 英雄称号，例如「法外狂徒」 */
  title: string;
  alias: string;
  roles: string[];
  tier: string;
  winRate: number;
  icon: string;
  nicknames: string[];
}

export interface Recommendation {
  champion: ChampionView;
  mode: Exclude<GameMode, "idle">;
  modeLabel: string;
  starter: ItemView[];
  boots: ItemView[];
  core: ItemView[];
  situational: ItemView[];
  augments: AugmentView[];
  /** [[承伤修正, 105%], [造成伤害, 90%]] */
  nerf: [string, string][];
  winRate: number;
  tier: string;
  games: number;
  tip: string;
  source: string;
  version: string;
  updatedAt: string;
}

export interface ChampionBrief {
  id: number;
  /** 英雄名称，例如「格雷福斯」 */
  name: string;
  /** 英雄称号，例如「法外狂徒」 */
  title: string;
  alias: string;
  roles: string[];
  tier: string;
  winRate: number;
  /** 俗称 / 外号，例如「男枪」 */
  nicknames: string[];
  /** 本地图标路径，例如 /icons/champions/104.png */
  icon: string;
}

export interface Meta {
  version: string;
  championCount: number;
  itemCount: number;
  augmentCount: number;
  updatedAt: string;
  source: string;
}

export const ROLE_LABEL: Record<string, string> = {
  fighter: "战士",
  tank: "坦克",
  mage: "法师",
  assassin: "刺客",
  marksman: "射手",
  support: "辅助",
};

export const QUALITY_LABEL: Record<number, string> = {
  1: "白银",
  2: "黄金",
  3: "棱彩",
};

export const PHASE_LABEL: Record<string, string> = {
  None: "未登录",
  Lobby: "房间中",
  Matchmaking: "匹配中",
  ReadyCheck: "确认对局",
  ChampSelect: "选人阶段",
  GameStart: "游戏启动",
  InProgress: "对局中",
  Reconnect: "重连中",
  WaitingForStats: "结算中",
  EndOfGame: "对局结束",
};

export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
