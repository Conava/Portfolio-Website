import { encodeShare } from "@/generated/bpmnscript/editor/share";

export { decodeShare, encodeShare, type DecodeResult, type EncodeResult } from "@/generated/bpmnscript/editor/share";

/** A playground link that opens `source` as a file. */
export async function playgroundHref(source: string): Promise<string> {
  const r = await encodeShare(source);
  return r.ok ? `/playground#${r.hash}` : "/playground";
}
