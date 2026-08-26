import { createGalleryPlugin } from "../gallery-plugin-factory.js";

export default createGalleryPlugin({
  id: "org.easyx.fansly",
  name: "Fansly",
  platform: "fansly",
  description: "List and download Fansly creator media that your authenticated account is authorized to view. Purchases and subscriptions are never bypassed.",
  patterns: ["http://fansly.com/*", "https://fansly.com/*", "http://www.fansly.com/*", "https://www.fansly.com/*"],
  browserAuth: { loginUrl: "https://fansly.com/login", sessionSetting: "token", capture: "authorization-header", requestDomains: ["apiv3.fansly.com"] },
  settings: [
    { key: "token", label: "Fansly authorization token", type: "password", required: true, help: "Authorization token from your own signed-in Fansly session. EasyX cannot access locked media without the required subscription or purchase." },
  ],
});
