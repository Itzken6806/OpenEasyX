import { definePlugin, type EasyXPlugin, type PluginManifest, type SettingField } from "../packages/plugin-sdk/index.js";
import { galleryDownload, listGalleryMedia, normalizeProfileUrl, testGalleryDl, type GalleryPlatform } from "./gallery-dl-utils.js";
import { positiveInteger } from "./yt-dlp-utils.js";

export type GalleryPluginOptions = {
  id: string;
  name: string;
  platform: GalleryPlatform;
  description: string;
  patterns: string[];
  settings?: SettingField[];
  browserAuth?: PluginManifest["browserAuth"];
};

const maxItems: SettingField = { key: "maxItems", label: "Maximum media per scan", type: "number", default: 30, help: "A smaller first scan keeps manual scraping responsive. Increase this temporarily when importing older history." };

export function createGalleryPlugin(options: GalleryPluginOptions): EasyXPlugin {
  return definePlugin({
    manifest: {
      id: options.id,
      name: options.name,
      version: "1.0.0",
      author: "Open EasyX",
      homepage: "https://github.com/mikf/gallery-dl",
      description: options.description,
      capabilities: ["media-listing", "download-resolver"],
      sourceUrlPatterns: options.patterns,
      polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
      settings: [maxItems, ...(options.settings ?? [])],
      browserAuth: options.browserAuth,
    },
    async testConnection(context) { return testGalleryDl(context, options.name); },
    async listMedia(context, source) {
      const profileUrl = normalizeProfileUrl(source.profileUrl, options.platform);
      if (options.platform !== "facebook") return listGalleryMedia(context, profileUrl, options.platform);
      const requested = positiveInteger(context.config.maxItems, 30);
      const perSection = Math.ceil(requested / 2);
      const sectionContext = { ...context, config: { ...context.config, maxItems: perSection } };
      const urls = [profileUrl.replace(/\/photos\/?$/, "/photos"), profileUrl.replace(/\/photos\/?$/, "/videos")];
      const settled = await Promise.allSettled(urls.map((url) => listGalleryMedia(sectionContext, url, options.platform)));
      const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (!items.length) {
        const errors = settled.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []);
        throw new Error(errors.join("; ") || "Facebook returned no media");
      }
      return [...new Map(items.map((item) => [item.identityKey ?? item.externalId, item])).values()].slice(0, requested);
    },
    async resolveDownload(context, item) { return galleryDownload(item, context.config, options.platform); },
  });
}
