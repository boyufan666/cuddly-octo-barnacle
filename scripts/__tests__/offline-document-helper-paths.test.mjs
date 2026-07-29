import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

for (const relativePath of [
  "tmp/docs/build_customer_usage_manual.py",
  "tmp/docs/build_customer_usage_manual_illustrated.py",
]) {
  test(`${relativePath} derives the repository root from its own location`, () => {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");

    assert.match(
      source,
      /^ROOT = Path\(__file__\)\.resolve\(\)\.parents\[2\]$/m,
    );
    assert.doesNotMatch(source, /Path\(["']\/Users\/thl\//);
    assert.doesNotMatch(source, /Path\.cwd\(\)|os\.getcwd\(\)|getcwd\(\)/);
  });
}
