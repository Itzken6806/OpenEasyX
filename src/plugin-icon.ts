type PluginIconManifest = { homepage?: string; sourceUrlPatterns?: string[] };

export function pluginFaviconUrl(manifest: PluginIconManifest): string | undefined {
  for (const candidate of [...(manifest.sourceUrlPatterns ?? []), manifest.homepage]) {
    if (!candidate) continue;
    const host = candidate.match(/^https?:\/\/([^/]+)/i)?.[1]?.replace(/^\*\./, "").replace(/^www\./, "").toLowerCase();
    if (!host || host.includes("*") || host === "github.com") continue;
    return `https://${host}/favicon.ico`;
  }
  return undefined;
}
