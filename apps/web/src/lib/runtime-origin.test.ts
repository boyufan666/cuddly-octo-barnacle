import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackHttpOrigin } from "./runtime-origin";

test("runtime origin allows only exact local HTTP loopback origins", () => {
  assert.equal(isLoopbackHttpOrigin("http://localhost:3000"), true);
  assert.equal(isLoopbackHttpOrigin("http://127.0.0.1:4000"), true);
  assert.equal(isLoopbackHttpOrigin("http://[::1]:5000"), true);
  assert.equal(isLoopbackHttpOrigin("https://localhost:3000"), false);
  assert.equal(isLoopbackHttpOrigin("http://localhost:3000/path"), false);
  assert.equal(isLoopbackHttpOrigin("http://localhost.evil:3000"), false);
  assert.equal(
    isLoopbackHttpOrigin("http://user:password@localhost:3000"),
    false,
  );
});
