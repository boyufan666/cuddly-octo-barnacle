import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TrainingPrepChecklist } from "./TrainingPrepChecklist";

function render(cameraRequired: boolean, poseError?: string) {
  return renderToStaticMarkup(
    <TrainingPrepChecklist
      gameReady
      hasCameraConsent
      hasTrainingPreparation
      isBusy={false}
      isRefreshingPreparation={false}
      onCheckDevice={async () => {}}
      onCheckPose={async () => {}}
      onRefreshTrainingPreparation={async () => {}}
      onStartTraining={async () => {}}
      readiness={{
        cameraPermission: "granted",
        cameraDeviceId: "camera",
        poseCheckStatus: poseError ? "error" : "unknown",
        poseError,
      }}
      requiresCameraCheck={cameraRequired}
    />,
  );
}

test("camera preparation renders an actual muted inline video and accurate error", () => {
  const html = render(true, "摄像头画面尚未就绪，请检查设备连接。");
  assert.match(html, /<video/);
  assert.match(html, /muted=""/);
  assert.match(html, /playsInline=""/);
  assert.match(html, /摄像头画面尚未就绪，请检查设备连接。/);
  assert.doesNotMatch(html, /画面不够稳定|画面稳定|双手入镜/);
});

test("non-camera preparation does not start or display a pose camera", () => {
  assert.doesNotMatch(render(false), /<video/);
});
