import { formatNumber, formatPercent } from "@/lib/format";
import { articleContext } from "./mdx-article";

function value(id: string): number {
  const n = articleContext().data.numbers?.find((x) => x.id === id);
  if (!n) throw new Error(`No number with id "${id}" in the article JSON`);
  return n.value;
}

/** A count from the article's `numbers`, formatted for the locale. */
export function Num({ id }: { id: string }) {
  return <span className="num">{formatNumber(value(id), articleContext().locale)}</span>;
}

/** `of` as a share of `in`, one decimal ("78.0%"). */
export function Pct(props: { of: string; in: string }) {
  const whole = value(props.in);
  if (whole === 0) throw new Error(`<Pct in="${props.in}"> is zero`);
  const pct = (value(props.of) / whole) * 100;
  return <span className="num">{formatPercent(pct, articleContext().locale)}</span>;
}
