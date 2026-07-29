import assert from "node:assert/strict";
import test from "node:test";
import {
  runLoginSubmission,
  runPasswordResetSubmission,
} from "./LoginPanel";

test("login submission consumes an error already represented by hook UI state", async () => {
  const handledError = new Error("登录失败状态已由 hook 设置");
  let calls = 0;

  await assert.doesNotReject(
    runLoginSubmission(async (account, password) => {
      calls += 1;
      assert.equal(account, "patient001");
      assert.equal(password, "Temporary-253913!");
      throw handledError;
    }, "patient001", "Temporary-253913!"),
  );
  assert.equal(calls, 1);
});

test("password reset submission consumes handled errors and preserves form state", async () => {
  const completed = await runPasswordResetSubmission(async () => {
    throw new Error("密码更新失败状态已由 hook 设置");
  }, "Final-Password-253913!");

  assert.equal(completed, false);
});

test("password reset submission reports success so the form may clear fields", async () => {
  const completed = await runPasswordResetSubmission(
    async () => undefined,
    "Final-Password-253913!",
  );

  assert.equal(completed, true);
});
