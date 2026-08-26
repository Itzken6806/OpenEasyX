import fs from "node:fs";
import path from "node:path";
import type { DownloadItem, Performer } from "./database.js";
import { safeSegment } from "./utils.js";

export function performerDirectory(mediaRoot: string, performerName: string): string {
  return path.join(path.resolve(mediaRoot), safeSegment(performerName));
}

export function ensurePerformerDirectory(mediaRoot: string, performerName: string): string {
  const directory = performerDirectory(mediaRoot, performerName);
  fs.mkdirSync(directory, { recursive: true, mode: 0o775 });
  return directory;
}

export function renamePerformerDirectory(mediaRoot: string, previousName: string, nextName: string): string {
  const previous = performerDirectory(mediaRoot, previousName);
  const next = performerDirectory(mediaRoot, nextName);
  if (previous !== next && fs.existsSync(previous) && !fs.existsSync(next)) fs.renameSync(previous, next);
  else fs.mkdirSync(next, { recursive: true, mode: 0o775 });
  return next;
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function deletePerformerFiles(mediaRoot: string, performer: Performer, items: DownloadItem[]): number {
  const root = path.resolve(mediaRoot);
  const targets = new Set<string>([performerDirectory(root, performer.name)]);
  for (const item of items) {
    if (!item.storagePath) continue;
    const target = path.resolve(root, item.storagePath);
    if (inside(root, target)) targets.add(target);
  }
  let removed = 0;
  for (const target of [...targets].sort((a, b) => b.length - a.length)) {
    if (!inside(root, target) || !fs.existsSync(target)) continue;
    const stat = fs.lstatSync(target);
    removed += stat.isDirectory() ? countFiles(target) : 1;
    fs.rmSync(target, { recursive: stat.isDirectory(), force: true });
  }
  return removed;
}

function countFiles(directory: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    count += entry.isDirectory() ? countFiles(target) : 1;
  }
  return count;
}
