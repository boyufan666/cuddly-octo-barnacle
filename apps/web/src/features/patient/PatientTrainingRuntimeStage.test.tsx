import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPatientTrainingEncouragementRequest,
  PatientTrainingEncouragementControl,
} from "./PatientTrainingRuntimeStage";

test("builds an explicit training_encouragement request from the current game", () => {
  assert.deepEqual(buildPatientTrainingEncouragementRequest(" 节律触达训练 "), {
    scenario: "training_encouragement",
    text: "你正在进行节律触达训练。保持节奏，专注完成每一步，你做得很好。",
  });
});

test("renders a patient-triggered encouragement action without calling TTS during render", () => {
  let requestCount = 0;
  const request = buildPatientTrainingEncouragementRequest("节律触达训练");

  const markup = renderToStaticMarkup(
    <PatientTrainingEncouragementControl
      isTtsBusy={false}
      onCreateTtsSpeechOutput={async () => {
        requestCount += 1;
      }}
      request={request}
    />,
  );

  assert.equal(requestCount, 0);
  assert.match(markup, /播放训练鼓励/);
  assert.match(markup, /仅在你点击后生成并播放一次训练鼓励/);
  assert.match(markup, /不会自动连续调用/);
});

test("rejects an empty game name instead of inventing encouragement content", () => {
  assert.throws(
    () => buildPatientTrainingEncouragementRequest("   "),
    /训练内容名称不能为空/,
  );
});
