"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import type { Image as Img } from "@/lib/types";
import "./media.css";

// locale is accepted for the call-site contract; strings come from the next-intl provider.
export function Gallery({ images, label }: { images: Img[]; label: string; locale: string }) {
  const t = useTranslations("gallery");
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [ends, setEnds] = useState({ start: true, end: false });
  // The buttons need JS; until hydration they keep their space but stay hidden.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const update = () => {
    const el = row.current;
    if (el) setEnds({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(update, [images]);

  const step = (dir: 1 | -1) => {
    const el = row.current;
    const fig = el?.querySelector("figure");
    if (el && fig) el.scrollBy({ left: dir * (fig.getBoundingClientRect().width + 16) });
  };
  // Capture starts only once the pointer has moved: a plain click on a credit link still lands.
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return; // touch scrolls natively
    drag.current = { x: e.clientX, left: row.current!.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!(e.buttons & 1)) return onUp(); // released outside the row before any capture
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x) <= 3) return;
      d.moved = true;
      row.current!.dataset.dragging = "";
      // The drag keeps going when the pointer leaves the row, until the button is released.
      row.current!.setPointerCapture(e.pointerId);
    }
    row.current!.scrollLeft = d.left - (e.clientX - d.x);
  };
  // Also runs on lostpointercapture, after pointerup: only the first call records the drag.
  function onUp() {
    if (drag.current) dragged.current = drag.current.moved;
    drag.current = null;
    if (row.current) delete row.current.dataset.dragging;
  }
  // A drag that ends over a link is not a click on it.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (dragged.current) e.preventDefault();
    dragged.current = false;
  };

  return (
    <section aria-label={label} className="gallery">
      <div
        ref={row}
        className="gal-row"
        tabIndex={0}
        onScroll={update}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        onClickCapture={onClick}
      >
        {images.map((img) => (
          <figure key={img.src} className="gal-item">
            <Image
              src={img.src}
              alt={img.alt}
              width={img.width}
              height={img.height}
              // Row height is min(360px, 48vw) (media.css), so the displayed width follows the aspect ratio.
              sizes={`min(${Math.round((360 * img.width) / img.height)}px, ${Math.round((48 * img.width) / img.height)}vw, 100vw)`}
              loading="lazy"
              draggable={false}
            />
            {(img.caption || img.credit) && (
              <figcaption>
                {img.caption}
                {img.credit && (
                  <>
                    {img.caption ? " " : ""}
                    <a href={img.credit.href}>{img.credit.label}</a>
                  </>
                )}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      <div className="gal-nav" data-ready={ready ? "" : undefined}>
        <button type="button" aria-label={t("previous")} disabled={ends.start} onClick={() => step(-1)}>
          <ArrowLeftIcon />
        </button>
        <button type="button" aria-label={t("next")} disabled={ends.end} onClick={() => step(1)}>
          <ArrowRightIcon />
        </button>
      </div>
    </section>
  );
}
