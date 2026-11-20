#!/usr/bin/env node
/**
 * 计算并写入版本号：日期 + 同日多次打包的 -2 / -3 后缀。
 *
 *   node scripts/next-version.mjs --dry-run   # 只打印下一版版本号
 *   node scripts/next-version.mjs             # 写入 package.json / tauri.conf.json / Cargo.toml / Cargo.lock
 *
 * 规则：
 *   当天第一个包        2026.11.20
 *   当天第二个包        2026.11.20-2
 *   当天第三个包        2026.11.20-3
 *
 * 版本号取自本地 git tag（v2026.11.20 / v2026.11.20-2 …）。
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");
const now = new Date();
const base = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(
  now.getDate(),
).padStart(2, "0")}`;

let tags = [];
try {
  tags = execSync("git tag -l", { encoding: "utf8" })
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
} catch {
  // 不是 git 仓库时按当天第一版处理
}

const sameDay = tags.filter((t) => t === `v${base}` || t.startsWith(`v${base}-`));
let next;
if (!sameDay.includes(`v${base}`)) {
  next = base;
} else {
  let max = 1; // 无后缀那一版算第 1 次
  for (const t of sameDay) {
    const m = /-(\d+)$/.exec(t);
    if (m) max = Math.max(max, Number(m[1]));
  }
  next = `${base}-${max + 1}`;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const old = pkg.version;

if (dryRun) {
  console.log(`当前版本: ${old}`);
  console.log(`下一版本: ${next}`);
  process.exit(0);
}

// package.json
pkg.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// package-lock.json（根包版本）
try {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  lock.version = next;
  if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
  writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
} catch {
  // 没有 lock 文件时跳过
}

// tauri.conf.json
const confPath = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = next;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

// Cargo.toml（[package] 的 version，第一次出现）
const cargoPath = "src-tauri/Cargo.toml";
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${next}"`);
writeFileSync(cargoPath, cargo);

// Cargo.lock（只改本包）
const lockPath = "src-tauri/Cargo.lock";
try {
  let lock = readFileSync(lockPath, "utf8");
  lock = lock.replace(
    /(name = "aram-mayhem-helper"\r?\nversion = ")[^"]+(")/,
    `$1${next}$2`,
  );
  writeFileSync(lockPath, lock);
} catch {
  // 没有 lock 文件时跳过
}

console.log(`版本: ${old} -> ${next}`);
