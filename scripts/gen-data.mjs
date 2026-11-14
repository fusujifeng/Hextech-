#!/usr/bin/env node
/**
 * 从「海克斯大乱斗数据站」https://www.resg.top 抓取基础数据，生成：
 *   src-tauri/data/resg.json           —— 英雄 / 装备 / 强化符文元数据
 *   src-tauri/data/recommendations.json —— 按英雄索引的出装与强化推荐
 *
 * 数据接口（页面内使用的公开静态接口，均为 `export default {...}` 的 .js 文件）：
 *   /api/v1/versions.js
 *   /api/v1/versions/{v}/champions.js
 *   /api/v1/versions/{v}/champions/{id}.js
 *   /api/v1/versions/{v}/augments.js
 *   /api/v1/versions/{v}/augments/{id}.js
 *   /api/v1/items-detail.js
 *
 * 用法：
 *   node scripts/gen-data.mjs                  # 跟随数据站最新版本
 *   node scripts/gen-data.mjs --version 16.22
 *   node scripts/gen-data.mjs --refresh        # 忽略本地缓存
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(root, "src-tauri/data");
const CACHE_DIR = resolve(root, "scripts/.cache");
const ICON_DIR = resolve(root, "public/icons");

const API = "https://www.resg.top/api/v1";
const CDN = "https://cdn.resg.top";

const args = process.argv.slice(2);
const versionArg = args.indexOf("--version");
const PINNED = versionArg !== -1 ? args[versionArg + 1] : null;
const REFRESH = args.includes("--refresh");
const CONCURRENCY = 6;

// ── 请求 / 缓存 ─────────────────────────────────────────────────────

const cacheFile = (key) => resolve(CACHE_DIR, key.replace(/[^a-zA-Z0-9._-]/g, "_"));

async function fetchText(url, cacheKey) {
  const file = cacheFile(cacheKey);
  if (!REFRESH && existsSync(file)) {
    return readFile(file, "utf8");
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "aram-mayhem-helper/gen-data", referer: "https://www.resg.top/" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text);
      return text;
    } catch (e) {
      if (attempt === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

/** 接口返回的是 `export default {...}` 的 ES module 文本 */
function parseModule(text) {
  return JSON.parse(text.replace(/^\s*export\s+default\s+/, ""));
}

async function api(path) {
  const text = await fetchText(`${API}${path}`, path.replace(/^\//, ""));
  return parseModule(text);
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ── 小工具 ──────────────────────────────────────────────────────────

/** 统计行：[名次, [id...], 场次, 胜场, 胜率*10000, 选取率*10000] */
const rowIds = (row) => (Array.isArray(row?.[1]) ? row[1] : []);
const rowGames = (row) => Number(row?.[2]) || 0;
const rowWr = (row) => (Number(row?.[4]) || 0) / 10000;

const uniq = (list) => [...new Set(list)];
const icon = (p) => (p?.startsWith("http") ? p : CDN + p);

/**
 * 把远程图标下载到 public/icons/<kind>/<id>.png，返回应用内的本地路径。
 * 下载失败时保留远程地址作为兜底（联网时仍可显示）。
 */
async function localIcon(kind, id, remote) {
  const rel = `/icons/${kind}/${id}.png`;
  const dest = resolve(ICON_DIR, kind, `${id}.png`);
  try {
    if (!REFRESH && existsSync(dest)) return rel;
    const res = await fetch(remote, { headers: { "user-agent": "aram-mayhem-helper/gen-data" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return rel;
  } catch (e) {
    console.warn(`  [!] 图标下载失败 ${remote}: ${e.message}（保留远程地址）`);
    return remote;
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────

async function main() {
  const versions = await api("/versions.js");
  const version = PINNED ?? versions[0]?.version;
  if (!version) throw new Error("无法获取数据版本");
  console.log(`resg 数据版本: ${version}（采集于 ${versions.find((v) => v.version === version)?.collectedAt ?? "?"}）`);

  const [champList, itemDict, augmentList] = await Promise.all([
    api(`/versions/${version}/champions.js`),
    api(`/items-detail.js`),
    api(`/versions/${version}/augments.js`),
  ]);

  const champions = champList.items ?? [];
  console.log(`英雄 ${champions.length} 位 · 装备 ${Object.keys(itemDict).length} 件 · 强化 ${augmentList.items?.length ?? 0} 个`);

  // 1. 逐个英雄抓详情（并发 6，带缓存）
  const details = await pool(champions, CONCURRENCY, async (c) => {
    try {
      return { id: c.id, data: await api(`/versions/${version}/champions/${c.id}.js`) };
    } catch (e) {
      console.warn(`  [!] 英雄 ${c.id} ${c.name} 详情获取失败: ${e.message}`);
      return { id: c.id, data: null };
    }
  });

  const usedItemIds = new Set();
  const usedAugmentIds = new Set();
  const recs = {};

  for (const { id, data } of details) {
    if (!data) continue;
    const champ = data.champion ?? {};
    // 数值型修正（例如「技能急速」）统一转成字符串，Rust 侧只按文本展示
    const nerf = Object.fromEntries(
      Object.entries(data.bb ?? {}).map(([k, v]) => [k, String(v)]),
    );

    // 首发装备：si 前两条（通常是首件成装/关键小件）
    const start = uniq(data.si?.slice(0, 2).flatMap(rowIds) ?? []).slice(0, 3);

    // 鞋子：按出场顺序取前两双
    const boots = uniq(data.b?.BOOTS?.slice(0, 2).flatMap(rowIds) ?? []).slice(0, 2);

    // 核心：combos 的 "N" 表示「N 件套」的搭配统计，"5" 的第一名就是完整五件套。
    // 从五件套往下退，取第一套至少有 3 件的成装组合。
    const combos = data.ia?.combos ?? {};
    let core = [];
    for (let slot = 5; slot >= 3; slot--) {
      const top = combos[String(slot)]?.[0];
      const ids = rowIds(top);
      if (ids.length >= 3) {
        core = ids.slice(0, 5);
        break;
      }
    }
    if (core.length === 0) {
      // 兜底：按出场率取前五件成装
      core = (data.ia?.items ?? []).slice(0, 5).map((row) => row[0]);
    }

    // 高胜率备选：场次足够的装备里按胜率排序，排除已推荐
    const coreSet = new Set([...core, ...start, ...boots]);
    const situational = (data.ia?.items ?? [])
      .filter((row) => rowGames(row) >= 1500 && !coreSet.has(row[0]))
      .sort((a, b) => rowWr(b) - rowWr(a))
      .slice(0, 4)
      .map((row) => row[0]);

    // 推荐强化：ra 已按使用率排序，取前 6
    const augments = uniq((data.ra ?? []).slice(0, 6).map((row) => row[0]));

    [...start, ...boots, ...core, ...situational].forEach((x) => usedItemIds.add(String(x)));
    augments.forEach((x) => usedAugmentIds.add(String(x)));

    recs[id] = {
      start,
      boots,
      core,
      situational,
      augments,
      winRate: Number(champ.wr) || 0,
      tier: champ.tier ?? "",
      games: Number(champ.tm) || 0,
      nerf,
    };
  }

  // 2. 补齐强化符文详情（真实名称 / 描述，接口里列表页的名称是占位符）
  console.log(`拉取 ${usedAugmentIds.size} 个强化符文详情…`);
  const augmentMeta = {};
  const listById = new Map((augmentList.items ?? []).map((a) => [String(a.id), a]));

  await pool([...usedAugmentIds], CONCURRENCY, async (id) => {
    let meta = listById.get(id);
    try {
      const detail = await api(`/versions/${version}/augments/${id}.js`);
      if (detail?.augment) meta = detail.augment;
    } catch {
      /* 详情失败就用列表里的数据 */
    }
    if (!meta) return;
    augmentMeta[id] = {
      name: meta.name || `海克斯 #${id}`,
      icon: icon(meta.ip),
      quality: Number(meta.quality) || 0,
      tier: meta.tier ?? "",
      winRate: Number(meta.wr) || 0,
      desc: stripTags(meta.description || ""),
    };
  });

  // 3. 组装元数据
  const champMeta = {};
  for (const c of champions) {
    champMeta[c.id] = {
      name: c.name,
      title: c.title,
      alias: c.alias,
      roles: c.roles ?? [],
      tier: c.tier ?? "",
      winRate: Number(c.wr) || 0,
      icon: icon(c.ip),
    };
  }

  const itemMeta = {};
  for (const id of usedItemIds) {
    const it = itemDict[id];
    if (!it) continue;
    itemMeta[id] = { name: it.name, icon: icon(it.ip) };
  }

  // 4. 图标落地到 public/icons，随应用分发，断网也能显示
  console.log(
    `下载图标：${usedItemIds.size} 件装备 / ${Object.keys(augmentMeta).length} 个强化 / ${champions.length} 位英雄`,
  );
  await pool([...usedItemIds], CONCURRENCY, async (id) => {
    if (itemMeta[id]) itemMeta[id].icon = await localIcon("items", id, itemMeta[id].icon);
  });
  await pool(Object.keys(augmentMeta), CONCURRENCY, async (id) => {
    augmentMeta[id].icon = await localIcon("augments", id, augmentMeta[id].icon);
  });
  await pool(champions, CONCURRENCY, async (c) => {
    const meta = champMeta[c.id];
    if (meta) meta.icon = await localIcon("champions", c.id, meta.icon);
  });
  const localCount = [
    ...Object.values(itemMeta),
    ...Object.values(augmentMeta),
    ...Object.values(champMeta),
  ].filter((m) => m.icon.startsWith("/icons/")).length;
  console.log(`图标已本地化 ${localCount} 个 → public/icons/`);

  const resg = {
    version,
    collectedAt: versions.find((v) => v.version === version)?.collectedAt ?? "",
    generatedAt: new Date().toISOString(),
    champions: champMeta,
    items: itemMeta,
    augments: augmentMeta,
  };

  const recommendations = {
    schema: 2,
    gameVersion: version,
    generatedAt: resg.generatedAt,
    champions: recs,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(resolve(DATA_DIR, "resg.json"), JSON.stringify(resg));
  await writeFile(resolve(DATA_DIR, "recommendations.json"), JSON.stringify(recommendations));

  const missing = champions.filter((c) => !recs[c.id]);
  console.log(
    `完成：${Object.keys(recs).length} 位英雄、${Object.keys(itemMeta).length} 件装备、${Object.keys(augmentMeta).length} 个强化` +
      (missing.length ? `（${missing.length} 位无数据：${missing.map((c) => c.name).join("、")}）` : ""),
  );
}

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
