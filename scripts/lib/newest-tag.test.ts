import { expect, test } from "bun:test";
import { newestTag } from "./newest-tag";

test("picks the highest semver tag, ignoring pre-releases and other refs", () => {
  const out = ["a\trefs/tags/v0.1.0", "b\trefs/tags/v0.10.0", "c\trefs/tags/v0.9.3", "d\trefs/tags/v1.0.0-rc.1", "e\trefs/tags/latest"].join("\n");
  expect(newestTag(out)).toBe("v0.10.0");
  expect(newestTag("")).toBeNull();
});
