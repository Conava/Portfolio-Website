import { cookies } from "next/headers";
import { siteConfig } from "./site-config";
import { DESIGNS, isDesign, type Design } from "./design-values";

export { DESIGNS, DESIGN_LABELS, isDesign, type Design } from "./design-values";

export const DESIGN_COOKIE = "design";
/** Valid cookie > valid env > fallback. Invalid or empty values are ignored. */
export function resolveDesign(input: {
  cookie?: string | null;
  env?: string | null;
  fallback: Design;
}): Design {
  if (isDesign(input.cookie)) return input.cookie;
  if (isDesign(input.env)) return input.env;
  return input.fallback;
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
  return resolveDesign({ cookie, env, fallback: siteConfig.design });
}
