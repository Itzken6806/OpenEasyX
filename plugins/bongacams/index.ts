import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.bongacams", name: "BongaCams Live", prefix: "bongacams", homepage: "https://bongacams.com",
  discovery: "bongacams",
  description: "Check a public BongaCams room and play or record its active live stream with yt-dlp and FFmpeg.",
  sourceUrlPatterns: ["http://bongacams.com/*", "https://bongacams.com/*", "http://www.bongacams.com/*", "https://www.bongacams.com/*", "http://*.bongacams.com/*", "https://*.bongacams.com/*", "http://*.bongacams.net/*", "https://*.bongacams.net/*"],
  cookieDomains: ["bongacams.com", "bongacams.net"], loginUrl: "https://bongacams.com/login", minimumIntervalSeconds: 5, defaultIntervalSeconds: 10,
});
