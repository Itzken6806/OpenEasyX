export type DownloadTiming = {
  status: string;
  downloadStartedAt?: string;
  downloadFinishedAt?: string;
};

export function activitySourceDomains(sources: Array<{ domain: string }>): string[] {
  return [...new Set(sources.map((source) => source.domain.trim().toLowerCase()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function downloadTime(item: DownloadTiming, currentTime = Date.now()): string {
  if (!item.downloadStartedAt) return "—";
  const started = new Date(item.downloadStartedAt).getTime();
  const finished = item.downloadFinishedAt ? new Date(item.downloadFinishedAt).getTime() : undefined;
  const end = finished ?? (item.status === "downloading" ? currentTime : undefined);
  if (!Number.isFinite(started) || end === undefined || !Number.isFinite(end)) return "—";
  return formatElapsed(end - started);
}
