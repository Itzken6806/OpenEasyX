import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.xcams", name: "Xcams Live", prefix: "xcams", homepage: "https://www.xcams.com",
  discovery: "xcams",
  description: "Check a public Xcams room and use any HTTP live stream exposed to the configured browser session.",
  sourceUrlPatterns: ["http://xcams.com/*", "https://xcams.com/*", "http://www.xcams.com/*", "https://www.xcams.com/*"],
  cookieDomains: ["xcams.com"], loginUrl: "https://www.xcams.com/login", defaultIntervalSeconds: 15,
  sessionHelp: "Xcams may require a signed-in account session for live playback. Use the integrated browser to sign in; no environment variable is needed.",
  sessionRequiredForPlaybackMessage: "Xcams requires an account session in Settings for live playback in this region.",
});
