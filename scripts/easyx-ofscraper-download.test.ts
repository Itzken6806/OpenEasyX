import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("easyx-ofscraper-download", () => {
  it("uses manual post mode and reports preparation plus byte progress", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-of-wrapper-")); temporaryDirectories.push(root);
    const bin = path.join(root, "bin"); fs.mkdirSync(bin);
    const fakeOfScraper = path.join(bin, "ofscraper");
    fs.writeFileSync(fakeOfScraper, `#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_ARGS,JSON.stringify(args));
const config=JSON.parse(fs.readFileSync(args[args.indexOf("--config")+1],"utf8"));
fs.mkdirSync(config.file_options.save_location,{recursive:true});
fs.writeFileSync(path.join(config.file_options.save_location,"partial"),"12345");
setTimeout(()=>fs.writeFileSync(process.env.FAKE_OUTPUT,"1234567890"),700);
`, { mode: 0o700 });
    const authFile = path.join(root, "auth.json");
    fs.writeFileSync(authFile, JSON.stringify({ sess: "sess", auth_id: "1", user_agent: "agent", "x-bc": "bc" }));
    const output = path.join(root, "media.jpg"); const argsFile = path.join(root, "args.json");
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/easyx-ofscraper-download.mjs"), authFile, "https://onlyfans.com/123/creator", "456", "10", output], {
      encoding: "utf8", timeout: 5_000,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, FAKE_ARGS: argsFile, FAKE_OUTPUT: output },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(argsFile, "utf8"))).toEqual(expect.arrayContaining(["manual", "--url", "https://onlyfans.com/123/creator", "--media-id", "456"]));
    expect(result.stderr).toContain("easyx-progress:1%");
    expect(result.stderr).toContain("easyx-progress:59.5%");
    expect(result.stderr).toContain("easyx-bytes:5:10");
    expect(fs.readFileSync(output, "utf8")).toBe("1234567890");
  });
});
