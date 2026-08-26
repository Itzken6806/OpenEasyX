export const VIDEO_STALL_THRESHOLD_MS = 4_000;
export const VIDEO_STALL_RECOVERY_COOLDOWN_MS = 10_000;
export const VIDEO_STALL_MIN_ADVANCE_SECONDS = 1.25;
export const VIDEO_STALL_MAX_RECOVERIES = 3;
const HAVE_FUTURE_DATA = 3;

export type VideoStallState = {
  lastFrameAt: number;
  lastFrameMediaTime: number;
  lastRecoveryAt: number;
  consecutiveRecoveries: number;
};

export type VideoStallSample = {
  now: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  readyState: number;
  hidden: boolean;
};

export function videoStallState(now = 0, mediaTime = 0): VideoStallState {
  return { lastFrameAt: now, lastFrameMediaTime: mediaTime, lastRecoveryAt: Number.NEGATIVE_INFINITY, consecutiveRecoveries: 0 };
}

export function noteRenderedVideoFrame(state: VideoStallState, now: number, mediaTime: number) {
  state.lastFrameAt = now;
  state.lastFrameMediaTime = mediaTime;
  state.consecutiveRecoveries = 0;
}

export function shouldRecoverVideoStall(state: VideoStallState, sample: VideoStallSample) {
  if (sample.paused || sample.ended || sample.seeking || sample.hidden || sample.readyState < HAVE_FUTURE_DATA) return false;
  if (Number.isFinite(sample.duration) && sample.duration - sample.currentTime < 1) return false;
  if (state.consecutiveRecoveries >= VIDEO_STALL_MAX_RECOVERIES) return false;
  return sample.currentTime - state.lastFrameMediaTime >= VIDEO_STALL_MIN_ADVANCE_SECONDS
    && sample.now - state.lastFrameAt >= VIDEO_STALL_THRESHOLD_MS
    && sample.now - state.lastRecoveryAt >= VIDEO_STALL_RECOVERY_COOLDOWN_MS;
}

export function noteVideoStallRecovery(state: VideoStallState, now: number, mediaTime: number) {
  state.lastRecoveryAt = now;
  state.lastFrameAt = now;
  state.lastFrameMediaTime = mediaTime;
  state.consecutiveRecoveries += 1;
}

type FrameVideo = HTMLVideoElement & {
  webkitDecodedFrameCount?: number;
};

function decodedFrames(element: FrameVideo) {
  if (typeof element.getVideoPlaybackQuality === "function") return element.getVideoPlaybackQuality().totalVideoFrames;
  return typeof element.webkitDecodedFrameCount === "number" ? element.webkitDecodedFrameCount : undefined;
}

export function monitorVideoStalls(element: HTMLVideoElement) {
  let state = videoStallState(performance.now(), element.currentTime);
  let frameRequest: number | undefined;
  let recovering = false;
  let previousDecodedFrames = decodedFrames(element);
  const hasFrameCallback = typeof element.requestVideoFrameCallback === "function";
  const hasFrameCounter = previousDecodedFrames !== undefined;

  const frame = (now: number, metadata: VideoFrameCallbackMetadata) => {
    noteRenderedVideoFrame(state, now, metadata.mediaTime);
    frameRequest = element.requestVideoFrameCallback(frame);
  };
  if (hasFrameCallback) frameRequest = element.requestVideoFrameCallback(frame);

  const playbackBaseline = () => {
    state.lastFrameAt = performance.now();
    state.lastFrameMediaTime = element.currentTime;
  };
  element.addEventListener("loadeddata", playbackBaseline);
  element.addEventListener("seeked", playbackBaseline);

  const timer = window.setInterval(() => {
    if (!hasFrameCallback && hasFrameCounter) {
      const nextDecodedFrames = decodedFrames(element);
      if (nextDecodedFrames !== undefined && nextDecodedFrames > (previousDecodedFrames ?? 0)) {
        noteRenderedVideoFrame(state, performance.now(), element.currentTime);
      }
      previousDecodedFrames = nextDecodedFrames;
    }
    if ((!hasFrameCallback && !hasFrameCounter) || recovering) return;
    const now = performance.now();
    if (!shouldRecoverVideoStall(state, {
      now, currentTime: element.currentTime, duration: element.duration,
      paused: element.paused, ended: element.ended, seeking: element.seeking,
      readyState: element.readyState, hidden: document.hidden,
    })) return;

    recovering = true;
    const resumeAt = element.currentTime;
    noteVideoStallRecovery(state, now, resumeAt);
    element.pause();
    const maximum = Number.isFinite(element.duration) ? Math.max(0, element.duration - 0.1) : resumeAt + 0.04;
    element.currentTime = Math.min(maximum, resumeAt + 0.04);
    window.requestAnimationFrame(() => {
      void element.play().then(() => {
        console.info(`[Open EasyX] Recovered frozen video at ${resumeAt.toFixed(2)}s.`);
      }).catch(() => {}).finally(() => { recovering = false; });
    });
  }, 1_000);

  return () => {
    window.clearInterval(timer);
    element.removeEventListener("loadeddata", playbackBaseline);
    element.removeEventListener("seeked", playbackBaseline);
    if (frameRequest !== undefined && typeof element.cancelVideoFrameCallback === "function") element.cancelVideoFrameCallback(frameRequest);
  };
}
