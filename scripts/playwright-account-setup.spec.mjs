import { expect, request as playwrightRequest, test } from "@playwright/test";

import { resolvePlaywrightRegressionEnvironment } from "./playwright-regression-environment.mjs";

const input = resolvePlaywrightRegressionEnvironment();
const apiBaseUrl = `http://127.0.0.1:${input.apiPort}`;

test("seeded role accounts complete the required first-login password reset", async () => {
  for (const account of input.requiredAccounts) {
    await resetSeededAccount(account);
  }
});

async function resetSeededAccount(account) {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseUrl });
  try {
    const initialCsrf = await fetchCsrf(context, account);
    const loginResponse = await context.post("/auth/login", {
      data: { account, password: input.seedPassword },
      headers: { "X-CSRF-Token": initialCsrf },
    });
    expect(loginResponse.status(), `${account} initial login status`).toBe(201);
    expect(
      await loginResponse.json(),
      `${account} initial login response`,
    ).toMatchObject({
      status: "password_reset_required",
    });
    await requireCookie(context, "rehab_password_reset", account);

    const resetResponse = await context.post("/auth/password-reset", {
      data: { newPassword: input.accountPassword },
      headers: { "X-CSRF-Token": initialCsrf },
    });
    expect(resetResponse.status(), `${account} password reset status`).toBe(
      200,
    );
    expect(
      await resetResponse.json(),
      `${account} password reset response`,
    ).toEqual({
      status: "password_reset_complete",
    });

    const authenticatedCsrf = await fetchCsrf(context, account);
    const authenticatedResponse = await context.post("/auth/login", {
      data: { account, password: input.accountPassword },
      headers: { "X-CSRF-Token": authenticatedCsrf },
    });
    expect(
      authenticatedResponse.status(),
      `${account} authenticated login status`,
    ).toBe(201);
    expect(
      await authenticatedResponse.json(),
      `${account} authenticated login response`,
    ).toMatchObject({ status: "authenticated" });
    await requireCookie(context, "rehab_session", account);

    const logoutResponse = await context.post("/auth/logout", {
      headers: { "X-CSRF-Token": authenticatedCsrf },
    });
    expect(logoutResponse.status(), `${account} logout status`).toBe(200);
  } finally {
    await context.dispose();
  }
}

async function fetchCsrf(context, account) {
  const response = await context.get("/auth/csrf");
  expect(response.status(), `${account} CSRF status`).toBe(200);
  const body = await response.json();
  const cookie = await requireCookie(context, "rehab_csrf", account);
  expect(body, `${account} CSRF response`).toEqual({ csrfToken: cookie });
  return cookie;
}

async function requireCookie(context, name, account) {
  const state = await context.storageState();
  const matches = state.cookies.filter((cookie) => cookie.name === name);
  expect(matches, `${account} ${name} cookie count`).toHaveLength(1);
  expect(matches[0].value, `${account} ${name} cookie value`).not.toBe("");
  return matches[0].value;
}
