import type { Image as Img } from "@/lib/types";
import "./media.css";

/**
 * Logo with no plate. Three files per logo: full colour for light grounds, `<name>-dark.svg` for
 * dark grounds (keeps the brand colour where the brand allows), `<name>-white.svg` for coloured
 * grounds where red would vanish; media.css shows one by ground.
 * `md` sizes the box to the logo; `box` is a fixed box (media.css) the logo is fitted into,
 * so a row of them matches.
 */
export function LogoPlate({ image, size }: { image: Img; size: "md" | "box" }) {
  const dark = image.src.replace(/\.svg$/, "-dark.svg");
  const white = image.src.replace(/\.svg$/, "-white.svg");
  if (size === "box") {
    return (
      <span className="logo-plate" data-size="box">
        <img className="lp-light" src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" />
        <img className="lp-dark" src={dark} alt="" width={image.width} height={image.height} loading="lazy" decoding="async" />
        <img className="lp-white" src={white} alt="" width={image.width} height={image.height} loading="lazy" decoding="async" />
      </span>
    );
  }
  const mark = 40;
  const plate = 64;
  const width = Math.round((image.width / image.height) * mark);
  // Width leads and height follows the aspect ratio, so a narrow column scales both.
  const style = { width, height: "auto", aspectRatio: `${width} / ${mark}` };
  return (
    <span className="logo-plate" data-size={size} style={{ height: plate, paddingBlock: (plate - mark) / 2 }}>
      {/* SVGs need no optimizing; a plain img also avoids next/image's dev warning when a column clamps the width by a pixel. */}
      <img className="lp-light" src={image.src} alt={image.alt} width={width} height={mark} loading="lazy" decoding="async" style={style} />
      <img className="lp-dark" src={dark} alt="" width={width} height={mark} loading="lazy" decoding="async" style={style} />
      <img className="lp-white" src={white} alt="" width={width} height={mark} loading="lazy" decoding="async" style={style} />
    </span>
  );
}
