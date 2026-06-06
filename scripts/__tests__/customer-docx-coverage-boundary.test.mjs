import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

const expectedRequirementIds = [
  "DOCX-USER-LOGIN",
  "DOCX-PATIENT-PROFILE",
  "DOCX-METRIC-DATA",
  "DOCX-AI-DIALOGUE",
  "DOCX-AI-RESULT",
  "DOCX-UNITY-GAME",
  "DOCX-GAME-RESULT",
  "DOCX-ADMIN-USERS",
  "DOCX-ADMIN-METRICS",
  "DOCX-ADMIN-AI",
  "DOCX-ADMIN-GAMES",
  "DOCX-AI-STT-TTS",
  "DOCX-PLAN-MATCHING",
  "DOCX-REALTIME-CAPTURE",
  "DOCX-PRIVACY-AUDIT",
  "DOCX-FAMILY-SOCIAL",
  "DOCX-SOCIAL-SQUARE",
];

const allowedStatuses = new Set([
  "done",
  "needs-ui-closure",
  "needs-functional-closure",
  "customer-gated",
]);

test("customer DOCX coverage matrix lists every formal delivery module", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );

  for (const id of expectedRequirementIds) {
    assert.match(source, new RegExp(`\\| ${id} \\|`), `missing ${id}`);
  }

  assert.match(source, /No fallback allowed/);
  assert.match(source, /Wearable device integration is customer-gated/);
  assert.match(source, /Production deployment is customer-gated/);
});

test("customer DOCX coverage matrix documents required evidence per row", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );
  const rows = parseCoverageRows(source);
  const ids = rows.map((row) => row.id);
  assert.deepEqual(ids.toSorted(), expectedRequirementIds.toSorted());
  assert.equal(new Set(ids).size, expectedRequirementIds.length);

  for (const row of rows) {
    assert.ok(row.customerWording, `missing customer wording in ${row.id}`);
    assert.ok(row.implementationTarget, `missing implementation target in ${row.id}`);
    assert.match(
      row.proofKey,
      /^PROOF-[A-Z0-9-]+$/,
      `invalid proof key in ${row.id}: ${row.proofKey}`,
    );
    assert.ok(
      allowedStatuses.has(row.deliveryStatus),
      `invalid delivery status in ${row.id}: ${row.deliveryStatus}`,
    );
    assert.match(
      row.boundaryNote,
      /^No fallback allowed:/,
      `boundary note must explicitly start with no-fallback language in ${row.id}`,
    );
    assert.match(source, new RegExp(`### ${row.proofKey}\\n`));
  }
});

test("top-level delivery docs reference the customer DOCX coverage matrix", async () => {
  const acceptanceSource = await readFile(
    join(rootDir, "docs/customer-acceptance-criteria.md"),
    "utf8",
  );
  const boundarySource = await readFile(
    join(rootDir, "docs/delivery-boundary-and-readiness.md"),
    "utf8",
  );

  for (const source of [acceptanceSource, boundarySource]) {
    assert.match(source, /docs\/customer-docx-coverage-matrix\.md/);
    assert.match(source, /DOCX-USER-LOGIN/);
    assert.match(source, /No fallback allowed/);
    assert.match(source, /不得.*兜底|必须阻断/);
    assert.doesNotMatch(source, /失败后(?:可|可以|自动|默认).{0,24}(?:兜底|fallback|mock|demo|默认)/i);
    assert.doesNotMatch(
      source,
      /(?:允许|可|可以|自动|默认|使用|采用)(?:兜底|fallback|mock|demo|默认).{0,24}(?:通过验收|计为正式|作为正式)/i,
    );
    assert.doesNotMatch(
      source,
      /(?:兜底|fallback|mock|demo|默认).{0,24}(?:可|可以|允许).{0,24}(?:通过验收|计为正式|作为正式)/i,
    );
  }
});

test("customer DOCX proof catalog maps proof keys to concrete verification", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );
  const rows = parseCoverageRows(source);
  for (const row of rows) {
    const section = sliceFromHeading(source, `### ${row.proofKey}`);
    assert.match(
      section,
      /```bash\n[\s\S]*?(pnpm|node --test)[\s\S]*?```/,
      `proof catalog for ${row.proofKey} must include a bash command block`,
    );
    assert.doesNotMatch(
      section,
      /\b(TBD|TODO|fill in|later)\b/i,
      `proof catalog for ${row.proofKey} must not contain placeholders`,
    );
  }
});

test("customer supplement prioritizes risk estimation and multi-plan intervention over game complexity", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );

  assert.match(source, /潜在患病风险|潜在患病率趋势/);
  assert.match(source, /多方案干预|不同运动游戏方案/);
  assert.match(source, /思维类/);
  assert.match(source, /运动类/);
  assert.match(source, /游戏复杂度不是主交付指标/);
  assert.match(source, /保留现有 Unity、浏览器体感和认知网页训练内容/);
  assert.match(source, /不能把风险评估表述为诊断结论/);
});

test("software delivery closure marks implemented DOCX rows done while preserving customer gates", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );
  const rows = parseCoverageRows(source);

  for (const row of rows) {
    if (row.id === "DOCX-SOCIAL-SQUARE") {
      assert.equal(row.deliveryStatus, "customer-gated");
      continue;
    }

    assert.equal(row.deliveryStatus, "done", `${row.id} should be done`);
  }

  assert.match(source, /Customer-Gated Items Not Counted Complete By Source Code Alone/);
  assert.match(source, /Wearable physiological data/);
  assert.match(source, /Production deployment/);
  assert.match(source, /Formal AI\/STT\/TTS production use/);
});

function parseCoverageRows(source) {
  return source
    .split("\n")
    .filter((line) => /^\| DOCX-[A-Z-]+ \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      assert.equal(cells.length, 6, `expected 6 cells in row: ${line}`);
      const [
        id,
        customerWording,
        implementationTarget,
        proofKey,
        deliveryStatus,
        boundaryNote,
      ] = cells;
      return {
        id,
        customerWording,
        implementationTarget,
        proofKey,
        deliveryStatus,
        boundaryNote,
      };
    });
}

function sliceFromHeading(source, heading) {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const next = source.indexOf("\n### ", start + heading.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}
