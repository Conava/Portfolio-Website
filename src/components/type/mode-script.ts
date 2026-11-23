/**
 * Runs before the first paint (inline in the page): picks the Type layout so the flight
 * spacing is in place from the first frame. `live` = scroll flights, `static` = reduced motion.
 * Without JS the attribute is absent and the page is the plain stacked layout.
 */
export const TY_MODE_SCRIPT = `document.documentElement.dataset.tyMode=matchMedia("(prefers-reduced-motion: reduce)").matches?"static":"live"`;
