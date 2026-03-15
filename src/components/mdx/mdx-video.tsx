"use client";

import { useRef, useState, useEffect, useCallback } from "react";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MdxVideo({ src, caption }: { src: string; caption?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-play when scrolled into view, pause when out
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const scrollRoot = document.getElementById("scroll-root");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { root: scrollRoot, threshold: 0.3 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // Sync state with video events + read duration if already loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => setDuration(video.duration);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("durationchange", onDuration);

    // Duration may already be available if cached
    if (video.duration) setDuration(video.duration);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("durationchange", onDuration);
    };
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 2000);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    resetHideTimer();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    resetHideTimer();
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <figure className="my-6">
      <div
        className="relative rounded-xl border border-[var(--color-border)] overflow-hidden group"
        onMouseMove={resetHideTimer}
        onMouseLeave={() => {
          if (playing) setShowControls(false);
        }}
      >
        <video
          ref={videoRef}
          src={src}
          loop
          muted
          playsInline
          preload="metadata"
          onClick={togglePlay}
          className="w-full block cursor-pointer"
        />

        {/* Controls overlay */}
        <div
          className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 transition-opacity duration-300"
          style={{
            opacity: showControls ? 1 : 0,
            background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
            pointerEvents: showControls ? "auto" : "none",
          }}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            onClick={seek}
            className="h-1 rounded-full cursor-pointer mb-2 bg-white/20"
          >
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Button row */}
          <div className="flex items-center gap-3 text-white text-sm">
            <button onClick={togglePlay} className="hover:text-[var(--color-accent)] transition-colors" aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <span className="font-mono text-xs tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>

      {caption && (
        <figcaption className="text-center text-sm text-[var(--color-text-muted)] mt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
