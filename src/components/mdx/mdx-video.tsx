"use client";

import { useEffect, useRef } from "react";

/**
 * Muted looping clip with native controls. Plays while at least 30 % visible and pauses
 * outside the viewport; with reduced motion it never starts on its own.
 */
export function MdxVideo({ src, caption }: { src: string; caption?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? video.play().catch(() => {}) : video.pause()),
      { threshold: 0.3 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <figure className="pj-fig">
      {/* ponytail: box reserved at the one clip's ratio (1920x1072); pass width/height props if a clip differs */}
      <video ref={ref} src={src} controls loop muted playsInline preload="metadata" style={{ aspectRatio: "1920 / 1072" }} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
