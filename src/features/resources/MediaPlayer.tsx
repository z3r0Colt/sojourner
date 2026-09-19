import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/Button";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** A recorded sermon or lecture, with the one control the browser's own
 * player lacks: the speed it is played at, remembered while the pane is
 * open. The media element is exposed to the sidebar so a passage link
 * can be stamped with the current time. */
export const MediaPlayer = forwardRef<HTMLVideoElement | HTMLAudioElement, { filePath: string; kind: "video" | "audio" }>(
  ({ filePath, kind }, ref) => {
    const src = convertFileSrc(filePath);
    const inner = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
    const [speed, setSpeed] = useState<number>(1);
    useImperativeHandle(ref, () => inner.current as HTMLVideoElement | HTMLAudioElement, []);
    useEffect(() => {
      if (inner.current) inner.current.playbackRate = speed;
    }, [speed, src]);

    const speeds = (
      <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
        <span className="mr-1 text-xs text-ink-3">Speed</span>
        {SPEEDS.map((s) => (
          <Button key={s} size="sm" variant="ghost" active={speed === s} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
            {s}×
          </Button>
        ))}
      </div>
    );

    if (kind === "video") {
      return (
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={(el) => void (inner.current = el)} src={src} controls className="max-h-full max-w-full" />
          </div>
          <div className="flex shrink-0 items-center justify-center border-t border-line bg-surface px-2 py-1.5">{speeds}</div>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={(el) => void (inner.current = el)} src={src} controls className="w-full max-w-lg" />
        {speeds}
        <p className="max-w-lg text-center text-xs text-ink-4">"Link to current passage" in the sidebar stamps the link with the time you are at, so a passage opens the recording where it is discussed.</p>
      </div>
    );
  },
);
MediaPlayer.displayName = "MediaPlayer";
