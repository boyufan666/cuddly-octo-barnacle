import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityAuditPage } from "./SecurityAuditPage";

const baseProps = {
  canReadAuditLogs: true,
  filters: { result: "all" as const, actorRole: "all" as const, limit: 100 },
  isLoading: false,
  onFiltersChange: () => undefined,
  onRefreshAuditLogs: async () => undefined,
};

test("unavailable audit logs do not render a fake zero-result state", () => {
  const html = renderToStaticMarkup(
    <SecurityAuditPage {...baseProps} auditLogs={undefined} />,
  );

  assert.doesNotMatch(html, /本次查询返回 0 条记录/);
  assert.doesNotMatch(html, /当前筛选条件下没有审计日志/);
});

test("successfully loaded empty audit logs render the real empty state", () => {
  const html = renderToStaticMarkup(
    <SecurityAuditPage {...baseProps} auditLogs={[]} />,
  );

  assert.match(html, /本次查询返回 0 条记录/);
  assert.match(html, /当前筛选条件下没有审计日志/);
});
