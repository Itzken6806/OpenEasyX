import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";

export default createLiveCamPlugin({
  id: "org.easyx.myfreecams", name: "MyFreeCams Live", prefix: "myfreecams", homepage: "https://www.myfreecams.com",
  discovery: "myfreecams",
  description: "Check a public MyFreeCams room and use any HTTP live stream exposed to the configured browser session.",
  sourceUrlPatterns: ["http://myfreecams.com/*", "https://myfreecams.com/*", "http://www.myfreecams.com/*", "https://www.myfreecams.com/*", "http://mfc.im/*", "https://mfc.im/*"],
  cookieDomains: ["myfreecams.com", "mfc.im"], loginUrl: "https://www.myfreecams.com/", defaultIntervalSeconds: 15,
});
