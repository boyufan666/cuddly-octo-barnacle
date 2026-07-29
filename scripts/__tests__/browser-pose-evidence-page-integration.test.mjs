import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("browser pose evidence form input carries collection batch ids from persisted records", async () => {
  const pageSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/TrainingQualityEvidenceSection.tsx"),
    "utf8",
  );
  const builderSource = sliceBetween(
    pageSource,
    "function buildBrowserPoseEvidenceInput",
    "function resolveTrainingEvidenceAuditLogIds",
  );

  assert.match(
    builderSource,
    /collectionBatchId:\s*readRequiredText\(\s*session\.collectionBatchId/,
  );
  assert.match(
    builderSource,
    /collectionBatchId:\s*readRequiredText\(\s*result\.collectionBatchId/,
  );
  assert.doesNotMatch(builderSource, /collectionBatchId:\s*""/);
});

test("browser pose evidence template marks collection batch ids as replaceable placeholders", async () => {
  const templateSource = await readFile(
    join(rootDir, "docs/templates/browser-pose-evidence.template.json"),
    "utf8",
  );
  const template = JSON.parse(templateSource);

  assert.equal(template.trainingSession.collectionBatchId, "<collection-batch-id>");
  assert.equal(template.trainingResult.collectionBatchId, "<collection-batch-id>");
  assert.equal(template.motionMetrics.length, 4);
  assert.ok(
    template.motionMetrics.every(
      (metric) => metric.collectionBatchId === "<collection-batch-id>",
    ),
  );
  assert.doesNotMatch(templateSource, /本次正式采集批次 ID/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
