import { getResumePdf } from "@/lib/resume";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { body, source } = await getResumePdf();
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Marlon-Kranz-Resume.pdf"',
        "Cache-Control": "public, max-age=3600",
        "X-Resume-Source": source,
      },
    });
  } catch {
    return new Response("Resume not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
}
