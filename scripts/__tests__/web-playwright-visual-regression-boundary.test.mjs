import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const rootDir = process.cwd();
const webRegressionSpec = readFileSync(
  join(rootDir, "scripts/web-playwright-regression.spec.mjs"),
  "utf8",
);
const visualRunbook = readFileSync(
  join(rootDir, "docs/web-playwright-regression-runbook.md"),
  "utf8",
);

test("web visual regression does not simulate browser business state", () => {
  assert.doesNotMatch(
    webRegressionSpec,
    /page\.route\([\s\S]*?fulfill\(/,
    "web visual regression must not satisfy patient/doctor/caregiver/admin state with page.route(...fulfill)",
  );
  assert.doesNotMatch(
    webRegressionSpec,
    /route\.fulfill\(/,
    "web visual regression must not fulfill mocked network responses",
  );
});

test("web visual regression API preset uses isolated cookie sessions and CSRF", () => {
  assert.doesNotMatch(
    webRegressionSpec,
    /\baccessToken\b|\bAuthorization\b|\bBearer\b/,
  );
  assert.match(webRegressionSpec, /request\s+as\s+playwrightRequest/);
  assert.match(webRegressionSpec, /playwrightRequest\.newContext\(/);
  assert.match(webRegressionSpec, /rehab_csrf/);
  assert.match(webRegressionSpec, /["']X-CSRF-Token["']/);
  assert.match(webRegressionSpec, /rehab_session/);
  assert.match(
    webRegressionSpec,
    /async function prepareFormalCognitiveTraining[\s\S]*finally\s*\{[\s\S]*disposeRoleApiClients/,
  );
  assert.doesNotMatch(
    webRegressionSpec,
    /(?:^|[,{]\s*)(?:cookie|["'`]cookie["'`]|\[\s*["'`]cookie["'`]\s*\])\s*:|\.\s*(?:set|append)\s*\(\s*["'`]cookie["'`]|\.\.\.\s*(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*headers\b/im,
    "API presets must let APIRequestContext manage cookies instead of injecting Cookie headers",
  );
});

test("web visual regression checks no overflow, nav coverage, and text clipping", () => {
  assert.match(
    webRegressionSpec,
    /expectNoHorizontalOverflowAtScrollPositions/,
  );
  assert.match(
    webRegressionSpec,
    /expectPatientPrimaryActionClearOfNavAtScrollPositions/,
  );
  assert.match(
    webRegressionSpec,
    /expectPatientPrimaryActionClearOfNavAtScrollPositions\(page,\s*\{\s*required:\s*true/,
    "patient visual regression must require the primary CTA when the screen owns one",
  );
  assert.doesNotMatch(
    webRegressionSpec,
    /if \(\(await primaryAction\.count\(\)\) === 0\) return;/,
    "primary-action overlap checks must not silently pass when the expected CTA is missing",
  );
  assert.match(
    webRegressionSpec,
    /expectNoVisibleTextClippingAtScrollPositions/,
    "browser visual regression must inspect visible text for clipping/truncation across scroll positions",
  );
  assert.match(
    webRegressionSpec,
    /ancestorClipRectForElement/,
    "text clipping checks must inspect hidden or clipped ancestor containers, not only the text element itself",
  );
  assert.doesNotMatch(
    webRegressionSpec,
    /element\.closest\(\s*["'`]\.training-stage-shell/,
    "text clipping checks must not broadly exclude visible training stage copy",
  );
  assert.match(
    webRegressionSpec,
    /patientCareTechnicalCopyPattern/,
    "patient/caregiver/doctor role-safe copy guard must remain in the visual regression spec",
  );
  for (const role of ["patient", "doctor", "caregiver", "admin"]) {
    assert.match(
      webRegressionSpec,
      new RegExp(`captureVisualEvidence\\(page, testInfo, \`${role}-`),
      `browser visual regression must capture ${role} landing and workflow screenshots`,
    );
  }
  assert.match(
    webRegressionSpec,
    /async function captureVisualEvidence[\s\S]*await mkdir\(screenshotDir,\s*\{\s*recursive:\s*true\s*\}\);[\s\S]*page\.screenshot/,
    "screenshot helper must create its evidence directory before writing",
  );
  assert.match(
    webRegressionSpec,
    /async function captureVisualEvidence[\s\S]*resetVisualEvidenceScroll\(page\)[\s\S]*page\.screenshot/,
    "screenshot helper must reset application and nested scroll regions before capture",
  );
  assert.match(
    webRegressionSpec,
    /expectWorkbenchNavigationFullyVisible/,
    "workbench navigation must be fully visible without horizontal clipping",
  );
  assert.match(
    webRegressionSpec,
    /isVisibleLayoutElement/,
    "layout overlap helpers must filter hidden or zero-size responsive duplicate layouts",
  );
});

test("web visual regression runbook records Unit 7 screenshot evidence", () => {
  assert.match(
    visualRunbook,
    /Unit 7/i,
    "runbook must explicitly identify the Unit 7 visual regression evidence",
  );
  assert.match(
    visualRunbook,
    /text clipping|文本裁切|文字裁切/i,
    "runbook must document Unit 7 text clipping coverage",
  );
  assert.match(
    visualRunbook,
    /90\s*(?:张|个).*?(?:18\s*(?:张|个).*?5\s*个项目|5\s*个项目.*?18\s*(?:张|个))/s,
    "runbook must state the exact clean-run screenshot count and per-project rule",
  );
  assert.match(
    visualRunbook,
    /清理[^。\n]*web-regression-\*\.png[^。\n]*test-results/,
    "runbook must state that stale runner-managed evidence is cleaned before the run",
  );
});
