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
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(root, "src-tauri/data");
const CACHE_DIR = resolve(root, "scripts/.cache");
const ICON_DIR = resolve(root, "public/icons");

const API = "https://www.resg.top/api/v1";
const CDN = "https://cdn.resg.top";
const OPGG_PAGE = "https://op.gg/zh-cn/lol/modes/aram-mayhem";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const args = process.argv.slice(2);
const versionArg = args.indexOf("--version");
const PINNED = versionArg !== -1 ? args[versionArg + 1] : null;
const patchArg = args.indexOf("--patch");
let OPGG_PATCH = patchArg !== -1 ? args[patchArg + 1] : null;
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
        headers: {
          "user-agent": UA,
          "accept-language": "zh-CN,zh;q=0.9",
          referer: url.startsWith("https://op.gg") ? "https://op.gg/" : "https://www.resg.top/",
        },
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

/**
 * 读取 OP.GG 当前的数据版本（页面上的「16.23版本」）。
 * 可用 --patch 16.23 显式指定，未指定时自动探测。
 */
async function detectOpggPatch() {
  try {
    const res = await fetch(OPGG_PAGE, {
      headers: { "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/(\d{1,2}\.\d{1,2})\s*版本/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * 抓 OP.GG 的单英雄「海克斯大乱斗 → 强化符文」页，解析内嵌的 RSC 数据。
 *
 * 页面里每个强化符文形如：
 *   { id, tier, performance, popular, name, key, largeIcon, smallIcon, rarity, desc, tooltip }
 * 其中 performance 是 OP.GG 的强度分（100 ≈ 该模式平均胜率），popular 是选用率百分比。
 * 返回按 performance 从高到低排序的列表；没有数据时返回 null。
 */
async function fetchOpggAugments(alias) {
  const slug = alias.toLowerCase();
  const patchQuery = OPGG_PATCH ? `?patch=${encodeURIComponent(OPGG_PATCH)}` : "";
  const cacheKey = `opgg_${slug}${OPGG_PATCH ? `_${OPGG_PATCH}` : ""}.html`;
  let html;
  try {
    html = await fetchText(`${OPGG_PAGE}/${slug}/augments${patchQuery}`, cacheKey);
  } catch (e) {
    console.warn(`  [!] OP.GG ${slug} 抓取失败: ${e.message}`);
    return null;
  }

  const chunkRe = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const match of html.matchAll(chunkRe)) {
    if (!match[1].includes('\\"data\\":[{\\"id\\":')) continue;
    let chunk;
    try {
      chunk = JSON.parse('"' + match[1] + '"');
    } catch {
      continue;
    }
    const start = chunk.indexOf("[");
    if (start < 0) continue;
    let outer;
    try {
      outer = JSON.parse(chunk.slice(start));
    } catch {
      continue;
    }
    const data = outer?.[3]?.data;
    if (!Array.isArray(data) || data.length < 20) continue;

    return data
      .filter(
        (a) =>
          // tier 0–5 对应 OP.GG 的 S/A/B/C/D/E 五档，全部保留；
          // 只过滤没有名称、没有选取率的占位条目（performance 常为 170、popular≈0）
          Number(a.popular) > 0 &&
          Number(a.performance) > 0 &&
          Boolean(a.name),
      )
      // OP.GG 页面的顺序：先按梯度 S→E，同梯度内按选用率从高到低
      .sort(
        (a, b) =>
          Number(a.tier) - Number(b.tier) || Number(b.popular) - Number(a.popular),
      )
      .map((a) => ({
        id: Number(a.id),
        performance: Number(a.performance),
        popular: Number(a.popular),
        tier: a.tier ?? null,
        name: a.name ?? "",
        icon: a.largeIcon ?? "",
        rarity: Number(a.rarity) || 0,
      }));
  }
  return null;
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

/** OP.GG 的 rarity 位掩码 → 品质（1 白银 / 2 黄金 / 3 棱彩） */
function rarityToQuality(rarity) {
  if (rarity === 1) return 1;
  if (rarity === 4) return 2;
  if (rarity === 8) return 3;
  return 0;
}

/**
 * 把远程图标下载到 public/icons/<kind>/<id>.png，返回应用内的本地路径。
 * 下载失败时保留远程地址作为兜底（联网时仍可显示）。
 */
async function localIcon(kind, id, remote) {
  if (!remote) return "";
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

  if (!OPGG_PATCH) OPGG_PATCH = await detectOpggPatch();
  console.log(`OP.GG 数据版本: ${OPGG_PATCH ?? "当前版本"}（?patch=${OPGG_PATCH ?? "auto"}）`);

  const [champList, itemDict, augmentList] = await Promise.all([
    api(`/versions/${version}/champions.js`),
    api(`/items-detail.js`),
    api(`/versions/${version}/augments.js`),
  ]);

  const champions = champList.items ?? [];
  const listById = new Map((augmentList.items ?? []).map((a) => [String(a.id), a]));
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

  // 1.5 抓 OP.GG 的强化符文梯度（每个英雄一页，带缓存）
  console.log("抓取 OP.GG 强化符文梯度…");
  const opggPicks = new Map(); // championId -> picks[]
  const opggAugMeta = new Map(); // augmentId -> { name, icon, rarity }
  let opggOk = 0;

  await pool(champions, 4, async (c) => {
    const picks = await fetchOpggAugments(c.alias);
    if (!picks?.length) return;
    opggOk++;
    opggPicks.set(c.id, picks);
    for (const p of picks) {
      if (!opggAugMeta.has(p.id)) {
        opggAugMeta.set(p.id, { name: p.name, icon: p.icon, rarity: p.rarity });
      }
    }
  });
  console.log(`OP.GG 覆盖 ${opggOk}/${champions.length} 位英雄`);

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

    // 推荐强化：优先用 OP.GG 的强度排序（performance 从高到低），抓不到时退回 resg 的使用率前 6
    const picks = opggPicks.get(id);
    // 只保留有图标的强化，全量保留（界面按品质分档，需要该英雄每档的全部强化）
    const iconOf = (augId) =>
      listById.get(String(augId))?.ip || opggAugMeta.get(Number(augId))?.icon || "";
    const viablePicks = (picks ?? []).filter((p) => iconOf(p.id));

    let augments;
    if (viablePicks.length > 0) {
      // 紧凑格式：[id, 强度分, 选用率, 品质]，体积约为对象写法的 60%
      augments = viablePicks.map((p) => [
        p.id,
        Number(p.performance.toFixed(2)),
        Number(p.popular.toFixed(2)),
        rarityToQuality(p.rarity) || Number(listById.get(String(p.id))?.quality) || 0,
        Number(p.tier) || 0,
      ]);
    } else {
      augments = uniq((data.ra ?? []).slice(0, 6).map((row) => row[0]))
        .filter((augId) => iconOf(augId))
        .map((augId) => [augId, null, null, Number(listById.get(String(augId))?.quality) || 0, 255]);
    }

    [...start, ...boots, ...core, ...situational].forEach((x) => usedItemIds.add(String(x)));
    augments.forEach((a) => usedAugmentIds.add(String(a[0])));

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

  await pool([...usedAugmentIds], CONCURRENCY, async (id) => {
    let meta = listById.get(id);
    try {
      const detail = await api(`/versions/${version}/augments/${id}.js`);
      if (detail?.augment) meta = detail.augment;
    } catch {
      /* 详情失败就用列表里的数据 */
    }
    const fallback = opggAugMeta.get(Number(id));
    if (meta) {
      // resg 列表页对新强化常给占位名「海克斯 #xxxx」，有 OP.GG 真名时优先用 OP.GG
      const placeholder = !meta.name || /^海克斯 #\d+$/.test(meta.name);
      augmentMeta[id] = {
        name: (placeholder ? fallback?.name : meta.name) || meta.name || `海克斯 #${id}`,
        icon: icon(meta.ip),
        quality: Number(meta.quality) || 0,
        tier: meta.tier ?? "",
        winRate: Number(meta.wr) || 0,
        desc: stripTags(meta.description || ""),
      };
    } else if (fallback) {
      // resg 没有收录、但 OP.GG 有数据的新强化：用 OP.GG 的名称和图标
      augmentMeta[id] = {
        name: fallback.name || `海克斯 #${id}`,
        icon: fallback.icon,
        quality: rarityToQuality(fallback.rarity),
        tier: "",
        winRate: 0,
        desc: "",
      };
    }
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

  // 清掉不在本次数据里的旧图标，避免仓库越攒越大
  const keepAugments = new Set(Object.keys(augmentMeta).map((id) => `${id}.png`));
  const augmentDir = resolve(ICON_DIR, "augments");
  if (existsSync(augmentDir)) {
    for (const file of await readdir(augmentDir)) {
      if (!keepAugments.has(file)) await unlink(resolve(augmentDir, file)).catch(() => {});
    }
  }

  const resg = {
    version,
    opggVersion: OPGG_PATCH ?? "",
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
