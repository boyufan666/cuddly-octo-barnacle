import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("camera invalidation clears actual readiness and pending checks; task switch and every consent clear invoke it", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf(
    "  const invalidateTrainingReadiness = useCallback(() => {",
  );
  const end = source.indexOf("  }, []);", start);
  const body = source.slice(source.indexOf("\n", start) + 1, end);
  const generation = { current: 4 };
  const empty = { cameraPermission: "unknown", poseRuntimeStatus: "unknown" };
  let readiness: object = {
    cameraPermission: "granted",
    cameraDeviceId: "camera",
    poseRuntimeStatus: "ready",
  };
  let busy = new Set(["checkPose", "checkDevice", "abortTraining"]);
  new Function(
    "poseCheckGenerationRef",
    "emptyTrainingReadiness",
    "setTrainingReadiness",
    "setBusyActions",
    body,
  )(
    generation,
    empty,
    (next: object) => {
      readiness = next;
    },
    (update: (value: Set<string>) => Set<string>) => {
      busy = update(busy);
    },
  );
  assert.equal(
    generation.current,
    5,
    "in-flight camera and pose checks become stale",
  );
  assert.deepEqual(readiness, empty);
  assert.deepEqual([...busy], ["abortTraining"]);
  assert.match(
    source,
    /onCameraSelectionInvalidated: invalidateTrainingReadiness/,
  );
  const prep = source.slice(
    source.indexOf("  function handleEnterTrainingPrep("),
    source.indexOf("  async function handleRefreshTrainingPreparation("),
  );
  assert.match(
    prep,
    /selectedTrainingPlanItemId !== planItemForPrep.id[\s\S]*invalidateTrainingReadiness\(\)/,
  );
  const roleData = await readFile(
    new URL("./useRoleData.ts", import.meta.url),
    "utf8",
  );
  const clears = [
    ...roleData.matchAll(/synchronizeRolePatientCameraConsent\(undefined\);/g),
  ];
  assert.equal(clears.length, 4);
  for (const clear of clears)
    assert.match(
      roleData.slice(
        clear.index! + clear[0].length,
        clear.index! + clear[0].length + 100,
      ),
      /^\s*onCameraSelectionInvalidated\?\.\(\);/,
    );
});
