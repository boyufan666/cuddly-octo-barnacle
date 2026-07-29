import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { CookieSessionClient } from "../local-contract-cookie-session.mjs";

const roleAccounts = ["patient", "caregiver", "admin", "auditor", "doctor"];

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), item.slice(separator + 1)];
      }),
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, body, cookies = []) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  if (cookies.length) response.setHeader("Set-Cookie", cookies);
  response.end(JSON.stringify(body));
}

function csrfToken(index) {
  return `${String(index).padStart(2, "0")}${"c".repeat(41)}`;
}

async function startAuthBoundary() {
  let csrfSequence = 0;
  const events = [];
  const sessions = new Map();
  const issuedCsrfAt = new Map();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const cookies = parseCookies(request.headers.cookie);
      const event = {
        path: url.pathname,
        method: request.method,
        cookie: request.headers.cookie ?? "",
        csrf: request.headers["x-csrf-token"],
        authorization: request.headers.authorization,
      };
      events.push(event);

      if (request.method === "GET" && url.pathname === "/auth/csrf") {
        const token = csrfToken(++csrfSequence);
        issuedCsrfAt.set(token, events.length - 1);
        sendJson(response, 200, { csrfToken: token }, [
          `rehab_csrf=${token}; Path=/; SameSite=Lax`,
        ]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const body = await readJson(request);
        event.account = body.account;
        event.password = body.password;
        assert.equal(cookies.rehab_csrf, request.headers["x-csrf-token"]);
        assert.ok(issuedCsrfAt.has(cookies.rehab_csrf));

        if (body.account === "reset-required") {
          sendJson(
            response,
            201,
            {
              status: "password_reset_required",
              user: { id: "reset-user" },
              responseSecret: "reset-response-secret",
            },
            [
              "rehab_session=; Path=/; Max-Age=0; HttpOnly",
              "rehab_password_reset=reset-session; Path=/; HttpOnly",
            ],
          );
          return;
        }

        const session = `${body.account}-session-v1`;
        const nextCsrf = csrfToken(++csrfSequence);
        sessions.set(body.account, { session, csrf: nextCsrf });
        sendJson(
          response,
          201,
          body.account === "missing-context"
            ? {
                status: "authenticated",
                user: { id: body.account },
                responseSecret: "shape-response-secret",
              }
            : body.account === "unexpected-status"
              ? {
                  status: "pending",
                  user: { id: body.account },
                  context: { primaryRole: body.account },
                  responseSecret: "shape-response-secret",
                }
              : {
                  status: "authenticated",
                  user: { id: body.account },
                  context: { primaryRole: body.account },
                  responseSecret:
                    body.account === "missing-session"
                      ? "missing-session-response-secret"
                      : undefined,
                },
          body.account === "missing-session"
            ? [`rehab_csrf=${nextCsrf}; Path=/; SameSite=Lax`]
            : [
                `rehab_session=${session}; Path=/; HttpOnly`,
                `rehab_csrf=${nextCsrf}; Path=/; SameSite=Lax`,
              ],
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/scoped-session"
      ) {
        sendJson(response, 200, { stored: true }, [
          "rehab_session=scoped-session; Path=/scoped; HttpOnly",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/delete-scoped-session"
      ) {
        sendJson(response, 200, { deleted: true }, [
          "rehab_session=; Path=/scoped; Max-Age=0; HttpOnly",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/max-age-precedence"
      ) {
        sendJson(response, 200, { stored: true }, [
          "positive_age=kept; Path=/priority; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
          "zero_age=deleted; Path=/priority; Max-Age=0; Expires=Tue, 19 Jan 2038 03:14:07 GMT",
          "expires_only=deleted; Path=/priority; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/multiple-with-expires"
      ) {
        sendJson(response, 200, { stored: true }, [
          "comma_one=one; Path=/multi; Expires=Tue, 19 Jan 2038 03:14:07 GMT",
          "comma_two=two; Path=/multi; Expires=Tue, 19 Jan 2038 03:14:07 GMT",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/secure"
      ) {
        sendJson(response, 200, { stored: true }, [
          "secure_only=secret; Path=/; Secure; HttpOnly",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/foo-path"
      ) {
        sendJson(response, 200, { stored: true }, [
          "path_boundary=foo; Path=/foo",
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/cookie-fixture/scoped-csrf"
      ) {
        sendJson(response, 200, { stored: true }, [
          `rehab_csrf=${"s".repeat(43)}; Path=/scoped; SameSite=Lax`,
        ]);
        return;
      }

      if (
        request.method === "GET" &&
        [
          "/scoped/echo",
          "/outside/echo",
          "/priority/echo",
          "/multi/echo",
          "/foo/echo",
          "/foobar/echo",
        ].includes(url.pathname)
      ) {
        sendJson(response, 200, { cookie: request.headers.cookie ?? "" });
        return;
      }

      if (url.pathname === "/scoped/change" && request.method === "POST") {
        sendJson(response, 200, {
          cookie: request.headers.cookie ?? "",
          csrf: request.headers["x-csrf-token"],
        });
        return;
      }

      if (url.pathname === "/protected-change" && request.method === "POST") {
        const account = roleAccounts.find(
          (role) => sessions.get(role)?.session === cookies.rehab_session,
        );
        assert.ok(account, "protected mutation must receive one role session");
        assert.equal(cookies.rehab_csrf, sessions.get(account).csrf);
        assert.equal(request.headers["x-csrf-token"], cookies.rehab_csrf);
        for (const otherRole of roleAccounts.filter(
          (role) => role !== account,
        )) {
          assert.equal(event.cookie.includes(`${otherRole}-session`), false);
        }

        const nextSession = `${account}-session-v2`;
        const nextCsrf = csrfToken(++csrfSequence);
        sessions.set(account, { session: nextSession, csrf: nextCsrf });
        sendJson(response, 200, { account }, [
          `rehab_session=${nextSession}; Path=/; HttpOnly`,
          `rehab_csrf=${nextCsrf}; Path=/; SameSite=Lax`,
        ]);
        return;
      }

      if (url.pathname === "/protected-read" && request.method === "GET") {
        const account = roleAccounts.find(
          (role) => sessions.get(role)?.session === cookies.rehab_session,
        );
        assert.ok(
          account,
          "protected read must receive the current role session",
        );
        assert.equal(cookies.rehab_csrf, sessions.get(account).csrf);
        for (const otherRole of roleAccounts.filter(
          (role) => role !== account,
        )) {
          assert.equal(event.cookie.includes(`${otherRole}-session`), false);
        }
        sendJson(response, 200, { account });
        return;
      }

      if (url.pathname === "/clear-session" && request.method === "POST") {
        assert.equal(cookies.rehab_csrf, request.headers["x-csrf-token"]);
        sendJson(response, 200, { cleared: true }, [
          "rehab_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly",
        ]);
        return;
      }

      if (url.pathname === "/echo-cookies" && request.method === "GET") {
        sendJson(response, 200, { cookies });
        return;
      }

      sendJson(response, 404, { message: "not found" });
    } catch (error) {
      sendJson(response, 500, { message: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    events,
    issuedCsrfAt,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("each role keeps an isolated cookie and CSRF session across real HTTP requests", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const clients = new Map(
    roleAccounts.map((account) => [
      account,
      new CookieSessionClient(boundary.baseUrl),
    ]),
  );

  for (const account of roleAccounts) {
    const result = await clients
      .get(account)
      .login(account, `${account}-secret`);
    assert.equal(result.status, "authenticated");
    assert.equal(result.context.primaryRole, account);
  }

  for (const account of roleAccounts) {
    const changed = await clients.get(account).request("/protected-change", {
      method: "POST",
      body: { account },
    });
    assert.equal(changed.account, account);
    const read = await clients.get(account).request("/protected-read");
    assert.equal(read.account, account);
  }

  const loginEvents = boundary.events.filter(
    (event) => event.path === "/auth/login",
  );
  assert.equal(loginEvents.length, roleAccounts.length);
  for (const event of loginEvents) {
    assert.equal(event.password, `${event.account}-secret`);
    assert.ok(
      boundary.issuedCsrfAt.get(event.csrf) < boundary.events.indexOf(event),
    );
    assert.match(event.cookie, /rehab_csrf=/);
    assert.doesNotMatch(event.cookie, /rehab_session=/);
  }

  await clients.get("patient").request("/clear-session", { method: "POST" });
  const patientCookies = await clients.get("patient").request("/echo-cookies");
  assert.equal(patientCookies.cookies.rehab_session, undefined);
  const adminRead = await clients.get("admin").request("/protected-read");
  assert.equal(adminRead.account, "admin");
});

test("login rejects reset-required and malformed states without reset, retry, or substitution", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);

  const cases = [
    [
      "reset-required",
      "Cookie 会话登录失败：password_reset_required，需先人工完成密码重置。",
    ],
    ["missing-context", "Cookie 会话登录响应格式无效。"],
    ["unexpected-status", "Cookie 会话登录响应格式无效。"],
    ["missing-session", "Cookie 会话登录缺少 rehab_session cookie。"],
  ];
  for (const [account, expectedMessage] of cases) {
    const client = new CookieSessionClient(boundary.baseUrl);
    const password = `${account}-original-secret`;
    await assert.rejects(client.login(account, password), (error) => {
      assert.equal(error.message, expectedMessage);
      for (const sensitiveValue of [
        account,
        password,
        "reset-response-secret",
        "shape-response-secret",
        "missing-session-response-secret",
      ]) {
        assert.equal(error.message.includes(sensitiveValue), false);
      }
      return true;
    });
  }

  for (const account of cases.map(([name]) => name)) {
    const accountEvents = boundary.events.filter(
      (event) => event.account === account,
    );
    assert.equal(accountEvents.length, 1);
    assert.equal(accountEvents[0].password, `${account}-original-secret`);
  }
  assert.equal(
    boundary.events.some((event) => event.path === "/auth/password-reset"),
    false,
  );
});

test("request failures expose only fixed categories for HTTP responses and malicious errors", async (t) => {
  const account = "request-account-sensitive";
  const password = "request-password-sensitive";
  const responseSecret = "response-payload-sensitive";
  const maliciousErrorSecret = "malicious-error-sensitive";
  t.mock.method(globalThis, "fetch", async (input) => {
    const requestUrl = new URL(input);
    if (requestUrl.pathname === "/http-error") {
      const response = new Response(
        JSON.stringify({ account, password, responseSecret }),
        { status: 502, statusText: "Sensitive upstream response" },
      );
      Object.defineProperty(response, "url", { value: requestUrl.href });
      return response;
    }
    throw new Error(
      `${maliciousErrorSecret} ${account} ${password} ${responseSecret}`,
    );
  });
  const client = new CookieSessionClient("https://rehab.example.com");

  for (const [path, expectedMessage] of [
    ["/http-error", "HTTP 502：Cookie 会话请求失败。"],
    ["/malicious-error", "Cookie 会话请求失败。"],
  ]) {
    await assert.rejects(client.request(path), (error) => {
      assert.equal(error.message, expectedMessage);
      for (const sensitiveValue of [
        account,
        password,
        responseSecret,
        maliciousErrorSecret,
      ]) {
        assert.equal(error.message.includes(sensitiveValue), false);
      }
      return true;
    });
  }
});

test("request callers cannot inject cookies or CSRF state", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);

  const echoed = await client.request("/echo-cookies", {
    headers: {
      Cookie: "rehab_session=forged-session; rehab_csrf=forged-csrf",
      "x-csrf-token": "forged-csrf",
    },
  });

  assert.deepEqual(echoed.cookies, {});
  const event = boundary.events.at(-1);
  assert.equal(event.cookie, "");
  assert.equal(event.csrf, undefined);
});

test("request callers cannot pass an Authorization header with arbitrary casing", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);
  const headers = new Headers();
  headers.set("aUtHoRiZaTiOn", "Basic reviewer-probe");

  await client.request("/echo-cookies", { headers });

  assert.equal(boundary.events.at(-1).authorization, undefined);
});

test("same-name cookies are matched and deleted by Path without losing the root session", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);
  await client.login("patient", "patient-secret");

  await client.request("/cookie-fixture/scoped-session");
  const scoped = await client.request("/scoped/echo");
  assert.match(scoped.cookie, /rehab_session=scoped-session/);
  assert.match(scoped.cookie, /rehab_session=patient-session-v1/);
  assert.ok(
    scoped.cookie.indexOf("rehab_session=scoped-session") <
      scoped.cookie.indexOf("rehab_session=patient-session-v1"),
  );
  const outside = await client.request("/outside/echo");
  assert.doesNotMatch(outside.cookie, /scoped-session/);
  assert.match(outside.cookie, /rehab_session=patient-session-v1/);

  await client.request("/cookie-fixture/delete-scoped-session");
  const afterDelete = await client.request("/scoped/echo");
  assert.doesNotMatch(afterDelete.cookie, /scoped-session/);
  assert.match(afterDelete.cookie, /rehab_session=patient-session-v1/);
  const protectedRead = await client.request("/protected-read");
  assert.equal(protectedRead.account, "patient");
});

test("Max-Age overrides Expires and multiple Set-Cookie values preserve Expires commas", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);

  await client.request("/cookie-fixture/max-age-precedence");
  const priority = await client.request("/priority/echo");
  assert.match(priority.cookie, /positive_age=kept/);
  assert.doesNotMatch(priority.cookie, /zero_age=/);
  assert.doesNotMatch(priority.cookie, /expires_only=/);

  await client.request("/cookie-fixture/multiple-with-expires");
  const multiple = await client.request("/multi/echo");
  assert.match(multiple.cookie, /comma_one=one/);
  assert.match(multiple.cookie, /comma_two=two/);
});

test("Secure cookies from HTTP responses are withheld from HTTP and match HTTPS only", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);

  await client.request("/cookie-fixture/secure");
  const httpCookies = await client.request("/echo-cookies");
  assert.equal(httpCookies.cookies.secure_only, undefined);

  let httpsCookieHeader;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const requestUrl = new URL(input);
    assert.equal(requestUrl.protocol, "https:");
    httpsCookieHeader = new Headers(options.headers).get("cookie");
    const response = new Response(JSON.stringify({ matched: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(response, "url", { value: requestUrl.href });
    return response;
  });

  const httpsUrl = new URL(boundary.baseUrl);
  httpsUrl.protocol = "https:";
  httpsUrl.pathname = "/echo-cookies";
  await client.request(httpsUrl.href);
  assert.match(httpsCookieHeader, /secure_only=secret/);
});

test("Path segment boundaries prevent /foo cookies from matching /foobar", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);

  await client.request("/cookie-fixture/foo-path");
  const foo = await client.request("/foo/echo");
  const foobar = await client.request("/foobar/echo");

  assert.match(foo.cookie, /path_boundary=foo/);
  assert.doesNotMatch(foobar.cookie, /path_boundary=foo/);
});

test("scoped CSRF cookie supplies the matching request header before the root token", async (t) => {
  const boundary = await startAuthBoundary();
  t.after(boundary.close);
  const client = new CookieSessionClient(boundary.baseUrl);
  await client.login("patient", "patient-secret");
  await client.request("/cookie-fixture/scoped-csrf");

  const changed = await client.request("/scoped/change", { method: "POST" });
  const scopedToken = "s".repeat(43);
  const csrfCookies = changed.cookie.match(/rehab_csrf=[^;]+/g);

  assert.equal(changed.csrf, scopedToken);
  assert.equal(csrfCookies.length, 2);
  assert.equal(csrfCookies[0], `rehab_csrf=${scopedToken}`);
});
