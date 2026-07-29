import assert from "node:assert/strict";
import test from "node:test";
import { doctorPreparationProtocolOptionLabel } from "./DataCollectionReviewPanel.tsx";

test("doctor preparation protocol options disclose the formal protocol version", () => {
  assert.equal(
    doctorPreparationProtocolOptionLabel("运动训练", { version: "1.1.0" }),
    "运动训练准备规则 · 1.1.0",
  );
});
