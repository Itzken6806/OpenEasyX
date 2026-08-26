import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.camsoda", name: "CamSoda Live", prefix: "camsoda", homepage: "https://www.camsoda.com",
  discovery: "camsoda",
  description: "Check a public CamSoda room and play or record its active live stream with yt-dlp and FFmpeg.",
  sourceUrlPatterns: ["http://camsoda.com/*", "https://camsoda.com/*", "http://www.camsoda.com/*", "https://www.camsoda.com/*"],
  cookieDomains: ["camsoda.com"], loginUrl: "https://www.camsoda.com/login", minimumIntervalSeconds: 5, defaultIntervalSeconds: 10,
});
