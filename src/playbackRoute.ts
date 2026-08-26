import type { PlaybackContext } from "./Player";

export type EasyXLocationState = {
  easyx?: {
    from?: string;
    context?: PlaybackContext;
    autoStart?: boolean;
  };
};

export function playbackLocationState(from: string, context: PlaybackContext, autoStart = false): EasyXLocationState {
  return { easyx: { from, context, autoStart } };
}

export function playbackAutoStart(state: EasyXLocationState | null) {
  return state?.easyx?.autoStart === true;
}
