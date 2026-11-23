import { getTranslations } from "next-intl/server";
import type { DuxProject, Locale } from "@/lib/types";
import "./dux-relations.css";

/**
 * Ties a shared helper (a project with `usedBy`) to the projects that build on it, both ways:
 * on the helper "Used by A and B", on each user "Built for Dux Shell, uses helper." Links go to
 * the anchors on the same page. Renders nothing for a project without such a relation.
 */
export async function DuxRelations({ project, projects, locale }: { project: DuxProject; projects: DuxProject[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "projects" });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const link = (p: DuxProject) => <a href={`#${p.id}`}>{p.name}</a>;
  const list = (ids: string[]) => {
    const ps = ids.flatMap((id) => byId.get(id) ?? []);
    let i = 0;
    return new Intl.ListFormat(locale, { type: "conjunction" })
      .formatToParts(ps.map((p) => p.name))
      .map((part, k) => (part.type === "element" ? <span key={k}>{link(ps[i++])}</span> : part.value));
  };

  if (project.usedBy?.length) return <p className="dux-rel">{t.rich("usedBy", { list: () => list(project.usedBy!) })}</p>;
  const helper = projects.find((h) => h.usedBy?.includes(project.id));
  if (!helper) return null;
  return <p className="dux-rel">{t.rich("builtFor", { helper: helper.name, a: (c) => <a href="#dux">{c}</a>, h: (c) => <a href={`#${helper.id}`}>{c}</a> })}</p>;
}
