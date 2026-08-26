import React, { useEffect, useMemo, useRef, useState } from "react";
import type HlsInstance from "hls.js";
import { AlertTriangle, ArrowLeft, Eye, LoaderCircle, Maximize, Minimize, Pause, Play, Radio, RefreshCw, Search, Server, Users, Volume2, VolumeX } from "lucide-react";
import { api } from "./api";
import "./player.css";
import "./watch-page.css";
import "./live-player.css";

export type LiveCam = {
  id: string; username: string; title?: string; pageUrl: string; thumbnailUrl?: string; viewers?: number; age?: number; gender?: string; tags?: string[];
  providerId: string; providerName: string;
};
type Provider = { id: string; name: string; ok: boolean; count: number; pending?: boolean; error?: string };
type LiveCamResult = { available: boolean; reason?: string; items: LiveCam[]; total: number; page: number; pageSize: number; pages: number; providers: Provider[]; complete?: boolean };
export type LiveCamPreset = { query?: string; providerId?: string; gender?: "female" | "male" | "couple" | "trans" | ""; page?: number };

export function liveCamPresetFromSearch(search: string): LiveCamPreset {
  const params = new URLSearchParams(search); const gender = params.get("gender") ?? "";
  return {
    query: params.get("q") ?? "", providerId: params.get("source") ?? "",
    gender: (["female", "male", "couple", "trans"].includes(gender) ? gender : "") as LiveCamPreset["gender"],
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
  };
}

export function liveCamListUrl(preset: LiveCamPreset = {}) {
  const params = new URLSearchParams();
  if (preset.query) params.set("q", preset.query); if (preset.providerId) params.set("source", preset.providerId);
  if (preset.gender) params.set("gender", preset.gender); if ((preset.page ?? 1) > 1) params.set("page", String(preset.page));
  const query = params.toString(); return `/live-cam${query ? `?${query}` : ""}`;
}

export function liveCamUrl(cam: Pick<LiveCam, "providerId" | "id">) {
  return `/live-cam/${encodeURIComponent(cam.providerId)}/${encodeURIComponent(cam.id)}`;
}

export function LiveCamUnavailable({ reason }: { reason: string }) {
  return <div className="live-unavailable"><span><Server/></span><p>OPEN EASYX SOURCES</p><h2>No live-cam plugin is ready</h2><small>{reason}</small><code>Plugins → Sources &amp; live</code></div>;
}

export function LivePlayer({ cam, close }: { cam: LiveCam; close: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const player = useRef<HTMLDivElement>(null); const hideTimer = useRef<number | undefined>(undefined);
  const [streamUrl, setStreamUrl] = useState(""); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false); const [waiting, setWaiting] = useState(true); const [controls, setControls] = useState(true);
  const [volume, setVolume] = useState(1); const [muted, setMuted] = useState(true); const [fullscreen, setFullscreen] = useState(false);
  const reveal = () => {
    setControls(true); window.clearTimeout(hideTimer.current);
    if (!video.current?.paused) hideTimer.current = window.setTimeout(() => setControls(false), 2400);
  };
  const togglePlayback = () => {
    const element = video.current; if (!element) return;
    if (element.paused) void element.play().catch(() => setWaiting(false)); else element.pause();
  };
  const toggleMute = () => {
    const element = video.current; if (!element) return;
    element.muted = !element.muted; setMuted(element.muted);
  };
  const toggleFullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await player.current?.requestFullscreen(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (["INPUT", "SELECT", "BUTTON"].includes((event.target as HTMLElement).tagName)) return;
      if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); togglePlayback(); }
      else if (event.key.toLowerCase() === "m") toggleMute();
      else if (event.key.toLowerCase() === "f") void toggleFullscreen();
    };
    const onFullscreen = () => setFullscreen(document.fullscreenElement === player.current);
    window.addEventListener("keydown", onKey); document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); window.clearTimeout(hideTimer.current); };
  }, [close]);
  useEffect(() => {
    let active = true; setStreamUrl(""); setError(""); setWaiting(true);
    void api<{ streamUrl: string }>("/api/live-cams/stream", { method: "POST", body: JSON.stringify({ providerId: cam.providerId, cam }) })
      .then((result) => { if (active) setStreamUrl(result.streamUrl); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [cam, retry]);
  useEffect(() => {
    const element = video.current; if (!element || !streamUrl) return;
    let hls: HlsInstance | undefined; let active = true;
    const mediaError = () => {
      if (!active) return;
      const code = element.error?.code;
      setWaiting(false); setPlaying(false);
      setError(code ? `Safari could not play this live stream (media error ${code}).` : "The live stream could not be played.");
    };
    element.addEventListener("error", mediaError);
    const start = async () => {
      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = streamUrl; element.load();
        await element.play().catch((reason) => { if (reason instanceof DOMException && reason.name === "NotAllowedError") setWaiting(false); else throw reason; });
        return;
      }
      const { default: Hls } = await import("hls.js"); if (!active) return;
      if (!Hls.isSupported()) { setError("This browser cannot play HLS live streams."); return; }
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 }); hls.loadSource(streamUrl); hls.attachMedia(element);
      hls.on(Hls.Events.MANIFEST_PARSED, () => void element.play().catch(() => setWaiting(false)));
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setError("The live stream stopped or could not be decoded."); });
    };
    void start().catch(() => setError("The live player could not be initialized."));
    return () => { active = false; element.removeEventListener("error", mediaError); hls?.destroy(); element.pause(); element.removeAttribute("src"); element.load(); };
  }, [streamUrl]);
  return <div className="live-stage live-watch-stage">
    <div ref={player} className={`custom-player live-custom-player ${controls || !playing ? "controls-visible" : "controls-hidden"}`} tabIndex={0} onMouseMove={reveal} onTouchStart={reveal} onMouseLeave={() => playing && setControls(false)}>
      <div className="player-surface" onClick={togglePlayback} onDoubleClick={() => void toggleFullscreen()}><video ref={video} playsInline muted={muted} preload="auto"
        onPlay={() => { setPlaying(true); setWaiting(false); setError(""); reveal(); }} onPlaying={() => { setPlaying(true); setWaiting(false); setError(""); }} onPause={() => { setPlaying(false); setWaiting(false); }} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)}
        onVolumeChange={(event) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}/></div>
      {waiting && !error && <div className="player-buffering"><LoaderCircle className="spin"/></div>}
      {!playing && !waiting && !error && <button className="player-center-play" onClick={togglePlayback} aria-label="Play live stream"><Play fill="currentColor"/></button>}
      <div className="player-controls" onClick={(event) => event.stopPropagation()}><div className="player-control-row"><div className="player-controls-left">
        <button className="player-icon-button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button>
        <div className="player-volume"><button className="player-icon-button" onClick={toggleMute} aria-label={muted || volume === 0 ? "Unmute" : "Mute"}>{muted || volume === 0 ? <VolumeX/> : <Volume2/>}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => { const element = video.current; if (!element) return; element.volume = Number(event.target.value); element.muted = element.volume === 0; }}/></div>
        <span className="player-live-status"><Radio/><i/>ON AIR</span>
      </div><div className="player-controls-right"><button className="player-icon-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? <Minimize/> : <Maximize/>}</button></div></div></div>
    </div>
    {!streamUrl && !error && <div className="live-stage-status"><LoaderCircle className="spin"/><b>Opening live stream…</b><small>Open EasyX is resolving a fresh provider URL.</small></div>}
    {error && <div className="live-stage-status error"><AlertTriangle/><b>Live player unavailable</b><small>{error}</small><button className="quiet" onClick={() => setRetry((value) => value + 1)}><RefreshCw/>Try again</button></div>}
  </div>;
}

export function LiveCamViewer({ providerId, camId, close }: { providerId: string; camId: string; close: () => void }) {
  const [cam, setCam] = useState<LiveCam | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setCam(null); setError("");
    void api<LiveCam>(`/api/live-cams/${encodeURIComponent(providerId)}/${encodeURIComponent(camId)}`, { signal: controller.signal })
      .then(setCam).catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [providerId, camId]);
  useEffect(() => { if (cam) document.title = `${cam.username} live · Open EasyX`; }, [cam]);
  if (error) return <article className="watch-page"><div className="live-unavailable compact"><span><Radio/></span><h2>This cam is no longer live</h2><small>{error}</small><button className="quiet" onClick={close}><ArrowLeft/>Back to Live Cam</button></div></article>;
  if (!cam) return <article className="watch-page"><div className="loading"><LoaderCircle className="spin"/>Opening live cam…</div></article>;
  return <article className="watch-page live-watch-page">
    <section className="theater-stage"><LivePlayer cam={cam} close={close}/></section>
    <section className="watch-info">
      <div className="watch-heading"><div><span className="watch-eyebrow">LIVE · {cam.providerName}</span><h1>{cam.username}</h1><p>{cam.title && cam.title !== cam.username ? cam.title : "Public live broadcast"}</p></div><div className="watch-actions"><button className="quiet" onClick={close}><ArrowLeft/>Back to Live Cam</button></div></div>
      <div className="watch-meta"><span className="live-meta-on-air"><Radio/>ON AIR</span><span><Eye/>{Number(cam.viewers ?? 0).toLocaleString()} viewers</span><span><Radio/>{cam.providerName}</span>{cam.age ? <span>{cam.age} years old</span> : null}</div>
      {cam.tags?.length ? <div className="live-watch-tags">{cam.tags.slice(0, 12).map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
    </section>
  </article>;
}

export function LiveCamPage({ preset, route, open }: { preset: LiveCamPreset; route: (preset: LiveCamPreset) => void; open: (cam: LiveCam) => void }) {
  const [result, setResult] = useState<LiveCamResult | null>(null);
  const searchInput = useRef<HTMLInputElement>(null); const searchTimer = useRef<number | undefined>(undefined);
  const [search, setSearch] = useState(preset.query ?? ""); const [providerId, setProviderId] = useState(preset.providerId ?? "");
  const [gender, setGender] = useState<LiveCamPreset["gender"]>(preset.gender ?? ""); const [page, setPage] = useState(preset.page ?? 1);
  const [loading, setLoading] = useState(true); const [refresh, setRefresh] = useState(0);
  const params = useMemo(() => new URLSearchParams({ page: String(page), pageSize: "24", search, providerId, gender: gender ?? "" }), [page, search, providerId, gender]);
  useEffect(() => {
    const syncFromLocation = () => {
      const next = liveCamPresetFromSearch(window.location.search);
      if (searchInput.current) searchInput.current.value = next.query ?? "";
      setSearch(next.query ?? ""); setProviderId(next.providerId ?? ""); setGender(next.gender ?? ""); setPage(next.page ?? 1);
    };
    window.addEventListener("popstate", syncFromLocation); window.addEventListener("easyx:navigate", syncFromLocation);
    return () => { window.removeEventListener("popstate", syncFromLocation); window.removeEventListener("easyx:navigate", syncFromLocation); window.clearTimeout(searchTimer.current); };
  }, []);
  useEffect(() => { route({ query: search, providerId, gender, page }); }, [search, providerId, gender, page]);
  useEffect(() => {
    const controller = new AbortController(); let events: EventSource | undefined; let complete = false; const timer = window.setTimeout(() => {
      setLoading(true); setResult(null);
      const fallback = () => void api<LiveCamResult>(`/api/live-cams?${params}`, { signal: controller.signal }).then(setResult).catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setResult({ available: false, reason: reason instanceof Error ? reason.message : String(reason), items: [], total: 0, page, pageSize: 24, pages: 1, providers: [] });
      }).finally(() => setLoading(false));
      if (!("EventSource" in window)) { fallback(); return; }
      events = new EventSource(`/api/live-cams/events?${params}`);
      events.onmessage = (event) => {
        const next = JSON.parse(event.data) as Omit<LiveCamResult, "available">;
        setResult({ available: true, ...next });
        if (next.complete) { complete = true; setLoading(false); events?.close(); }
      };
      events.onerror = () => { events?.close(); if (!complete) fallback(); };
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); events?.close(); };
  }, [params, refresh]);
  useEffect(() => {
    if (loading) return;
    const timer = window.setInterval(() => { if (!document.hidden) setRefresh((value) => value + 1); }, 30_000);
    return () => window.clearInterval(timer);
  }, [loading]);
  const reset = (action: () => void) => { action(); setPage(1); };
  const providers = result?.providers ?? []; const allCount = providers.filter((provider) => provider.ok && !provider.pending).reduce((sum, provider) => sum + provider.count, 0);
  const loadedProviders = providers.filter((provider) => !provider.pending).length;
  return <section className="live-page">
    <div className="library-intro live-intro"><div><p>LIVE NOW</p><h2>Live Cam</h2><span>Public live rooms aggregated by your installed Open EasyX source plugins</span></div><button className="quiet" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw className={loading ? "spin" : ""}/>Refresh</button></div>
    {result?.available !== false && <div className="live-filters">
      <label><Search/><input ref={searchInput} defaultValue={search} onChange={(event) => { const value = event.currentTarget.value; window.clearTimeout(searchTimer.current); searchTimer.current = window.setTimeout(() => { setSearch(value); setPage(1); }, 300); }} placeholder="Search live cams or tags…"/></label>
      <label><Radio/><select aria-label="Filter live provider" value={providerId} onChange={(event) => reset(() => setProviderId(event.target.value))}><option value="">All live sources ({allCount.toLocaleString()}{loading ? "+" : ""})</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.pending ? "loading…" : provider.count.toLocaleString()})</option>)}</select></label>
      <div className="live-genders"><button className={!gender ? "active" : ""} onClick={() => reset(() => setGender(""))}>All</button>{[["female", "Women"], ["male", "Men"], ["couple", "Couples"], ["trans", "Trans"]].map(([value, label]) => <button key={value} className={gender === value ? "active" : ""} onClick={() => reset(() => setGender(value as LiveCamPreset["gender"]))}>{label}</button>)}</div>
    </div>}
    {loading && !result ? <div className="loading"><LoaderCircle className="spin"/>Loading live cams…</div>
      : result?.available === false ? <LiveCamUnavailable reason={result.reason ?? "No live-cam provider is available in Open EasyX."}/>
      : result && !result.providers.length ? <div className="live-unavailable compact"><span><Radio/></span><h2>No live-cam plugin installed</h2><small>Install a live provider such as Chaturbate Live from Plugins. It will appear here automatically.</small></div>
      : result?.items.length ? <>
        <div className="live-summary"><b>{result.total.toLocaleString()}{loading ? "+" : ""} {result.total === 1 ? "live cam" : "live cams"}</b><span>{loading ? `Loading sources ${loadedProviders}/${result.providers.length}` : `${result.providers.filter((provider) => provider.ok && provider.count > 0).length} active sources`}</span></div>
        <div className="live-grid">{result.items.map((cam) => <a className="live-card" key={`${cam.providerId}:${cam.id}`} href={liveCamUrl(cam)} onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); open(cam); }}>
          <span className="live-thumb">{cam.thumbnailUrl ? <img src={cam.thumbnailUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }}/> : <Users/>}<i>LIVE</i><em><Eye/>{Number(cam.viewers ?? 0).toLocaleString()}</em><strong>{cam.providerName}</strong><span><Play/></span></span>
          <span className="live-copy"><b>{cam.username}</b>{cam.age ? <i>{cam.age}</i> : null}<small>{cam.title && cam.title !== cam.username ? cam.title : (cam.tags?.slice(0, 3).map((tag) => `#${tag}`).join(" ") || "Public live broadcast")}</small></span>
        </a>)}</div>
        {result.pages > 1 && <div className="pagination"><button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {result.pages}</span><button disabled={page >= result.pages || loading} onClick={() => setPage(page + 1)}>Next</button></div>}
      </> : loading && result ? <div className="loading"><LoaderCircle className="spin"/>Loading sources {loadedProviders}/{result.providers.length}… {result.total.toLocaleString()} live cams found</div>
      : <div className="live-unavailable compact"><span><Radio/></span><h2>No public cams are live</h2><small>Try another source or filter. Installed providers are refreshed every 30 seconds.</small>{result?.providers.filter((provider) => !provider.ok).map((provider) => <p key={provider.id}>{provider.name}: {provider.error}</p>)}</div>}
  </section>;
}
