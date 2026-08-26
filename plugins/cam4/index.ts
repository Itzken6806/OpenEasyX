import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.cam4", name: "CAM4 Live", prefix: "cam4", homepage: "https://www.cam4.com",
  discovery: "cam4",
  description: "Check a public CAM4 room and play or record its active live stream with yt-dlp and FFmpeg.",
  sourceUrlPatterns: ["http://cam4.com/*", "https://cam4.com/*", "http://www.cam4.com/*", "https://www.cam4.com/*"],
  cookieDomains: ["cam4.com"], loginUrl: "https://www.cam4.com/login", minimumIntervalSeconds: 5, defaultIntervalSeconds: 10,
});
