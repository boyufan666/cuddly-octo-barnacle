import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("doctor workspace preserves concurrent busy booleans across the content boundary", async () => {
  const source = await readFile(
    new URL("./DoctorWorkspaceContainer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /isPlanBusy=\{isConfirmingPlan\}/);
  assert.match(source, /isConfirmRiskBusy=\{isConfirmingRisk\}/);
  assert.match(
    source,
    /isCollectionPreparationBusy=\{isCreatingCollectionBatch\}/,
  );
  assert.match(source, /isTrainingReviewBusy=\{isReviewingTraining\}/);
  assert.doesNotMatch(source, /doctorWorkbenchActionState|\?\s*"confirmPlan"/);
});
