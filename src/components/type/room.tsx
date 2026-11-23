import type { CSSProperties, ReactNode } from "react";
import { TrackedSection } from "@/components/analytics/tracked-section";
import { fitWord } from "./word-fit";

export type Ground = "paper" | "alt";

/** The facade word: real text (the section's heading), sized on the server for both breakpoints. */
export function FacadeWord({
  word,
  as: Tag = "h2",
}: {
  word: string;
  as?: "h1" | "h2" | "p";
}) {
  const d = fitWord(word, "desktop");
  const m = fitWord(word, "phone");
  const style = {
    "--fd-w": d.vw,
    "--fd-h": d.vh,
    "--fd-s": `${d.stretch}%`,
    "--fm-w": m.vw,
    "--fm-h": m.vh,
    "--fm-s": `${m.stretch}%`,
  } as CSSProperties;
  return (
    <Tag
      className="ty-word"
      style={style}
      data-ty-word
      aria-hidden={Tag === "p" ? true : undefined}
    >
      {word}
    </Tag>
  );
}

/**
 * A facade: the word on its ground, the labels that drift along its roof line, and optional
 * text around it. `data-ty-labels` lists what the room behind it holds.
 */
export function Facade({
  word,
  as,
  ground,
  labels = [],
  children,
}: {
  word: string;
  as?: "h1" | "h2" | "p";
  ground: Ground;
  labels?: string[];
  children?: ReactNode;
}) {
  return (
    <div
      className="ty-facade"
      data-ground={ground}
      data-ty-facade
      data-ty-labels={JSON.stringify(labels)}
    >
      <canvas className="ty-cv" aria-hidden="true" />
      <div className="ty-ann" data-ty-ann>
        <FacadeWord word={word} as={as} />
        {children}
      </div>
    </div>
  );
}

/**
 * The room's running label: its number and name, set vertically in the left margin and stuck
 * there while the room scrolls, so it never sits on the content. Live, it shows once the flight has landed. Decorative: the facade word is the heading.
 */
export function RoomTag({ n, name }: { n: number; name: string }) {
  return (
    <div className="ty-tag" aria-hidden="true">
      <span>
        <b>{String(n).padStart(2, "0")}</b>
        {name}
      </span>
    </div>
  );
}

/**
 * The next room's word standing faint at the far end of this one, cut by the floor: the wall
 * the next flight goes through. Scenery only.
 */
export function FarWall({ word }: { word: string }) {
  // One line at every width: the width-limited desktop fit scales with the viewport.
  const d = fitWord(word, "desktop");
  const style = { "--fd-w": d.vw, "--fd-s": `${d.stretch}%` } as CSSProperties;
  return (
    <p className="ty-far" style={style} aria-hidden="true">
      {word}
    </p>
  );
}

/**
 * One room: a facade and the interior behind it. With motion, the stage sticks while the
 * camera flies through a counter of the word into the interior (`--fly` viewports of scroll);
 * without motion or JS the facade simply sits above the interior.
 */
export function Room({
  id,
  facade,
  interior,
  ground,
  rest,
  fly,
}: {
  /** Section id; the hero ("top") is not tracked, as in the other designs. */
  id: string;
  facade: ReactNode;
  interior: ReactNode;
  /** The interior's ground; the facade stands on the other one. */
  ground: Ground;
  /** Extra scroll after the flight lands, so the room rests on screen before the page moves on. */
  rest?: boolean;
  /** The flight's scroll length in viewports (desktop; phones take 80 %). */
  fly?: number;
}) {
  const style = fly ? ({ "--fly-d": fly } as CSSProperties) : undefined;
  const stage = (
    <div className="ty-stage" data-ground={ground}>
      {facade}
      {interior}
    </div>
  );
  return id === "top" ? (
    <section id={id} className="ty-fly" style={style} data-ty-room data-ty-hold data-ty-rest={rest ? "" : undefined}>
      {stage}
    </section>
  ) : (
    <TrackedSection id={id} className="ty-fly" style={style} data-ty-room data-ty-rest={rest ? "" : undefined}>
      {stage}
    </TrackedSection>
  );
}
