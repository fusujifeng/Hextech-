#!/usr/bin/env node
/**
 * 通过 WebView2 远程调试端口（9222）给应用截图，不依赖窗口是否被遮挡。
 *
 * 用法：
 *   node scripts/capture.mjs --out docs/screenshot.png
 *   node scripts/capture.mjs --out docs/search.png --eval "openPicker('男枪')"
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const OUT = argOf("out", "docs/screenshot.png");
const EVAL_FILE = argOf("eval-file", null);
const EVAL = argOf("eval", null);
const WAIT = Number(argOf("wait", "800"));
const PORT = Number(argOf("port", "9222"));

async function findPage() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* 端口还没起来 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`没有找到 WebView2 调试页面（端口 ${PORT}）`);
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((res, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve: res, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, reject) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

const send = cdp(ws);
await send("Page.enable");
await send("Runtime.enable");
await new Promise((r) => setTimeout(r, WAIT));

if (EVAL || EVAL_FILE) {
  const expression = EVAL_FILE ? await readFile(resolve(EVAL_FILE), "utf8") : EVAL;
  const result = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    console.warn("页面脚本报错:", JSON.stringify(result.exceptionDetails.exception?.description));
  } else if (result.result?.value !== undefined) {
    console.log("eval =>", JSON.stringify(result.result.value));
  }
  await new Promise((r) => setTimeout(r, WAIT));
}

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
const file = resolve(OUT);
await mkdir(dirname(file), { recursive: true });
await writeFile(file, Buffer.from(shot.data, "base64"));
console.log(`saved ${file}`);

ws.close();
process.exit(0);

