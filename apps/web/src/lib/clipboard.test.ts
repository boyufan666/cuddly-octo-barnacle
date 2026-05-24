import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard } from "./clipboard.ts";

test("copyTextToClipboard writes trimmed text through Clipboard API", async () => {
  let copied = "";
  const result = await copyTextToClipboard({
    text: "  audit-log-id  ",
    clipboard: {
      async writeText(text) {
        copied = text;
      },
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(copied, "audit-log-id");
});

test("copyTextToClipboard fails explicitly when Clipboard API is unavailable", async () => {
  const result = await copyTextToClipboard({ text: "audit-log-id" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Clipboard API/);
});

test("copyTextToClipboard fails explicitly when browser rejects clipboard write", async () => {
  const result = await copyTextToClipboard({
    text: "audit-log-id",
    clipboard: {
      async writeText() {
        throw new Error("denied");
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /拒绝写入剪贴板/);
});

test("copyTextToClipboard rejects blank text", async () => {
  const result = await copyTextToClipboard({
    text: "   ",
    clipboard: {
      async writeText() {
        throw new Error("should not write blank text");
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /缺少可复制的文本/);
});
