import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type PluginRepository = {
  id: string;
  name: string;
  url: string;
  official: boolean;
  removable: boolean;
  addedAt: string;
  updatedAt: string;
  pluginCount?: number;
};

type StoredRepository = Omit<PluginRepository, "official" | "removable" | "pluginCount">;

const OFFICIAL: PluginRepository = {
  id: "official",
  name: "OpenEasyX Official",
  url: process.env.OPEN_EASYX_OFFICIAL_REPOSITORY?.trim() || "https://github.com/raccommode/OpenEasyX",
  official: true,
  removable: false,
  addedAt: "built-in",
  updatedAt: "built-in",
};

function repositoryName(url: string) {
  return url.replace(/\/$/, "").split(/[/:]/).at(-1)?.replace(/\.git$/i, "") || "Plugin repository";
}
function validateGitUrl(raw: string) {
  const value = raw.trim();
  if (!value || value.length > 2048 || /[\0\r\n]/.test(value)) throw Object.assign(new Error("Enter a valid Git repository URL"), { statusCode: 400 });
  if (/^[\w.-]+@[\w.-]+:[\w./-]+(?:\.git)?$/i.test(value)) return value;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw Object.assign(new Error("Use an HTTPS, HTTP, SSH, or Git repository URL"), { statusCode: 400 }); }
  if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol) || !parsed.hostname) throw Object.assign(new Error("Use an HTTPS, HTTP, SSH, or Git repository URL"), { statusCode: 400 });
  if ((parsed.protocol === "https:" || parsed.protocol === "http:") && (parsed.username || parsed.password)) throw Object.assign(new Error("Repository URLs cannot contain credentials"), { statusCode: 400 });
  return value;
}

function pluginRoots(checkout: string) {
  const roots = [checkout, path.join(checkout, "plugins")].filter((candidate) => fs.existsSync(candidate));
  return roots.filter((root) => fs.readdirSync(root, { withFileTypes: true }).some((entry) => entry.isDirectory()
    && ["index.ts", "index.mjs", "index.js"].some((name) => fs.existsSync(path.join(root, entry.name, name)))));
}

export class PluginRepositoryManager {
  private readonly configFile: string;
  private readonly checkoutRoot: string;

  constructor(private readonly dataDir: string, private readonly officialRoot: string, private readonly legacyRoot?: string) {
    this.configFile = path.join(dataDir, "plugin-repositories.json");
    this.checkoutRoot = path.join(dataDir, "plugin-repositories");
    fs.mkdirSync(this.checkoutRoot, { recursive: true, mode: 0o700 });
  }

  private stored(): StoredRepository[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configFile, "utf8"));
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.id === "string" && typeof entry.url === "string") : [];
    } catch { return []; }
  }

  private save(repositories: StoredRepository[]) {
    const temporary = `${this.configFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(repositories, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.configFile);
    fs.chmodSync(this.configFile, 0o600);
  }

  private checkout(id: string) { return path.join(this.checkoutRoot, id); }

  roots() {
    const dynamic = this.stored().flatMap((entry) => pluginRoots(this.checkout(entry.id)));
    return [this.officialRoot, ...(this.legacyRoot ? [this.legacyRoot] : []), ...dynamic];
  }

  list(): PluginRepository[] {
    const count = (roots: string[]) => roots.reduce((total, root) => total + (fs.existsSync(root)
      ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && ["index.ts", "index.mjs", "index.js"].some((name) => fs.existsSync(path.join(root, entry.name, name)))).length
      : 0), 0);
    return [
      { ...OFFICIAL, pluginCount: count([this.officialRoot]) },
      ...this.stored().map((entry) => ({ ...entry, official: false, removable: true, pluginCount: count(pluginRoots(this.checkout(entry.id))) })),
    ];
  }

  async add(rawUrl: string, rawName?: string) {
    const url = validateGitUrl(rawUrl);
    if (this.stored().some((entry) => entry.url.toLowerCase() === url.toLowerCase())) throw Object.assign(new Error("This plugin repository is already installed"), { statusCode: 409 });
    await exec("git", ["ls-remote", "--exit-code", url, "HEAD"], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    const id = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
    const checkout = this.checkout(id);
    fs.rmSync(checkout, { recursive: true, force: true });
    try {
      await exec("git", ["clone", "--depth", "1", "--no-tags", "--", url, checkout], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      const roots = pluginRoots(checkout);
      if (!roots.length) throw new Error("No OpenEasyX plugins were found. Put plugins in the repository root or in a plugins/ directory.");
      const stamp = new Date().toISOString();
      const entry: StoredRepository = { id, name: rawName?.trim().slice(0, 120) || repositoryName(url), url, addedAt: stamp, updatedAt: stamp };
      this.save([...this.stored(), entry]);
      return this.list().find((repository) => repository.id === id)!;
    } catch (error) {
      fs.rmSync(checkout, { recursive: true, force: true });
      throw error;
    }
  }

  async refresh(id: string) {
    const repositories = this.stored();
    const index = repositories.findIndex((entry) => entry.id === id);
    if (index < 0) throw Object.assign(new Error("Plugin repository not found"), { statusCode: 404 });
    const checkout = this.checkout(id);
    await exec("git", ["-C", checkout, "fetch", "--depth", "1", "origin"], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    await exec("git", ["-C", checkout, "reset", "--hard", "FETCH_HEAD"], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    if (!pluginRoots(checkout).length) throw new Error("The updated repository no longer contains OpenEasyX plugins");
    repositories[index] = { ...repositories[index], updatedAt: new Date().toISOString() };
    this.save(repositories);
    return this.list().find((repository) => repository.id === id)!;
  }

  remove(id: string) {
    const repositories = this.stored();
    if (!repositories.some((entry) => entry.id === id)) throw Object.assign(new Error("Plugin repository not found"), { statusCode: 404 });
    this.save(repositories.filter((entry) => entry.id !== id));
    fs.rmSync(this.checkout(id), { recursive: true, force: true });
    return { removed: true, id };
  }
}
