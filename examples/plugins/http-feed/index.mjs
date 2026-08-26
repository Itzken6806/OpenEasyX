// Inert development example. Adapt this only for a feed you are authorized to access.
export default {
  manifest: {
    id: "com.example.authorized-feed",
    name: "Authorized JSON feed example",
    version: "0.1.0",
    description: "Demonstrates the Open EasyX media listing and resolver contracts.",
    author: "Open EasyX",
    capabilities: ["source-discovery", "media-listing", "download-resolver"],
    settings: [
      { key: "feedUrl", label: "Feed URL", type: "text", required: true },
      { key: "token", label: "Bearer token", type: "password" }
    ]
  },
  async testConnection({ config, fetch }) {
    const response = await fetch(config.feedUrl, { method: "HEAD" });
    return { ok: response.ok, message: `Feed returned HTTP ${response.status}` };
  },
  async discoverSources(_context, performer) {
    return [{ externalId: performer.id, label: "Authorized feed", profileUrl: "https://feed.example.invalid", domain: "feed.example.invalid" }];
  },
  async listMedia({ config, fetch }, source) {
    const response = await fetch(`${config.feedUrl}?person=${encodeURIComponent(source.externalId)}`, {
      headers: config.token ? { authorization: `Bearer ${config.token}` } : {}
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    return response.json();
  },
  async resolveDownload({ config }, item) {
    return { url: item.metadata.downloadUrl, filename: item.filename, headers: config.token ? { authorization: `Bearer ${config.token}` } : {} };
  }
};
