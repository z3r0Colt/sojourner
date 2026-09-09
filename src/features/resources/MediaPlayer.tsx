import { forwardRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export const MediaPlayer = forwardRef<HTMLVideoElement | HTMLAudioElement, { filePath: string; kind: "video" | "audio" }>(
  ({ filePath, kind }, ref) => {
    const src = convertFileSrc(filePath);
    if (kind === "video") {
      return (
        <div className="flex h-full items-center justify-center bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={ref as React.Ref<HTMLVideoElement>} src={src} controls className="max-h-full max-w-full" />
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={ref as React.Ref<HTMLAudioElement>} src={src} controls className="w-full max-w-lg" />
      </div>
    );
  },
);
MediaPlayer.displayName = "MediaPlayer";
