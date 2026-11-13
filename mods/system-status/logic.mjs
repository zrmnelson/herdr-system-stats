/** @param {string} text */
export function cpuSample(text) {
  const line = text.split("\n").find(line => /^cpu\s/.test(line));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (values.length < 4 || values.some(n => !Number.isFinite(n) || n < 0)) return null;
  return {total: values.reduce((sum, n) => sum + n, 0), idle: values[3] + (values[4] ?? 0)};
}

/** @param {{total: number, idle: number} | null} previous @param {{total: number, idle: number} | null} current */
export function cpuUsage(previous, current) {
  if (!previous || !current) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0 || idle < 0 || idle > total) return null;
  return 100 * (1 - idle / total);
}

/** @param {string} text */
export function memorySample(text) {
  const total = Number(text.match(/^MemTotal:\s+(\d+) kB/m)?.[1]) * 1024;
  const available = Number(text.match(/^MemAvailable:\s+(\d+) kB/m)?.[1]) * 1024;
  return total > 0 && available >= 0 && available <= total ? {used: total - available, total} : null;
}

/** @param {string} text */
export function gpuSample(text) {
  const fields = text.trim().split("\n")[0].split(",");
  if (fields.length !== 3) return null;
  const numbers = fields.map(field => field.trim() === "" ? NaN : Number(field.trim()));
  const [load, used, total] = numbers;
  const validTotal = Number.isFinite(total) && total > 0;
  return {
    load: Number.isFinite(load) && load >= 0 && load <= 100 ? load : null,
    used: validTotal && Number.isFinite(used) && used >= 0 && used <= total ? used * 1048576 : null,
    total: validTotal ? total * 1048576 : null,
  };
}

/** @param {number | null | undefined} value */
export function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "—";
}

/** @param {number | null | undefined} bytes */
export function formatGB(bytes) {
  return Number.isFinite(bytes) ? `${(bytes / 1e9).toFixed(1)} GB` : "—";
}
