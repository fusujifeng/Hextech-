const btn = document.querySelector('button[title="浏览英雄出装"]');
btn?.click();
await new Promise((r) => setTimeout(r, 400));

const input = document.querySelector('input[placeholder^="搜索"]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
setter.call(input, "金克丝");
input.dispatchEvent(new Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 400));

const card = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("金克丝") && b.querySelector("img"));
if (!card) return "no result card";
card.click();
await new Promise((r) => setTimeout(r, 900));

const imgs = [...document.images];
const external = performance
  .getEntriesByType("resource")
  .map((r) => r.name)
  .filter((n) => /^https?:/.test(n) && !n.includes("127.0.0.1") && !n.includes("localhost"));

return JSON.stringify({
  images: imgs.length,
  broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
  localIcons: imgs.filter((i) => i.src.includes("/icons/")).length,
  externalResources: external.slice(0, 5),
  heading: document.querySelector("h1")?.textContent ?? "",
});
