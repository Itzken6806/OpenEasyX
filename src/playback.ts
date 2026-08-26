export const PHOTO_AUTOPLAY_SECONDS = 10;

export function initialAutoplay(kind: "video" | "image", autoStart: boolean, stored: string | null) {
  if (kind === "image" && !autoStart) return false;
  return stored !== "false";
}

export function autoplayOnOpen(kind: "video" | "image", stored: string | null) {
  return kind === "video" && stored !== "false";
}

export function nextMediaId(ids: string[], currentId: string) {
  return ids[ids.indexOf(currentId) + 1];
}
