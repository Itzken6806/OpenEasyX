import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CircleAlert, LoaderCircle, Pause, Play, Search, Terminal, X } from "lucide-react";
import { api } from "./api.js";
import "./logs.css";

export type LogEntry = { id: number; timestamp: string; level: "debug" | "info" | "warn" | "error"; scope: string; message: string; details?: unknown };

export function mergeLogEntries(current: LogEntry[], incoming: LogEntry[], maximum = 1_000): LogEntry[] {
  const merged = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) merged.set(entry.id, entry);
  return [...merged.values()].sort((left, right) => left.id - right.id).slice(-maximum);
}

function logTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? timestamp : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false });
}

export function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]); const [level, setLevel] = useState(""); const [scope, setScope] = useState(""); const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [paused, setPaused] = useState(false); const [pendingCount, setPendingCount] = useState(0); const [autoScroll, setAutoScroll] = useState(true);
  const pausedRef = useRef(false); const pending = useRef<LogEntry[]>([]); const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void api<{ entries: LogEntry[] }>("/api/logs?limit=1000").then((result) => { if (active) setEntries((current) => mergeLogEntries(current, result.entries)); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); });
    const stream = new EventSource("/api/logs/stream");
    stream.onopen = () => { if (active) { setConnected(true); setError(""); } };
    stream.onerror = () => { if (active) { setConnected(false); setError("Live stream disconnected. Reconnecting automatically…"); } };
    stream.onmessage = (event) => {
      if (!active) return;
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        if (pausedRef.current) { pending.current = mergeLogEntries(pending.current, [entry]); setPendingCount(pending.current.length); }
        else setEntries((current) => mergeLogEntries(current, [entry]));
      } catch { /* Ignore malformed log messages. */ }
    };
    return () => { active = false; stream.close(); };
  }, []);
  const scopes = useMemo(() => [...new Set(entries.map((entry) => entry.scope))].sort(), [entries]);
  const visible = useMemo(() => { const needle = search.trim().toLowerCase(); return entries.filter((entry) => (!level || entry.level === level) && (!scope || entry.scope === scope) && (!needle || `${entry.scope} ${entry.message} ${JSON.stringify(entry.details ?? "")}`.toLowerCase().includes(needle))); }, [entries, level, scope, search]);
  useEffect(() => { if (autoScroll && !paused) end.current?.scrollIntoView({ block: "end" }); }, [visible.length, autoScroll, paused]);
  const togglePause = () => {
    if (pausedRef.current) { const queued = pending.current; pending.current = []; setPendingCount(0); setEntries((current) => mergeLogEntries(current, queued)); pausedRef.current = false; setPaused(false); }
    else { pausedRef.current = true; setPaused(true); }
  };
  const clearView = () => { setEntries([]); pending.current = []; setPendingCount(0); };
  return <section className="panel logs-panel">
    <div className="panel-head logs-heading"><div><p>REAL-TIME DIAGNOSTICS</p><h3>Server logs</h3></div><div><span className={`log-connection ${connected ? "connected" : ""}`}><i/>{connected ? "Live" : "Reconnecting"}</span><button className="secondary" onClick={togglePause}>{paused ? <Play size={15}/> : <Pause size={15}/>} {paused ? `Resume${pendingCount ? ` (${pendingCount} new)` : ""}` : "Pause"}</button><button className="text-button" onClick={clearView}><X size={14}/>Clear view</button></div></div>
    <div className="logs-toolbar"><label className="logs-search"><Search size={15}/><input aria-label="Search logs" placeholder="Search messages or details…" value={search} onChange={(event) => setSearch(event.target.value)}/></label><select aria-label="Filter logs by level" value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All levels</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select><select aria-label="Filter logs by scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="">All categories</option>{scopes.map((value) => <option key={value} value={value}>{value}</option>)}</select><label className="auto-scroll"><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)}/><ArrowDown size={13}/>Follow latest</label><span>{visible.length} / {entries.length}</span></div>
    {error && <div className="logs-error"><CircleAlert size={15}/>{error}</div>}
    <div className="log-console" role="log" aria-live={paused ? "off" : "polite"}>
      {loading && !entries.length ? <div className="logs-empty"><LoaderCircle className="spin"/>Loading logs…</div> : visible.length ? visible.map((entry) => <article className={`log-row ${entry.level}`} key={entry.id}><time dateTime={entry.timestamp}>{logTime(entry.timestamp)}</time><span className="log-level">{entry.level}</span><span className="log-scope">{entry.scope}</span><div><strong>{entry.message}</strong>{entry.details !== undefined && <details><summary>Details</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>}</div></article>) : <div className="logs-empty"><Terminal/>No logs match the current filters.</div>}
      <div ref={end}/>
    </div>
  </section>;
}
