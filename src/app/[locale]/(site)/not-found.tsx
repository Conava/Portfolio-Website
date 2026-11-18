import { FlowNotFound } from "@/components/flow/not-found";
import { InkNotFound } from "@/components/ink/not-found";
import { TypeNotFound } from "@/components/type/not-found";
import { TraceNotFound } from "@/components/trace/not-found";
import { getDesign } from "@/lib/design";

const NOT_FOUND = { keynote: InkNotFound, thread: TraceNotFound, flow: FlowNotFound, type: TypeNotFound };

export default async function NotFound() {
  const Page = NOT_FOUND[await getDesign()];
  return (
    <main id="main">
      <Page />
    </main>
  );
}
