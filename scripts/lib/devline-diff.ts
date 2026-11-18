/** What the /devline article lists, and what a devline checkout contains, in the same shape. */
export interface DevlineInventory {
  agents: { id: string; model?: string }[];
  skills: string[];
  hooks: { id: string; event: string }[];
}

/** Each entry reads like "agent tester" or "agent planner: model opus -> sonnet". */
export interface DevlineDrift {
  /** in the repo, not in the article */
  missing: string[];
  /** in the article, gone from the repo */
  gone: string[];
  /** in both, with a different agent model or hook event */
  changed: string[];
}

type Item = { id: string; value?: string };

function compare(kind: string, field: string, repo: Item[], article: Item[], drift: DevlineDrift) {
  const inArticle = new Map(article.map((a) => [a.id, a.value]));
  const inRepo = new Set(repo.map((r) => r.id));
  for (const r of repo) {
    if (!inArticle.has(r.id)) drift.missing.push(`${kind} ${r.id}`);
    else {
      const was = inArticle.get(r.id);
      // Models are written "Opus" in the article and "opus" in agent frontmatter.
      if ((was ?? "").toLowerCase() !== (r.value ?? "").toLowerCase()) {
        drift.changed.push(`${kind} ${r.id}: ${field} ${was ?? "none"} -> ${r.value ?? "none"}`);
      }
    }
  }
  for (const a of article) if (!inRepo.has(a.id)) drift.gone.push(`${kind} ${a.id}`);
}

/** Compares a devline checkout (`repo`) with the article data (`article`). */
export function devlineDiff(repo: DevlineInventory, article: DevlineInventory): DevlineDrift {
  const drift: DevlineDrift = { missing: [], gone: [], changed: [] };
  const agents = (x: DevlineInventory) => x.agents.map((a) => ({ id: a.id, value: a.model }));
  const hooks = (x: DevlineInventory) => x.hooks.map((h) => ({ id: h.id, value: h.event }));
  const skills = (x: DevlineInventory) => x.skills.map((id) => ({ id }));
  compare("agent", "model", agents(repo), agents(article), drift);
  compare("skill", "", skills(repo), skills(article), drift);
  compare("hook", "event", hooks(repo), hooks(article), drift);
  return drift;
}

export const hasDrift = (d: DevlineDrift) => d.missing.length + d.gone.length + d.changed.length > 0;
