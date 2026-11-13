// The native GPUI host is unavailable in Node: stub its bridge, execute the real mod.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const calls = [];
const texts = [];
const assets = [];
const tasks = [];
let failGpu = false;
let sample = 0;
let notifications = 0;
let timer;
const element = () => new Proxy({}, { get(_target, key) {
  if (key === "child") return value => { if (typeof value === "string") texts.push(value); return element(); };
  if (key === "when") return (condition, apply) => condition ? apply(element()) : element();
  return () => element();
} });
const cx = {
  timer: { every(ms, callback) { assert.equal(ms, 2000); timer = callback; } },
  spawn(callback) { tasks.push(callback(cx)); },
  notify() { notifications++; },
};
const gpui = { View: class {}, div: element, svg(path) { assets.push(path); return element(); } };
const herdr = {
  readTextFile: async path => path === "/proc/stat"
    ? (sample === 0 ? "cpu 100 10 20 300 30 5 5 10 40 0" : "cpu 140 10 30 330 40 5 5 20 60 0")
    : "MemTotal: 8000000 kB\nMemAvailable: 3000000 kB\n",
  exec: async (command, args, options) => {
    calls.push({command, args, options});
    if (failGpu) throw new Error("NVIDIA driver unavailable");
    return {code: 0, stdout: "24, 2048, 8192\n", stderr: ""};
  },
  spaces: () => [{active: true, machine: null, branch: "main"}],
  agents: () => [{status: "blocked"}, {status: "idle"}],
  theme: () => Object.fromEntries(["chrome", "border", "muted", "dim", "blocked", "foreground"].map(key => [key, "#888888"])),
  window: () => ({platform: "linux"}),
  keys: () => [{section: "global", action: "app.palette", keys: "ctrl-shift-p"}],
  run() {},
};
const context = vm.createContext({console});
const modules = new Map();
for (const [name, exports] of Object.entries({"gpui-kit": gpui, "gpui-base": {h_flex: element}, herdr})) {
  modules.set(name, new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, {context}));
}
const logic = new vm.SourceTextModule(await readFile(new URL("mods/system-status/logic.mjs", root), "utf8"), {context});
modules.set("./logic.mjs", logic);
const main = new vm.SourceTextModule(await readFile(new URL("mods/system-status/main.js", root), "utf8"), {context});
await main.link(name => { assert.ok(modules.has(name), `Unexpected runtime import ${name}`); return modules.get(name); });
await main.evaluate();
const view = new main.namespace.default();
view.init({}, cx);
view.refresh(cx); // An in-flight sample must not overlap.
assert.equal(calls.length, 1);
await Promise.all(tasks.splice(0));
assert.equal(calls[0].command, "nvidia-smi", "Resolve NVIDIA command from PATH, not a distro-specific absolute path");
assert.equal(calls[0].options.timeout, 1500);
assert.equal(calls[0].options.on, undefined, "Sampling must stay local in remote spaces");
assert.equal(view.cpu, null);
assert.equal(view.memory.used, 5120000000);
assert.equal(view.gpu.used, 2147483648);

sample = 1;
timer(cx);
await Promise.all(tasks.splice(0));
assert.equal(view.cpu, 60);
view.render();
assert.ok(texts.includes("60%"));
assert.ok(texts.includes("24%"));
assert.ok(texts.includes("2.1 GB"));
assert.ok(texts.includes("5.1 GB"));
assert.ok(texts.includes("Ctrl+Shift+P  commands"));
for (const asset of assets) {
  assert.ok(asset.startsWith("mods/system-status/"), `Self-contained icon required: ${asset}`);
  await access(new URL(asset, root));
}
assert.equal(new Set(assets).size, 6); // monitor, branch and four metric icons.

texts.length = 0;
view.width = 750;
view.render();
assert.ok(!texts.includes("This computer"));
for (const label of ["CPU", "GPU", "VRAM", "RAM", "commands"]) assert.ok(texts.includes(label));

failGpu = true;
timer(cx);
await Promise.all(tasks.splice(0));
assert.equal(view.gpu, null, "Do not retain stale GPU data after command failure");
assert.equal(view.memory.used, 5120000000, "GPU failure must not suppress RAM");
assert.equal(view.refreshing, false);
assert.equal(notifications, 3);
assert.equal(fileURLToPath(root).endsWith("/"), true);
console.log("ok: PATH lookup, local scope, nonoverlap, data/render, bundled icons, compact labels and GPU failure");
