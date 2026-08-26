import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.livejasmin", name: "LiveJasmin Live", prefix: "livejasmin", homepage: "https://www.livejasmin.com",
  discovery: "livejasmin",
  description: "Check a public LiveJasmin room and use any HTTP live stream exposed to the configured browser session.",
  sourceUrlPatterns: ["http://livejasmin.com/*", "https://livejasmin.com/*", "http://www.livejasmin.com/*", "https://www.livejasmin.com/*"],
  cookieDomains: ["livejasmin.com"], loginUrl: "https://www.livejasmin.com/en/auth/login", defaultIntervalSeconds: 15,
});
