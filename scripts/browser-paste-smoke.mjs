const targets = await fetch("http://127.0.0.1:9222/json").then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
if (!target) throw new Error("Chromium page target is missing");
if (!/manyvids\.com/i.test(target.url ?? "")) throw new Error(`ManyVids did not open in Chromium: ${target.url}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP connection timed out")), 5_000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }, { once: true });
});
let nextId = 0;
function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 5_000);
    const listener = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timer); socket.removeEventListener("message", listener);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    };
    socket.addEventListener("message", listener);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await call("Runtime.evaluate", {
  expression: `(() => { const input = document.createElement("input"); input.id = "easyx-paste-smoke"; document.documentElement.appendChild(input); input.focus(); return document.activeElement === input; })()`,
  returnByValue: true,
});
const pasted = await fetch("http://127.0.0.1:3210/api/plugins/org.easyx.manyvids/browser-login/paste", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "easyx-mac-clipboard" }),
}).then(async (response) => ({ ok: response.ok, body: await response.json() }));
if (!pasted.ok || pasted.body.characters !== 19) throw new Error(`Paste bridge failed: ${JSON.stringify(pasted.body)}`);
const value = await call("Runtime.evaluate", { expression: "document.querySelector('#easyx-paste-smoke')?.value", returnByValue: true });
if (value.result?.value !== "easyx-mac-clipboard") throw new Error(`Unexpected pasted value: ${JSON.stringify(value)}`);
socket.close();
