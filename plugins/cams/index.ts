import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.cams", name: "Cams.com Live", prefix: "cams", homepage: "https://cams.com",
  discovery: "cams",
  description: "Check a public Cams.com room and use any HTTP live stream exposed to the configured browser session.",
  sourceUrlPatterns: ["http://cams.com/*", "https://cams.com/*", "http://www.cams.com/*", "https://www.cams.com/*"],
  cookieDomains: ["cams.com"], loginUrl: "https://www.cams.com/", defaultIntervalSeconds: 15,
});
