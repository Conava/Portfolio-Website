import { cookies } from "next/headers";
import { enabledDesigns, siteConfig } from "./site-config";
import { DESIGNS, isDesign, type Design } from "./design-values";

export { DESIGNS, DESIGN_LABELS, isDesign, type Design } from "./design-values";

export const DESIGN_COOKIE = "design";
/** Valid cookie > valid env > fallback. Invalid, empty or disabled values are ignored; a disabled fallback becomes the first enabled design. */
export function resolveDesign(input: {
  cookie?: string | null;
  env?: string | null;
  fallback: Design;
  enabled?: readonly Design[];
}): Design {
  const enabled = input.enabled ?? DESIGNS;
  const ok = (v: unknown): v is Design => isDesign(v) && enabled.includes(v);
  if (ok(input.cookie)) return input.cookie;
  if (ok(input.env)) return input.env;
  return ok(input.fallback) ? input.fallback : enabled[0];
}

let warned = false;

/** Server-only: reads the design cookie, `DESIGN` env and the site config default. */
export async function getDesign(): Promise<Design> {
  const env = process.env.DESIGN;
  if (env && !isDesign(env) && !warned) {
    warned = true;
    console.warn(`Ignoring invalid DESIGN="${env}" (expected ${DESIGNS.join(" | ")})`);
  }
  const cookie = (await cookies()).get(DESIGN_COOKIE)?.value;
  return resolveDesign({ cookie, env, fallback: siteConfig.design, enabled: enabledDesigns() });
}
