import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

test("optional role-data failures render explicit panel-scoped errors", async () => {
  const errorModule = await import("./RoleDataPanelErrors");
  const RoleDataPanelErrors = (
    errorModule as typeof errorModule & {
      RoleDataPanelErrors: (props: {
        errors: Array<{ label: string; message: string; panel: string }>;
      }) => React.ReactNode;
    }
  ).RoleDataPanelErrors;

  assert.equal(typeof RoleDataPanelErrors, "function");
  const html = renderToStaticMarkup(
    <RoleDataPanelErrors
      errors={[
        {
          panel: "rewards",
          label: "康复奖励",
          message: "奖励服务不可用",
        },
      ]}
    />,
  );

  assert.match(html, /aria-label="部分业务面板加载失败"/);
  assert.match(html, /康复奖励加载失败/);
  assert.match(html, /奖励服务不可用/);
  assert.doesNotMatch(html, /暂无|空状态/);
});
