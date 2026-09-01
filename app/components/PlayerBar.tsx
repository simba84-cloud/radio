"use client";

import type { CSSProperties } from "react";
import { formatDuration } from "@/lib/radio";
import type { PlayerState } from "./use-hls-audio";
import { PauseIcon, PlayIcon, SpinnerIcon, VolumeIcon } from "./icons";

type PlayerBarProps = {
  state: PlayerState;
  elapsed: number;
  volume: number;
  muted: boolean;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
};

/** Dark 330x59 pill with white controls, per RadioCalicoLayout.png. */
export function PlayerBar({
  state,
  elapsed,
  volume,
  muted,
  onToggle,
  onVolumeChange,
  onToggleMute,
}: PlayerBarProps) {
  const isPlaying = state === "playing";
  const isLoading = state === "loading";

  return (
    <div className="flex w-full max-w-[330px] items-center gap-2 rounded-xl bg-graphite px-2 py-2 text-white">
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="audio-control focus-brand shrink-0"
      >
        {isLoading ? (
          <SpinnerIcon className="size-5 animate-spin" />
        ) : isPlaying ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </button>

      <p className="shrink-0 text-small tabular-nums">
        {formatDuration(elapsed)} <span className="text-white/70">/ Live</span>
      </p>

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="audio-control focus-brand ml-auto shrink-0"
      >
        <VolumeIcon className="size-5" muted={muted} />
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(event) => onVolumeChange(event.target.valueAsNumber)}
        aria-label="Volume"
        className="volume-slider min-w-12 flex-1"
        style={{ "--fill": muted ? 0 : volume } as CSSProperties}
      />
    </div>
  );
}
