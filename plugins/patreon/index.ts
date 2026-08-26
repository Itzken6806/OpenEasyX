import { createGalleryPlugin } from "../gallery-plugin-factory.js";

export default createGalleryPlugin({
  id: "org.easyx.patreon",
  name: "Patreon",
  platform: "patreon",
  description: "List and download Patreon post media visible to your authenticated account. Membership restrictions are respected.",
  patterns: ["http://patreon.com/*", "https://patreon.com/*", "http://www.patreon.com/*", "https://www.patreon.com/*"],
  browserAuth: { loginUrl: "https://www.patreon.com/login", sessionSetting: "cookiesFile" },
  settings: [
    { key: "cookiesFile", label: "Account session", type: "session", required: true, cookieDomains: ["patreon.com"], help: "Paste the Cookie header from your own signed-in Patreon session or import a cookies.txt export. It must include session_id." },
  ],
});
