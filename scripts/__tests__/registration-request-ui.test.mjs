import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("frontend API client exposes registration request review endpoints", async () => {
  const apiSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );

  assert.match(typeSource, /export type CreateRegistrationRequest/);
  assert.match(typeSource, /export type RegistrationRequest/);
  assert.match(typeSource, /export type ReviewRegistrationRequest/);
  assert.match(apiSource, /createRegistrationRequest/);
  assert.match(apiSource, /"\/auth\/registration-requests"/);
  assert.match(apiSource, /registrationRequests/);
  assert.match(apiSource, /"\/admin\/registration-requests"/);
  assert.match(apiSource, /reviewRegistrationRequest/);
  assert.match(apiSource, /`\/admin\/registration-requests\/\$\{requestId\}\/review`/);
});

test("login and admin screens expose reviewed account opening instead of demo account creation", async () => {
  const pageSource = await readFile(
    join(rootDir, "apps/web/src/app/page.tsx"),
    "utf8",
  );
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const accountRequestSource = await readFile(
    join(rootDir, "apps/web/src/features/auth/AccountRequestPanel.tsx"),
    "utf8",
  );
  const authEntrySource = await readFile(
    join(rootDir, "apps/web/src/features/auth/AuthEntryPanel.tsx"),
    "utf8",
  );
  const loginPanelSource = await readFile(
    join(rootDir, "apps/web/src/features/auth/LoginPanel.tsx"),
    "utf8",
  );
  const adminOverviewSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/AdminOverviewPage.tsx"),
    "utf8",
  );
  const accountReviewSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/AccountReviewPanel.tsx"),
    "utf8",
  );

  const loginSource = `${authEntrySource}\n${loginPanelSource}`;
  const adminSource = `${adminOverviewSource}\n${accountReviewSource}`;

  assert.match(pageSource, /RoleWorkspace/);
  assert.doesNotMatch(pageSource, /registrationRequestForm/);
  assert.match(workspaceSource, /registrationRequestForm/);
  assert.match(workspaceSource, /handleCreateRegistrationRequest/);
  assert.match(workspaceSource, /handleReviewRegistrationRequest/);
  assert.match(workspaceSource, /<AuthEntryPanel\b/);
  assert.match(loginSource, /AccountRequestPanel/);
  assert.match(loginSource, /LoginPanel/);
  assert.match(accountRequestSource, /申请开通/);
  assert.match(accountRequestSource, /提交审核/);
  assert.match(accountReviewSource, /机构审核通过才会创建正式登录账号/);
  assert.match(workspaceSource, /<AdminOverviewPage\b/);
  assert.doesNotMatch(workspaceSource, /function AdminScreen/);
  assert.match(adminSource, /账号开通审核/);
  assert.match(adminSource, /通过申请/);
  assert.match(adminSource, /退回申请/);
  assert.doesNotMatch(
    loginSource + accountRequestSource,
    /演示|demo|mock|测试账号|技术验收|Provider|runtime|manifest|Endpoint|fallback|loader/i,
  );
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
