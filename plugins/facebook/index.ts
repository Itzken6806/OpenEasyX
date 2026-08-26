import { createGalleryPlugin } from "../gallery-plugin-factory.js";

export default createGalleryPlugin({
  id: "org.easyx.facebook",
  name: "Facebook",
  platform: "facebook",
  description: "List and download media from public Facebook pages and profiles with gallery-dl. An optional account session can unlock content your own account may access.",
  patterns: ["http://facebook.com/*", "https://facebook.com/*", "http://www.facebook.com/*", "https://www.facebook.com/*", "http://m.facebook.com/*", "https://m.facebook.com/*"],
  browserAuth: { loginUrl: "https://www.facebook.com/login/", sessionSetting: "cookiesFile" },
  settings: [
    { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["facebook.com"], help: "Optional for public pages. Paste your own browser Cookie header or import a cookies.txt export; EasyX manages the file internally." },
  ],
});
