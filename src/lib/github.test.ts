import { afterEach, describe, expect, mock, test } from "bun:test";

// unstable_cache needs Next's incremental cache; make it an identity wrapper.
const cacheCalls: { fn: (...a: unknown[]) => Promise<unknown>; key: string[]; opts: unknown }[] = [];
mock.module("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, key: string[], opts: unknown) => {
    cacheCalls.push({ fn, key, opts });
    return fn;
  },
}));

const { buildQuery, fetchGithubData, freshness, getGithubData, mapResponse, parsePrRef } =
  await import("./github");
type GithubRefs = import("./github").GithubRefs;

const refs: GithubRefs = {
  repos: ["duxlabs-dev/dux-shell", "Conava/dux-player", "conava/DUX-PLAYER"],
  prs: ["dux-shell#3727", "dux-shell#3768", "bogus"],
  org: "duxlabs-dev",
  author: "Conava",
};

const pr = (repo: string, number: number, state: string, createdAt: string, mergedAt: string | null = null) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/${repo}/pull/${number}`,
  state,
  createdAt,
  mergedAt,
  additions: 10,
  deletions: 2,
  reviews: { totalCount: 3 },
  repository: { nameWithOwner: repo },
});

const fixture = () => ({
  data: {
    r0: {
      nameWithOwner: "duxlabs-dev/dux-shell",
      url: "https://github.com/duxlabs-dev/dux-shell",
      stargazerCount: 8980,
      pushedAt: "2026-11-08T10:00:00Z",
      latestRelease: { tagName: "v1.2.0", publishedAt: "2026-10-01T00:00:00Z" },
      refs: { nodes: [{ name: "v1.2.0" }] },
    },
    r1: {
      nameWithOwner: "Conava/dux-player",
      url: "https://github.com/Conava/dux-player",
      stargazerCount: 12,
      pushedAt: "2026-11-01T00:00:00Z",
      latestRelease: null,
      refs: { nodes: [{ name: "v0.3.0" }] },
    },
    p0: { pullRequest: pr("duxlabs-dev/dux-shell", 3727, "OPEN", "2026-08-01T00:00:00Z") },
    p1: {
      pullRequest: pr("duxlabs-dev/dux-shell", 3768, "MERGED", "2026-09-01T00:00:00Z", "2026-10-31T00:00:00Z"),
    },
    merged: { issueCount: 66 },
    open: { issueCount: 8 },
    list: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        pr("duxlabs-dev/dux-plugins", 5, "MERGED", "2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z"),
        pr("duxlabs-dev/dux-shell", 3768, "MERGED", "2026-09-01T00:00:00Z", "2026-10-31T00:00:00Z"),
        pr("duxlabs-dev/docs", 9, "OPEN", "2026-10-01T00:00:00Z"),
        pr("duxlabs-dev/dux-shell", 3727, "OPEN", "2026-08-01T00:00:00Z"),
      ],
    },
  },
});

const now = new Date("2026-11-09T12:00:00Z");

describe("parsePrRef", () => {
  test("handles repo#n with the default owner and owner/repo#n explicitly", () => {
    expect(parsePrRef("dux-shell#3727", "duxlabs-dev")).toEqual({ owner: "duxlabs-dev", name: "dux-shell", number: 3727 });
    expect(parsePrRef("Conava/dux-player#12", "duxlabs-dev")).toEqual({ owner: "Conava", name: "dux-player", number: 12 });
    for (const bad of ["dux-shell", "#12", "a#b", "a/b/c#1", ""]) expect(parsePrRef(bad, "duxlabs-dev")).toBeNull();
  });
});

describe("buildQuery", () => {
  test("aliases are valid GraphQL names, one per unique repo and valid PR ref", () => {
    const q = buildQuery(refs);
    expect(q).toContain("query($cursor: String)");
    expect(q.match(/\br\d+: repository/g)).toHaveLength(2); // dux-player deduped case-insensitively
    expect(q.match(/\bp\d+: repository/g)).toHaveLength(2); // "bogus" ignored
    expect(q).toContain('"is:pr author:Conava org:duxlabs-dev is:merged"');
    expect(q).toContain('"is:pr author:Conava org:duxlabs-dev is:open"');
    expect(q).toContain("after: $cursor");
    expect(q).not.toMatch(/\b[\w]*-[\w-]*: /); // no alias with a dash
  });

  test("rejects an invalid author or org", () => {
    expect(() => buildQuery({ ...refs, author: "a b" })).toThrow("Invalid");
    expect(() => buildQuery({ ...refs, org: 'x" is:private' })).toThrow("Invalid");
  });
});

describe("mapResponse", () => {
  test("maps a recorded response", () => {
    const d = mapResponse(fixture(), refs, now);
    expect(d.fetchedAt).toBe(now.toISOString());
    expect(d.repos["duxlabs-dev/dux-shell"]).toEqual({
      nameWithOwner: "duxlabs-dev/dux-shell",
      url: "https://github.com/duxlabs-dev/dux-shell",
      stars: 8980,
      pushedAt: "2026-11-08T10:00:00Z",
      latestRelease: { tag: "v1.2.0", publishedAt: "2026-10-01T00:00:00Z" },
      latestTag: "v1.2.0",
    });
    expect(d.repos["conava/dux-player"].latestRelease).toBeNull();
    expect(d.repos["conava/dux-player"].latestTag).toBe("v0.3.0");
    expect(d.featured["dux-shell#3727"]).toMatchObject({ repo: "duxlabs-dev/dux-shell", state: "OPEN", mergedAt: null, reviews: 3 });
    expect(d.featured["dux-shell#3768"]).toMatchObject({ state: "MERGED", mergedAt: "2026-10-31T00:00:00Z", additions: 10, deletions: 2 });
    expect(Object.keys(d.featured)).toHaveLength(2);
    expect(d.org).toMatchObject({ org: "duxlabs-dev", author: "Conava", merged: 66, open: 8, repoCount: 2, truncated: false });
    expect(d.org!.prs.map((p) => p.number)).toEqual([9, 3768, 3727, 5]);
  });

  test("omits missing nodes instead of zeroing them", () => {
    const f = fixture();
    (f.data as Record<string, unknown>).r1 = null;
    (f.data as Record<string, unknown>).p0 = { pullRequest: null };
    (f.data as Record<string, unknown>).p1 = null;
    const d = mapResponse(f, refs, now);
    expect(Object.keys(d.repos)).toEqual(["duxlabs-dev/dux-shell"]);
    expect(d.featured).toEqual({});
  });
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("fetchGithubData", () => {
  test("throws on non-2xx, errors without data, and network failure", async () => {
    const cases: (() => Promise<Response>)[] = [
      async () => new Response("bad gateway", { status: 502 }),
      async () => ok({ errors: [{ message: "Bad credentials" }] }),
      async () => new Response("<html>", { status: 200 }),
      async () => Promise.reject(new TypeError("fetch failed")),
    ];
    for (const impl of cases) {
      await expect(fetchGithubData(refs, "t", { fetchImpl: impl as unknown as typeof fetch, endpoint: "http://x" })).rejects.toThrow();
    }
  });

  test("partial errors with data are not an error", async () => {
    const body = { ...fixture(), errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] };
    const d = await fetchGithubData(refs, "t", { fetchImpl: (async () => ok(body)) as unknown as typeof fetch });
    expect(d.org!.merged).toBe(66);
  });

  test("paginates the PR list at most 3 pages and flags truncation", async () => {
    const bodies: string[] = [];
    const impl = async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      expect((init.headers as Record<string, string>).Authorization).toBe("bearer t");
      const n = bodies.length;
      const node = pr("duxlabs-dev/dux-shell", n, "MERGED", `2026-0${n}-01T00:00:00Z`, `2026-0${n}-02T00:00:00Z`);
      const list = { pageInfo: { hasNextPage: true, endCursor: `c${n}` }, nodes: [node] };
      return ok(n === 1 ? { data: { ...fixture().data, list } } : { data: { list } });
    };
    const d = await fetchGithubData(refs, "t", { fetchImpl: impl as unknown as typeof fetch, endpoint: "http://x" });
    expect(bodies).toHaveLength(3);
    expect(JSON.parse(bodies[1]).variables).toEqual({ cursor: "c1" });
    expect(JSON.parse(bodies[2]).variables).toEqual({ cursor: "c2" });
    expect(d.org!.truncated).toBe(true);
    expect(d.org!.prs.map((p) => p.number)).toEqual([3, 2, 1]);
  });
});

describe("getGithubData", () => {
  const realFetch = globalThis.fetch;
  const realToken = process.env.GITHUB_TOKEN;
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = realToken;
  });

  test("without a token resolves null and never fetches", async () => {
    delete process.env.GITHUB_TOKEN;
    const spy = mock(realFetch);
    globalThis.fetch = spy as unknown as typeof fetch;
    expect(await getGithubData(refs)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("swallows errors and resolves null", async () => {
    process.env.GITHUB_TOKEN = "t";
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(await getGithubData(refs)).toBeNull();
    } finally {
      console.warn = warn;
    }
  });
});

describe("keep-last-good", () => {
  test("the cached function throws on failure and gets only refs, never the token", async () => {
    process.env.GITHUB_TOKEN = "secret-token";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const warn = console.warn;
    console.warn = () => {};
    try {
      cacheCalls.length = 0;
      expect(await getGithubData(refs)).toBeNull();
      const { fn, key, opts } = cacheCalls[0];
      expect(key).toEqual(["github-data"]);
      expect(opts).toEqual({ revalidate: 3600 });
      expect(fn.length).toBe(1);
      // Throwing (not resolving null) is what makes unstable_cache keep the stale entry.
      await expect(fn(refs)).rejects.toThrow("503");
    } finally {
      globalThis.fetch = realFetch;
      console.warn = warn;
      delete process.env.GITHUB_TOKEN;
    }
  });
});

describe("freshness", () => {
  test("boundaries", () => {
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
    expect(freshness(ago(5), now)).toBe("fresh");
    expect(freshness(ago(7), now)).toBe("stale");
    expect(freshness(ago(8 * 24), now)).toBe("expired");
  });
});
