import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.stripchat", name: "Stripchat Live", prefix: "stripchat", homepage: "https://stripchat.com",
  discovery: "stripchat",
  description: "Check a public Stripchat room and play or record its active live stream with yt-dlp and FFmpeg.",
  sourceUrlPatterns: ["http://stripchat.com/*", "https://stripchat.com/*", "http://www.stripchat.com/*", "https://www.stripchat.com/*"],
  cookieDomains: ["stripchat.com"], loginUrl: "https://stripchat.com/login", minimumIntervalSeconds: 5, defaultIntervalSeconds: 10,
});
