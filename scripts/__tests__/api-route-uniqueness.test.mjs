import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient AI conversation route is declared once", async () => {
  const controllerSource = await readFile(
    join(rootDir, "apps/api/src/app.controller.ts"),
    "utf8",
  );
  const routeMatches = controllerSource.match(
    /@Get\('patients\/:id\/ai-conversations'\)/g,
  );
  const methodMatches = controllerSource.match(
    /^\s{2}listPatientAiConversations\(/gm,
  );

  assert.equal(routeMatches?.length ?? 0, 1);
  assert.equal(methodMatches?.length ?? 0, 1);
});
