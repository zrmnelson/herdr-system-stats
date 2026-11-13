import assert from "node:assert/strict";
import { cpuSample, cpuUsage, memorySample, gpuSample, formatPercent, formatGB } from "./logic.mjs";

// Linux guest counters are already included in user/nice: never double count.
const before = cpuSample("cpu  100 10 20 300 30 5 5 10 40 0\ncpu0 0 0");
const after = cpuSample("cpu  140 10 30 330 40 5 5 20 60 0\n");
assert.deepEqual(before, {total: 480, idle: 330});
assert.deepEqual(after, {total: 580, idle: 370});
assert.equal(cpuUsage(before, after), 60);
assert.equal(cpuUsage(null, after), null);
assert.equal(cpuUsage(after, after), null);
assert.equal(cpuUsage(after, before), null);
assert.equal(cpuSample("not a proc stat"), null);
assert.equal(cpuSample("cpu  1 NaN 3 4"), null);
assert.equal(cpuUsage({total: 0, idle: 0}, {total: 100, idle: -1}), null);

assert.deepEqual(memorySample("MemTotal:  8000000 kB\nMemFree: 100000 kB\nMemAvailable: 3000000 kB\n"), {used: 5120000000, total: 8192000000});
assert.equal(memorySample("MemTotal: 8000 kB\n"), null);
assert.equal(memorySample("MemTotal: 8000 kB\nMemAvailable: 9000 kB\n"), null);
assert.equal(memorySample("MemTotal: 0 kB\nMemAvailable: 0 kB\n"), null);

assert.deepEqual(gpuSample("24, 2048, 8192\n"), {load: 24, used: 2147483648, total: 8589934592});
assert.deepEqual(gpuSample("0, 0, 8192\n42, 100, 200"), {load: 0, used: 0, total: 8589934592});
assert.deepEqual(gpuSample("[N/A], 1024, 8192"), {load: null, used: 1073741824, total: 8589934592});
assert.equal(gpuSample("NVIDIA-SMI has failed"), null);
assert.equal(gpuSample(""), null);
assert.deepEqual(gpuSample("101, -1, 0"), {load: null, used: null, total: null});
assert.equal(formatPercent(0), "0%");
assert.equal(formatPercent(24.6), "25%");
assert.equal(formatPercent(null), "—");
assert.equal(formatPercent(NaN), "—");
assert.equal(formatGB(2147483648), "2.1 GB"); // Decimal GB, not mislabeled GiB.
assert.equal(formatGB(0), "0.0 GB");
assert.equal(formatGB(null), "—");
console.log("ok: CPU deltas, RAM, NVIDIA parsing, unavailable/reset data and units");
