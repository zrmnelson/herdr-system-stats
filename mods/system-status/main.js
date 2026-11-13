// SPDX-License-Identifier: Apache-2.0
// Modified from herdrdev/herdr-app v0.1.15 defaults/mods/workspace-status/main.js.
// Changes: local CPU/RAM/NVIDIA metrics, bundled icons, polling and compact layout.
// See LICENSE, NOTICE and licenses/LICENSE-Lucide.txt for attribution.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, readTextFile, exec } from "herdr";
import { cpuSample, cpuUsage, memorySample, gpuSample, formatPercent, formatGB } from "./logic.mjs";

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {Record<string, import("gpui-kit").Color>} Theme */

export default class WorkspaceStatus extends View {
  /** @type {number} */
  width = 1200;

  /** @param {unknown} _props @param {Context} cx */
  init(_props, cx) {
    this.cpu = null;
    this.previousCpu = null;
    this.memory = null;
    this.gpu = null;
    this.refreshing = false;
    cx.timer.every(2000, cx => this.refresh(cx));
    this.refresh(cx);
  }

  /** @param {Context} cx */
  refresh(cx) {
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async cx => {
      try {
        // Always this computer, even in an SSH space. No network or shell commands.
        const [stat, memory, gpu] = await Promise.allSettled([
          readTextFile("/proc/stat"),
          readTextFile("/proc/meminfo"),
          exec("nvidia-smi", ["--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"], {timeout: 1500}),
        ]);
        const current = stat.status === "fulfilled" ? cpuSample(stat.value) : null;
        this.cpu = cpuUsage(this.previousCpu, current);
        this.previousCpu = current;
        this.memory = memory.status === "fulfilled" ? memorySample(memory.value) : null;
        this.gpu = gpu.status === "fulfilled" && gpu.value.code === 0 ? gpuSample(gpu.value.stdout) : null;
      } finally {
        this.refreshing = false;
        cx.notify();
      }
    });
  }

  /** @param {string} name @param {string} value @param {number | null | undefined} percent @param {string} detail @param {Theme} t */
  metric(name, value, percent, detail, t) {
    const warning = percent != null && percent >= 90;
    return h_flex().id(`metric-${name}`).gap(5).items_center().flex_shrink_0()
      .tooltip(`This computer · ${detail} · refreshes every 2 seconds`)
      .accessibility_label(`${name.toUpperCase()} ${value}. ${detail}`)
      .child(svg(`mods/system-status/${name}.svg`).size(14).text_color(warning ? t.blocked : t.muted))
      .child(div().text_size(10.5).text_color(t.dim).child(name.toUpperCase()))
      .child(div().font_family("Geist Mono").text_color(warning ? t.blocked : t.foreground).child(value));
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint() {
    const mac = window()?.platform === "macos";
    /** @type {Record<string, string>} */
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = /** @type {Theme} */ (theme());
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    /** @param {string} icon @param {string} text */
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/system-status/${icon}.svg`).size(13)).child(text);
    return h_flex().id("status-root").size_full().px(14).gap(16).items_center().overflow_hidden()
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .when(this.width >= 800, el => el.child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer")))
      .when(Boolean(space?.branch) && this.width >= 1100, el => el.child(label("branch", space.branch).max_w(180).truncate()))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(h_flex().gap(18).items_center().flex_shrink_0()
        .child(this.metric("cpu", formatPercent(this.cpu), this.cpu, "CPU busy time (excluding idle and I/O wait)", t))
        .child(this.metric("gpu", formatPercent(this.gpu?.load), this.gpu?.load, "NVIDIA GPU utilization", t))
        .child(this.metric("vram", formatGB(this.gpu?.used), this.gpu?.total ? this.gpu.used / this.gpu.total * 100 : null,
          `NVIDIA VRAM used / ${formatGB(this.gpu?.total)} total; decimal GB`, t))
        .child(this.metric("ram", formatGB(this.memory?.used), this.memory ? this.memory.used / this.memory.total * 100 : null,
          `RAM used / ${formatGB(this.memory?.total)} total (total minus available); decimal GB`, t)))
      .child(div().w(1).h(12).bg(t.border).flex_shrink_0())
      .child(div().id("palette").text_color(t.dim).flex_shrink_0().tooltip(this.hint())
        .on_click(() => run("app.palette")).child(this.width >= 1000 ? this.hint() : "commands"));
  }
}
