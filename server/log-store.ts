export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  id: number;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  details?: unknown;
};

export type LogWriter = (level: LogLevel, scope: string, message: string, details?: unknown) => void;

const secretKey = /(authorization|cookie|password|passwd|secret|session|token|api_?key)/i;

function safeDetails(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => safeDetails(entry, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, secretKey.test(key) ? "[REDACTED]" : safeDetails(entry, seen)]));
}

function levelFromPino(level: number): LogLevel {
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level < 30) return "debug";
  return "info";
}

export class LogStore {
  private entries: LogEntry[] = [];
  private listeners = new Set<(entry: LogEntry) => void>();
  private nextId = 1;
  private pending = "";

  constructor(private maximumEntries = 1_000) {}

  readonly stream = {
    write: (chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      process.stdout.write(text);
      this.pending += text;
      const lines = this.pending.split("\n"); this.pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) this.capturePino(line);
    },
  };

  add(level: LogLevel, scope: string, message: string, details?: unknown, timestamp = new Date().toISOString()): LogEntry {
    const entry: LogEntry = { id: this.nextId++, timestamp, level, scope, message, ...(details === undefined ? {} : { details: safeDetails(details) }) };
    this.entries.push(entry);
    if (this.entries.length > this.maximumEntries) this.entries.splice(0, this.entries.length - this.maximumEntries);
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  list(options: { limit?: number; level?: LogLevel; search?: string; afterId?: number } = {}): LogEntry[] {
    const needle = options.search?.trim().toLowerCase();
    const filtered = this.entries.filter((entry) => (!options.level || entry.level === options.level)
      && (!options.afterId || entry.id > options.afterId)
      && (!needle || `${entry.scope} ${entry.message} ${JSON.stringify(entry.details ?? "")}`.toLowerCase().includes(needle)));
    return filtered.slice(-Math.min(this.maximumEntries, Math.max(1, options.limit ?? 500)));
  }

  subscribe(listener: (entry: LogEntry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private capturePino(line: string) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const { level, time, msg, pid: _pid, hostname: _hostname, scope, ...details } = parsed;
      const timestamp = typeof time === "number" || typeof time === "string" ? new Date(time).toISOString() : new Date().toISOString();
      const inferredScope = typeof scope === "string" ? scope : (details.req || details.res || details.reqId) ? "http" : "server";
      this.add(levelFromPino(Number(level)), inferredScope, typeof msg === "string" ? msg : "Server event", Object.keys(details).length ? details : undefined, timestamp);
    } catch {
      this.add("info", "stdout", line);
    }
  }
}
