import type { VoiceId } from '../domain/models';
import type { ReadAloudState } from '../domain/read-aloud';

/**
 * Drops the current sentence and everything ahead of it. Already-played sentences stay
 * so a voice or speed change can start again from here without losing place.
 */
export function dropBufferedFrom(delivered: Iterable<number>, index: number): Set<number> {
  return new Set([...delivered].filter((item) => item < index));
}

/** Bumps take and seek so in-flight audio and the player both throw away the old voice. */
export function retakeFromCurrent(
  state: ReadAloudState,
  voiceId: VoiceId,
  speed: number,
): ReadAloudState {
  const { index } = state;
  return {
    ...state,
    take: state.take + 1,
    seek: state.seek + 1,
    voiceId,
    speed,
    waiting: true,
    durations: state.durations.map((ms, i) => (i < index ? ms : 0)),
  };
}
