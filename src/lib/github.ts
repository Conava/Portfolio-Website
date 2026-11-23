/**
 * Live GitHub data (stars, releases, PR state, org PR totals) via one GraphQL query.
 *
 * Consumer contract: `GithubData | null`. `null` means "render titles and links from
 * content, no badge, no number, no sync line". Never substitute fake numbers.
 *
 * Everything except `getGithubData` is free of Next imports so Bun scripts can reuse it.
 */

export type PrState = "OPEN" | "MERGED" | "CLOSED";
export interface PullRequest {
  repo: string /* "owner/name" */;
  number: number;
  title: string;
  url: string;
  state: PrState;
  createdAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  reviews: number;
}
export interface RepoInfo {
  nameWithOwner: string;
  url: string;
  stars: number;
  pushedAt: string;
  latestRelease: { tag: string; publishedAt: string } | null;
  latestTag: string | null;
}
export interface OrgStats {
  org: string;
  author: string;
  merged: number;
  open: number;
  repoCount: number /* distinct repos with >= 1 merged PR in prs */;
  prs: PullRequest[] /* newest first */;
  truncated: boolean;
}
export interface GithubData {
  fetchedAt: string;
  repos: Record<string, RepoInfo> /* key "owner/name", lowercased */;
  featured: Record<string, PullRequest> /* key = ref exactly as given */;
  org: OrgStats | null;
}
export interface GithubRefs {
  repos: string[] /* "owner/name" */;
  prs: string[] /* "dux-shell#3727" or "owner/repo#3727" */;
  org: string;
  author: string;
}
export type Freshness = "fresh" | "stale" | "expired";

const MAX_LIST_PAGES = 3;
// GitHub computes additions/deletions per listed PR; ~75 PRs measured 2-6 s, so 5 s was too tight.
const DEADLINE_MS = 20_000; // shared by all pages of one fetch
const NAME = /^[A-Za-z0-9_.-]+$/;

/** `repo#n` (owner = defaultOwner) or `owner/repo#n`; anything else is `null`. */
export function parsePrRef(ref: string, defaultOwner: string): { owner: string; name: string; number: number } | null {
  const m = /^(?:([^/#\s]+)\/)?([^/#\s]+)#(\d+)$/.exec(ref);
  if (!m) return null;
  const owner = m[1] ?? defaultOwner;
  if (!NAME.test(owner) || !NAME.test(m[2])) return null;
  return { owner, name: m[2], number: Number(m[3]) };
}

function splitRepo(nameWithOwner: string): { owner: string; name: string } | null {
  const [owner, name, ...rest] = nameWithOwner.split("/");
  return owner && name && !rest.length && NAME.test(owner) && NAME.test(name) ? { owner, name } : null;
}

const uniqueRepos = (refs: GithubRefs) => [
  ...new Map(
    refs.repos.flatMap((r) => (splitRepo(r) ? [[r.toLowerCase(), splitRepo(r)!] as const] : [])),
  ).values(),
];
const validPrRefs = (refs: GithubRefs) =>
  refs.prs.flatMap((ref) => {
    const p = parsePrRef(ref, refs.org);
    return p ? [{ ref, ...p }] : [];
  });

const PR_FIELDS =
  "number title url state createdAt mergedAt additions deletions reviews { totalCount } repository { nameWithOwner }";
const searchTerms = (refs: GithubRefs) => `is:pr author:${refs.author} org:${refs.org}`;
const listField = (refs: GithubRefs) =>
  `list: search(type: ISSUE, query: ${JSON.stringify(`${searchTerms(refs)} sort:created-desc`)}, first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { ${PR_FIELDS} } } }`;

/** One GraphQL document for all repos, featured PRs, org totals and the first PR list page. */
export function buildQuery(refs: GithubRefs): string {
  if (!NAME.test(refs.author) || !NAME.test(refs.org)) throw new Error("Invalid GitHub author or org");
  const s = JSON.stringify;
  const repos = uniqueRepos(refs).map(
    (r, i) =>
      `r${i}: repository(owner: ${s(r.owner)}, name: ${s(r.name)}) { nameWithOwner url stargazerCount pushedAt latestRelease { tagName publishedAt } refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { nodes { name } } }`,
  );
  const prs = validPrRefs(refs).map(
    (p, i) => `p${i}: repository(owner: ${s(p.owner)}, name: ${s(p.name)}) { pullRequest(number: ${p.number}) { ${PR_FIELDS} } }`,
  );
  return [
    "query($cursor: String) {",
    ...repos,
    ...prs,
    `merged: search(type: ISSUE, query: ${s(`${searchTerms(refs)} is:merged`)}) { issueCount }`,
    `open: search(type: ISSUE, query: ${s(`${searchTerms(refs)} is:open`)}) { issueCount }`,
    listField(refs),
    "}",
  ].join("\n");
}

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped API JSON, checked field by field */
function mapPr(n: any): PullRequest | null {
  if (!n || typeof n.number !== "number" || !n.repository?.nameWithOwner) return null;
  return {
    repo: n.repository.nameWithOwner,
    number: n.number,
    title: n.title,
    url: n.url,
    state: n.state,
    createdAt: n.createdAt,
    mergedAt: n.mergedAt ?? null,
    additions: n.additions,
    deletions: n.deletions,
    reviews: n.reviews?.totalCount ?? 0,
  };
}

/** Pure mapping of a GraphQL response body (`{ data }`) to `GithubData`. Missing nodes are omitted. */
export function mapResponse(json: unknown, refs: GithubRefs, now: Date): GithubData {
  const data: any = (json as any)?.data ?? {};
  const repos: Record<string, RepoInfo> = {};
  uniqueRepos(refs).forEach((_, i) => {
    const r = data[`r${i}`];
    if (!r?.nameWithOwner) return;
    repos[r.nameWithOwner.toLowerCase()] = {
      nameWithOwner: r.nameWithOwner,
      url: r.url,
      stars: r.stargazerCount,
      pushedAt: r.pushedAt,
      latestRelease: r.latestRelease ? { tag: r.latestRelease.tagName, publishedAt: r.latestRelease.publishedAt } : null,
      latestTag: r.refs?.nodes?.[0]?.name ?? null,
    };
  });

  const featured: Record<string, PullRequest> = {};
  validPrRefs(refs).forEach(({ ref }, i) => {
    const p = mapPr(data[`p${i}`]?.pullRequest);
    if (p) featured[ref] = p;
  });

  let org: OrgStats | null = null;
  if (data.merged && data.open && data.list) {
    const prs = ((data.list.nodes ?? []) as any[])
      .map(mapPr)
      .filter((p): p is PullRequest => p !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    org = {
      org: refs.org,
      author: refs.author,
      merged: data.merged.issueCount,
      open: data.open.issueCount,
      repoCount: new Set(prs.filter((p) => p.state === "MERGED").map((p) => p.repo.toLowerCase())).size,
      prs,
      truncated: Boolean(data.list.pageInfo?.hasNextPage),
    };
  }
  return { fetchedAt: now.toISOString(), repos, featured, org };
}

async function post(query: string, variables: object, token: string, fetchImpl: typeof fetch, endpoint: string, signal: AbortSignal) {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new Error("GitHub GraphQL: malformed body");
  }
  if (!body || typeof body.data !== "object" || body.data === null) {
    const msg = Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.message).join("; ") : "no data";
    throw new Error(`GitHub GraphQL: ${msg}`);
  }
  return body;
}

/**
 * Fetches everything in one request plus up to 2 more PR list pages. Throws on network
 * errors, non-2xx, `errors` without `data`, or a malformed body (so a cache keeps the
 * last good entry). Partial errors alongside `data` are tolerated.
 */
export async function fetchGithubData(
  refs: GithubRefs,
  token: string,
  opts: { fetchImpl?: typeof fetch; endpoint?: string } = {},
): Promise<GithubData> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql";
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const body = await post(buildQuery(refs), { cursor: null }, token, fetchImpl, endpoint, signal);

  const list = body.data.list;
  if (list?.nodes) {
    const listQuery = `query($cursor: String) { ${listField(refs)} }`;
    for (let page = 1; page < MAX_LIST_PAGES && list.pageInfo?.hasNextPage; page++) {
      const next = (await post(listQuery, { cursor: list.pageInfo.endCursor }, token, fetchImpl, endpoint, signal)).data.list;
      if (!next?.nodes) throw new Error("GitHub GraphQL: malformed list page");
      list.nodes.push(...next.nodes);
      list.pageInfo = next.pageInfo;
    }
  }
  return mapResponse(body, refs, new Date());
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `fresh` <= 6 h, `stale` <= 7 days, else `expired` (hide counts and badges, keep titles). */
export function freshness(fetchedAt: string, now: Date): Freshness {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  if (age <= 6 * 3600_000) return "fresh";
  if (age <= 7 * 24 * 3600_000) return "stale";
  return "expired";
}

/**
 * Server-only. `null` without `GITHUB_TOKEN` or on any error; never throws.
 * The cached function throws on failure, so Next keeps serving the last good entry;
 * the token is read inside it so it never becomes part of the cache key.
 */
export async function getGithubData(refs: GithubRefs): Promise<GithubData | null> {
  if (!process.env.GITHUB_TOKEN) return null;
  const { unstable_cache } = await import("next/cache");
  const cached = unstable_cache((r: GithubRefs) => fetchGithubData(r, process.env.GITHUB_TOKEN ?? ""), ["github-data"], {
    revalidate: 3600,
  });
  try {
    return await cached(refs);
  } catch (err) {
    console.warn(`GitHub data unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
