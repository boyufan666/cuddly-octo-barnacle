import assert from "node:assert/strict";
import test from "node:test";
import {
  doctorSafeActionStatus,
  patientSafeActionStatus,
} from "./action-status.ts";

test("doctor and patient action errors map technical API failures to business-safe copy", () => {
  const technicalMessage =
    "POST /collection-batches failed: protocolId missing for runtimeType browser_pose_canvas, rawPayload contains manifest Endpoint data and collectionBatchId";

  for (const message of [
    doctorSafeActionStatus(technicalMessage),
    patientSafeActionStatus(technicalMessage),
  ]) {
    assert.doesNotMatch(
      message,
      /protocolId|runtimeType|rawPayload|manifest|Endpoint|collectionBatchId/i,
    );
    assert.match(message, /暂时无法完成|请稍后重试|联系/);
  }
});

test("doctor action status preserves clinical validation wording", () => {
  const clinicalMessage = "评估原始摘要缺少医生复核说明，请补充后再提交。";

  assert.equal(doctorSafeActionStatus(clinicalMessage), clinicalMessage);
});

test("operation busy state keeps concurrent actions independent", async () => {
  const actionStatusModule = await import("./action-status");
  const updateBusyActions = (
    actionStatusModule as typeof actionStatusModule & {
      updateBusyActions: (
        current: ReadonlySet<string>,
        action: string,
        busy: boolean,
      ) => ReadonlySet<string>;
    }
  ).updateBusyActions;

  assert.equal(typeof updateBusyActions, "function");
  const assessmentBusy = updateBusyActions(
    new Set<string>(),
    "assessment",
    true,
  );
  const assessmentAndExportBusy = updateBusyActions(
    assessmentBusy,
    "exportData",
    true,
  );
  const exportOnlyBusy = updateBusyActions(
    assessmentAndExportBusy,
    "assessment",
    false,
  );

  assert.equal(exportOnlyBusy.has("assessment"), false);
  assert.equal(exportOnlyBusy.has("exportData"), true);
  assert.equal(exportOnlyBusy.has("auditLogs"), false);
});
