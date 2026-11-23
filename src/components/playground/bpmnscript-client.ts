// Browser-only (the language client has no server build). Load it through source-editor.tsx with
// next/dynamic and ssr: false; a second dynamic entry would download Monaco a second time.
import { useEffect } from "react";
import * as core from "@/generated/bpmnscript/editor/client";
import { ensureMonacoApi as ensureApi } from "@/generated/bpmnscript/editor/monaco";
import meta from "@/generated/bpmnscript/meta.json";

export type { BpmnscriptClient, LspStatus } from "@/generated/bpmnscript/editor/client";

const WORKER_URL = `/playground/bpmnscript/server-worker.js?v=${meta.commit}`;
const EDITOR_WORKER_URL = "/playground/editor.worker.js";

/** Starts Monaco's VS Code services once per page. */
export const ensureMonacoApi = () => ensureApi({ editorWorkerUrl: EDITOR_WORKER_URL });

/** The BPMNscript worker and the language client on it, at the playground's asset URLs. */
export const createBpmnscriptClient = () => core.createBpmnscriptClient({ workerUrl: WORKER_URL, editorWorkerUrl: EDITOR_WORKER_URL });

/** Creates a client on mount, hands it to `onClient` and disposes it on unmount. Renders nothing. */
export function BpmnscriptClientHost({ onClient }: { onClient: (client: core.BpmnscriptClient | null) => void }) {
  useEffect(() => {
    const client = createBpmnscriptClient();
    onClient(client);
    return () => {
      onClient(null);
      client.dispose();
    };
    // One client per mount; a new onClient identity is not re-announced.
  }, []);
  return null;
}
