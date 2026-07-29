import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request as playwrightRequest } from "@playwright/test";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const apiPresetAccountPassword = "Playwright-Contract-253913!";

test("login entry is product-first and hides technical delivery badges", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const login = await readFile(
    join(rootDir, "apps/web/src/features/auth/LoginPanel.tsx"),
    "utf8",
  );
  const authEntry = await readFile(
    join(rootDir, "apps/web/src/features/auth/AuthEntryPanel.tsx"),
    "utf8",
  );
  const request = await readFile(
    join(rootDir, "apps/web/src/features/auth/AccountRequestPanel.tsx"),
    "utf8",
  );
  const combined = authEntry + login + request;

  assert.match(login, /机构账号/);
  assert.match(login, /登录/);
  assert.match(login, /进入工作台/);
  assert.match(request, /申请开通/);
  assert.match(request, /提交审核/);
  assert.match(combined, /data-testid="auth-login-panel"/);
  assert.match(combined, /data-testid="auth-account-request"/);
  assert.doesNotMatch(
    login,
    /\bCard\b/,
    "login panel must not render a card wrapper",
  );
  assert.doesNotMatch(
    request,
    /\bCard\b/,
    "account request panel must not render a card wrapper",
  );
  assert.match(workspace, /<AuthEntryPanel/);
  assert.doesNotMatch(workspace, /function LoginScreen/);
  assert.doesNotMatch(authEntry, /<ScreenGrid|eyebrow=|title=|subtitle=/);
  assert.doesNotMatch(authEntry, /欢迎使用认知康复平台|认知康复平台/);
  assert.doesNotMatch(login, /仅展示当前身份可查看/);
  assert.doesNotMatch(request, /需机构审核|申请资料只用于账号开通审核/);
  assert.doesNotMatch(authEntry, /<LoopStrip|<MetricCard|<GlassCard/);
  assert.doesNotMatch(login + request, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(
    combined,
    /演示|demo|mock|测试账号|技术验收|Provider|runtime|manifest|Endpoint|fallback/i,
  );
  assert.doesNotMatch(login, /平台能力|功能演示|验收材料|技术模块|康复平台/);
  for (const name of [
    "requestedRole",
    "displayName",
    "account",
    "initialPassword",
    "mobilePhone",
    "age",
    "gender",
    "caregiverName",
    "caregiverPhone",
    "healthSummary",
  ]) {
    assert.match(
      request,
      new RegExp(`name=["']${name}["']|name=\\{["']${name}["']\\}`),
      `account request control missing form name: ${name}`,
    );
  }
});

test("auth entry stays extracted from the page shell", async () => {
  const page = await readFile(
    join(rootDir, "apps/web/src/app/page.tsx"),
    "utf8",
  );
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const authEntry = await readFile(
    join(rootDir, "apps/web/src/features/auth/AuthEntryPanel.tsx"),
    "utf8",
  );

  assert.match(page, /from "@\/features\/session\/role-workspace"/);
  assert.match(page, /<RoleWorkspace \/>/);
  assert.doesNotMatch(page, /from "@\/features\/auth\/LoginPanel"/);
  assert.doesNotMatch(page, /from "@\/features\/auth\/AccountRequestPanel"/);
  assert.match(workspace, /from ["']@\/features\/auth\/AuthEntryPanel["']/);
  assert.doesNotMatch(workspace, /from ["']@\/features\/auth\/LoginPanel["']/);
  assert.doesNotMatch(
    workspace,
    /from ["']@\/features\/auth\/AccountRequestPanel["']/,
  );
  assert.match(authEntry, /<LoginPanel/);
  assert.match(authEntry, /<AccountRequestPanel/);
  assert.doesNotMatch(authEntry, /function LoginPanel/);
  assert.doesNotMatch(authEntry, /function RegistrationRequestPanel/);
});

test("playwright login smoke no longer expects technical readiness copy", async () => {
  const spec = await readFile(
    join(rootDir, "scripts/web-playwright-regression.spec.mjs"),
    "utf8",
  );
  const requestTest = sliceBetween(
    spec,
    'test("account request submits the visible review form to the registration API"',
    'test("front-end shell keeps all formal delivery entry points navigable"',
  );
  const shellTest = sliceBetween(
    spec,
    'test("front-end shell keeps all formal delivery entry points navigable"',
    'test("desensitized CSV export blocks missing reason',
  );

  assert.match(
    shellTest,
    /getByTestId\("auth-login-panel"\)\s*\.getByRole\("heading", \{ name: "机构账号登录" \}\)/,
  );
  assert.match(shellTest, /heading", \{ name: "没有账号？先提交申请开通" \}/);
  assert.match(requestTest, /page\.waitForResponse\(/);
  assert.match(requestTest, /response\.request\(\)\.method\(\) === "POST"/);
  assert.match(requestTest, /\/auth\/registration-requests/);
  assert.match(requestTest, /response\.status\(\)[\s\S]*\.toBe\(201\)/);
  assert.match(requestTest, /createdRequest[\s\S]*reviewStatus:\s*"pending"/);
  assert.match(requestTest, /requestedRole:\s*"patient"/);
  assert.doesNotMatch(
    shellTest,
    /expectDesktopOnlyShellText\(page, "服务可用"\)/,
  );
  assert.doesNotMatch(
    shellTest,
    /expectDesktopOnlyShellText\(page, "机构访问"\)/,
  );
});

test("Playwright API preset helpers isolate roles and enforce cookie CSRF", async (t) => {
  const contractServer = await startApiAuthContractServer(t);
  const specs = new Map([
    [
      "web regression",
      await readFile(
        join(rootDir, "scripts/web-playwright-regression.spec.mjs"),
        "utf8",
      ),
    ],
    [
      "formal UI chain",
      await readFile(
        join(rootDir, "scripts/formal-ui-business-chain.spec.mjs"),
        "utf8",
      ),
    ],
  ]);

  for (const [label, source] of specs) {
    const declarations = apiPresetHelperDeclarations(source);
    assertNoManualCookieHeaderInjection(declarations, label);
    assertStrictApiPresetHelperContract(source, label);
  }
  for (const bypass of [
    'const requestOptions = { headers: { COOKIE: "manual=1" } };',
    'const requestOptions = { headers: { "cOoKiE": "manual=1" } };',
    'const requestOptions = { headers: { ["Cookie"]: "manual=1" } };',
    'requestHeaders.set("Cookie", "manual=1");',
    'requestHeaders.append("cOoKiE", "manual=1");',
    'requestHeaders.set(cookieName, "manual=1");',
    'const requestOptions = { headers: { [cookieName]: "manual=1" } };',
    "const requestOptions = { ...options };",
    "const requestOptions = { headers: externalHeaders };",
    "requestOptions.headers = externalHeaders;",
    "async function apiRequest(context, method, path, headers) {}",
    "const requestHeaders = new Headers(options.headers);",
    "const response = await context.fetch(path, options);",
  ]) {
    assert.throws(
      () => assertNoManualCookieHeaderInjection(bypass, "bypass fixture"),
      /manual Cookie header injection/,
      bypass,
    );
  }

  for (const [label, source] of specs) {
    const helpers = loadApiPresetHelpers(source);
    const eventsStart = contractServer.events.length;
    const clients = await helpers.createRoleApiClients(
      { admin: "admin", doctor: "doctor001", patient: "patient001" },
      contractServer.baseURL,
    );

    try {
      assert.notStrictEqual(
        clients.admin.context,
        clients.doctor.context,
        `${label}: admin/doctor jar`,
      );
      assert.notStrictEqual(
        clients.admin.context,
        clients.patient.context,
        `${label}: admin/patient jar`,
      );
      assert.notStrictEqual(
        clients.doctor.context,
        clients.patient.context,
        `${label}: doctor/patient jar`,
      );

      await helpers.apiGet(
        clients.patient.context,
        "/protected/patient001",
        200,
      );
      await helpers.apiRequest(
        clients.admin.context,
        "POST",
        "/protected/admin",
        {
          data: { operation: "create" },
          headers: { cOoKiE: "manual_cookie=injected" },
        },
        200,
      );
      await helpers.apiRequest(
        clients.doctor.context,
        "PATCH",
        "/protected/doctor001",
        { data: { operation: "update" } },
        200,
      );
      await helpers.apiRequest(
        clients.patient.context,
        "DELETE",
        "/protected/patient001",
        {},
        200,
      );

      await assert.rejects(
        helpers.apiRequest(
          clients.admin.context,
          "POST",
          "/failure",
          { data: { operation: "must-fail" } },
          200,
        ),
        /503[\s\S]*forced failure/,
        `${label}: non-2xx responses must fail`,
      );

      const events = contractServer.events.slice(eventsStart);
      assert.deepEqual(
        events
          .filter((event) => event.path === "/auth/login")
          .map((event) => event.account),
        ["admin", "doctor001", "patient001"],
        `${label}: each role must log in through its own context`,
      );
      assert.deepEqual(
        events
          .filter((event) => event.path === "/auth/login")
          .map((event) => event.password),
        Array(3).fill(apiPresetAccountPassword),
        `${label}: each role must use the configured Playwright account password`,
      );
      for (const event of events.filter((item) =>
        ["POST", "PATCH", "DELETE"].includes(item.method),
      )) {
        assert.equal(
          event.csrf,
          event.cookies.rehab_csrf,
          `${label}: ${event.method} ${event.path}`,
        );
      }
      assert.equal(
        events.filter((event) => event.path === "/failure").length,
        1,
        `${label}: non-2xx requests must not retry`,
      );
      const adminCreate = events.find(
        (event) => event.method === "POST" && event.path === "/protected/admin",
      );
      assert.equal(
        adminCreate?.cookies.manual_cookie,
        undefined,
        `${label}: external headers input must not inject a Cookie header`,
      );
    } finally {
      await helpers.disposeRoleApiClients(clients);
    }
    for (const [role, client] of Object.entries(clients)) {
      await assert.rejects(
        client.context.get(`/protected/${client.login.user.account}`),
        /disposed|closed/i,
        `${label}: disposed ${role} context must reject requests`,
      );
    }

    const missingCookieContext = await playwrightRequest.newContext({
      baseURL: contractServer.baseURL,
    });
    try {
      await assert.rejects(
        helpers.apiRequest(
          missingCookieContext,
          "POST",
          "/protected/admin",
          { data: { operation: "blocked" } },
          200,
        ),
        /rehab_csrf/,
        `${label}: missing CSRF cookie must fail before the request`,
      );
      await assert.rejects(
        helpers.apiLogin(missingCookieContext, "missing-session"),
        /rehab_session/,
        `${label}: authenticated login without a session cookie must fail`,
      );
    } finally {
      await missingCookieContext.dispose();
    }

    const mismatchedCsrfContext = await playwrightRequest.newContext({
      baseURL: contractServer.baseURL,
    });
    try {
      contractServer.mismatchNextCsrfResponse();
      await assert.rejects(
        helpers.apiLogin(mismatchedCsrfContext, "csrf-mismatch"),
        /CSRF response does not match the rehab_csrf cookie/,
        `${label}: login must compare the CSRF response with its jar cookie`,
      );
    } finally {
      await mismatchedCsrfContext.dispose();
    }

    const createdContexts = [];
    let creationAttempts = 0;
    const failingRequestFactory = {
      async newContext(options) {
        creationAttempts += 1;
        if (creationAttempts === 3)
          throw new Error("forced context creation failure");
        const context = await playwrightRequest.newContext(options);
        createdContexts.push(context);
        return context;
      },
    };
    t.after(async () => {
      await Promise.allSettled(
        createdContexts.map((context) => context.dispose()),
      );
    });
    const failingHelpers = loadApiPresetHelpers(source, failingRequestFactory);
    await assert.rejects(
      failingHelpers.createRoleApiClients(
        { admin: "admin", doctor: "doctor001", patient: "patient001" },
        contractServer.baseURL,
      ),
      /forced context creation failure/,
      `${label}: context creation failure must propagate without retry`,
    );
    assert.equal(
      creationAttempts,
      3,
      `${label}: context creation must not retry or fall back`,
    );
    assert.equal(
      createdContexts.length,
      2,
      `${label}: exactly two contexts precede the failure`,
    );
    for (const context of createdContexts) {
      await assert.rejects(
        context.get("/protected/admin"),
        /disposed|closed/i,
        `${label}: partial contexts must be disposed after creation failure`,
      );
    }
  }
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function apiPresetHelperDeclarations(source) {
  const names = [
    "createRoleApiClients",
    "disposeRoleApiClients",
    "apiLogin",
    "apiGet",
    "apiPost",
    "apiRequest",
    "requireApiCookie",
    "parseApiResponse",
  ];
  return names.map((name) => extractFunction(source, name)).join("\n");
}

function assertNoManualCookieHeaderInjection(source, label) {
  const prohibitedPatterns = [
    /(?:^|[,{]\s*)(?:cookie|["'`]cookie["'`]|\[\s*["'`]cookie["'`]\s*\])\s*:/im,
    /\.\s*(?:set|append)\s*\(/i,
    /\[\s*[A-Za-z_$][\w$]*\s*\]\s*:/,
    /\.\.\./,
    /\bheaders\s*:\s*(?!\{)(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*/i,
    /\.headers\s*=\s*(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*/i,
    /async\s+function\s+\w+\s*\([^)]*\bheaders\b/i,
    /new\s+Headers\s*\([^)]*\bheaders\b/i,
    /Object\.assign\s*\([^)]*\bheaders\b/i,
    /context\.fetch\s*\(\s*[^,]+,\s*(?:options|config|headers)\s*\)/i,
  ];
  for (const pattern of prohibitedPatterns) {
    assert.doesNotMatch(
      source,
      pattern,
      `${label}: manual Cookie header injection is forbidden (${pattern})`,
    );
  }
}

function assertStrictApiPresetHelperContract(source, label) {
  const apiLogin = extractFunction(source, "apiLogin");
  const apiGet = extractFunction(source, "apiGet");
  const apiPost = extractFunction(source, "apiPost");
  const apiRequest = extractFunction(source, "apiRequest");
  const parseApiResponse = extractFunction(source, "parseApiResponse");

  assert.match(
    apiLogin,
    /apiGet\(\s*context,\s*["']\/auth\/csrf["'],\s*200\s*\)/,
    `${label}: CSRF request must explicitly expect HTTP 200`,
  );
  assert.match(
    apiLogin,
    /apiPost\([\s\S]*?["']\/auth\/login["'][\s\S]*?,\s*201,?\s*\)/,
    `${label}: login request must explicitly expect HTTP 201`,
  );
  assert.match(
    apiGet,
    /async function apiGet\(context, path, expectedStatus\)[\s\S]*apiRequest\(context, ["']GET["'], path, \{\}, expectedStatus\)/,
    `${label}: GET helper must require and forward an expected status`,
  );
  assert.match(
    apiPost,
    /async function apiPost\(context, path, body, expectedStatus\)[\s\S]*apiRequest\(context, ["']POST["'], path, \{ data: body \}, expectedStatus\)/,
    `${label}: POST helper must require and forward an expected status`,
  );
  assert.match(
    apiRequest,
    /async function apiRequest\(context, method, path, options, expectedStatus\)/,
    `${label}: request helper must not default its options or expected status`,
  );
  assert.match(
    apiRequest,
    /parseApiResponse\(response, normalizedMethod, path, expectedStatus\)/,
    `${label}: request helper must forward the expected status to the parser`,
  );
  assert.doesNotMatch(
    apiRequest + parseApiResponse,
    /response\.ok\s*\(/,
    `${label}: response.ok() must not replace an exact status assertion`,
  );
  assert.match(
    parseApiResponse,
    /response\.status\(\) !== expectedStatus/,
    `${label}: response parser must compare the exact HTTP status`,
  );
  assert.match(
    parseApiResponse,
    /if \(!text\)[\s\S]*empty JSON response/,
    `${label}: a successful JSON response must not be empty`,
  );
  assert.match(
    parseApiResponse,
    /return JSON\.parse\(text\);/,
    `${label}: a successful response must contain valid JSON`,
  );
  assert.doesNotMatch(
    parseApiResponse,
    /\?\s*JSON\.parse\([^)]*\)\s*:\s*null/,
    `${label}: an empty successful response must not become null`,
  );
}

function loadApiPresetHelpers(source, requestFactory = playwrightRequest) {
  const names = [
    "createRoleApiClients",
    "disposeRoleApiClients",
    "apiLogin",
    "apiGet",
    "apiPost",
    "apiRequest",
    "requireApiCookie",
    "parseApiResponse",
  ];
  const declarations = apiPresetHelperDeclarations(source);
  assertNoManualCookieHeaderInjection(declarations, "API preset helpers");
  assert.doesNotMatch(
    declarations,
    /\bAuthorization\b|\bBearer\b|\bfallback\b|\bretr(?:y|ies)\b/i,
  );
  return Function(
    "playwrightRequest",
    "playwrightAccountPassword",
    `${declarations}\nreturn { ${names.join(", ")} };`,
  )(requestFactory, apiPresetAccountPassword);
}

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing API preset helper: ${name}`);
  const parametersStart = source.indexOf("(", start);
  let parametersDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parametersDepth += 1;
    if (source[index] === ")") parametersDepth -= 1;
    if (parametersDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.notEqual(
    parametersEnd,
    -1,
    `Unterminated API preset helper parameters: ${name}`,
  );
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unterminated API preset helper: ${name}`);
}

async function startApiAuthContractServer(t) {
  const events = [];
  const sessions = new Map();
  let csrfSequence = 0;
  let mismatchNextCsrf = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";
    const cookies = parseCookies(request.headers.cookie);
    const body = await readJsonBody(request);
    const event = {
      method,
      path: url.pathname,
      account: body?.account,
      password: body?.password,
      cookies,
      csrf: request.headers["x-csrf-token"],
    };
    events.push(event);

    if (method === "GET" && url.pathname === "/auth/csrf") {
      const csrfToken = `${String(++csrfSequence).padStart(3, "0")}${"c".repeat(40)}`;
      const responseToken = mismatchNextCsrf ? `${"m".repeat(43)}` : csrfToken;
      mismatchNextCsrf = false;
      sendJson(response, 200, { csrfToken: responseToken }, [
        `rehab_csrf=${csrfToken}; Path=/; SameSite=Lax`,
      ]);
      return;
    }

    if (method === "POST" && url.pathname === "/auth/login") {
      if (event.csrf !== cookies.rehab_csrf) {
        sendJson(response, 403, { message: "invalid csrf" });
        return;
      }
      if (body?.account === "missing-session") {
        sendJson(response, 201, {
          status: "authenticated",
          user: { id: "missing-session-user", account: body.account },
          context: { patientIds: [] },
        });
        return;
      }
      const session = `${body.account}-session`;
      sessions.set(body.account, { csrf: cookies.rehab_csrf, session });
      sendJson(
        response,
        201,
        {
          status: "authenticated",
          user: { id: `${body.account}-user`, account: body.account },
          context: {
            patientIds: body.account === "patient001" ? ["patient-001"] : [],
          },
        },
        [`rehab_session=${session}; Path=/; HttpOnly; SameSite=Lax`],
      );
      return;
    }

    if (url.pathname === "/failure") {
      sendJson(response, 503, { message: "forced failure" });
      return;
    }

    if (url.pathname.startsWith("/protected/")) {
      const account = decodeURIComponent(
        url.pathname.slice("/protected/".length),
      );
      const expected = sessions.get(account);
      if (!expected || cookies.rehab_session !== expected.session) {
        sendJson(response, 401, { message: "wrong session" });
        return;
      }
      if (!["GET", "HEAD"].includes(method) && event.csrf !== expected.csrf) {
        sendJson(response, 403, { message: "invalid csrf" });
        return;
      }
      sendJson(response, 200, { account, method });
      return;
    }

    sendJson(response, 404, { message: "not found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    events,
    mismatchNextCsrfResponse() {
      mismatchNextCsrf = true;
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseCookies(header) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), item.slice(separator + 1)];
      }),
  );
}

function sendJson(response, status, body, cookies = []) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {}),
  });
  response.end(JSON.stringify(body));
}
