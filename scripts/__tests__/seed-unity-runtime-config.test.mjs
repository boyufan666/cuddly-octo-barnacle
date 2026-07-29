import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("local seed Unity training content points to the formal Rhythm Reach WebGL build", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(
      join(
        rootDir,
        "apps/web/public/unity/rhythm_reach_3d/0.1.2/manifest.json",
      ),
      "utf8",
    ),
  );
  const buildBaseUrl = "/unity/rhythm_reach_3d/0.1.2";
  const manifestUrl = `${buildBaseUrl}/manifest.json`;

  assert.match(
    seedSource,
    new RegExp(`where:\\s*\\{ code: "${escapeRegExp(manifest.gameCode)}" \\}`),
  );
  assert.match(seedSource, new RegExp(`code: "${escapeRegExp(manifest.gameCode)}"`));
  assert.match(
    seedSource,
    new RegExp(`manifestUrl: "${escapeRegExp(manifestUrl)}"`),
  );
  assert.match(
    seedSource,
    new RegExp(`buildBaseUrl: "${escapeRegExp(buildBaseUrl)}"`),
  );
  assert.match(
    seedSource,
    new RegExp(`gameVersion: "${escapeRegExp(manifest.gameVersion)}"`),
  );
  assert.match(seedSource, /buildStatus: "released"/);
  assert.match(seedSource, /releaseChannel: "production"/);
  assert.doesNotMatch(seedSource, /where:\s*\{ code: "rhythm_saber" \}/);
  assert.doesNotMatch(seedSource, /\/unity\/rhythm_saber\/1\.0\.0/);

  for (const metric of manifest.requiredResultMetrics) {
    assert.match(
      seedSource,
      new RegExp(`metricType: "${escapeRegExp(metric.metricType)}"`),
    );
  }
});

test("local seed and patient API keep current plan selection deterministic", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );
  const appServiceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );
  const rehabPlanCurrentResetBlock = extractBlock(
    seedSource,
    "await prisma.rehabPlan.updateMany({",
    "  const rehabPlanData = {",
  );

  assert.match(seedSource, /rehabPlan\.updateMany\(\{/);
  assert.match(rehabPlanCurrentResetBlock, /patientId:\s*patient\.id/);
  assert.match(rehabPlanCurrentResetBlock, /isCurrent:\s*true/);
  assert.match(rehabPlanCurrentResetBlock, /NOT:\s*\{\s*id:\s*seedRehabPlanId\s*\}/);
  assert.match(rehabPlanCurrentResetBlock, /data:\s*\{\s*isCurrent:\s*false,\s*status:\s*"ended"\s*\}/);
  assert.equal(countOccurrences(appServiceSource, "orderBy: { sequence: 'asc' }"), 4);
  assert.match(appServiceSource, /rehabPlans:\s*\{[\s\S]*?orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}[\s\S]*?take:\s*1/);
  const getPatientBlock = appServiceSource.slice(
    appServiceSource.indexOf("  async getPatient("),
    appServiceSource.indexOf("  async createConsent("),
  );
  const getPatientRehabPlansBlock = getPatientBlock.slice(
    getPatientBlock.indexOf("        rehabPlans:"),
    getPatientBlock.indexOf("        trainingSessions:"),
  );
  assert.match(
    getPatientRehabPlansBlock,
    /OR:\s*\[\{ isCurrent: true \}, \{ status: 'pending_confirm' \}\]/,
  );
  assert.doesNotMatch(getPatientRehabPlansBlock, /take:\s*1/);
});

test("local seed current rehab plan only includes released formal training content", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  assert.match(
    seedSource,
    /const releasedPlanGames = games\.filter\(\s*\(game\) =>\s*game\.status === "active" &&\s*game\.buildStatus === "released" &&\s*game\.releaseChannel === "production",?\s*\)/,
  );
  assert.match(seedSource, /releasedPlanGames\.map\(\(game, index\) =>/);
  assert.doesNotMatch(seedSource, /games\.map\(\(game, index\) =>/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function extractBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing source block start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Missing source block end: ${endNeedle}`);
  return source.slice(start, end);
}
