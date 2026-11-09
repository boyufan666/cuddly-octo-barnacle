import assert from "node:assert/strict";
import test from "node:test";

test("API requests use credentialed cookies, CSRF headers, and never Bearer tokens", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        throw new Error("Web must not read an API-host cookie");
      },
    },
  });
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    if (String(input).endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({ csrfToken: "csrf-response-token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({ user: { id: "user-id" }, homePath: "/", context: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const { api } = await import("./api");
  await api.csrf();
  await api.me();
  await api.createConsent({
    patientId: "patient-id",
    subjectUserId: "user-id",
    consentType: "privacy_policy",
    consentVersion: "v1.2",
    evidenceSnapshot: {},
  });

  assert.equal(calls[1][1]?.credentials, "include");
  assert.equal(new Headers(calls[1][1]?.headers).has("authorization"), false);
  assert.equal(calls[2][1]?.credentials, "include");
  assert.equal(
    new Headers(calls[2][1]?.headers).get("x-csrf-token"),
    "csrf-response-token",
  );
  assert.equal(new Headers(calls[2][1]?.headers).has("authorization"), false);
  assert.deepEqual(JSON.parse(String(calls[2][1]?.body)), {
    patientId: "patient-id",
    subjectUserId: "user-id",
    consentType: "privacy_policy",
    consentVersion: "v1.2",
    evidenceSnapshot: {},
  });
});

test("login and public registration fetch a CSRF token before posting", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        throw new Error("Web must not read an API-host cookie");
      },
    },
  });
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    const path = String(input);
    if (path.endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({ csrfToken: "issued-public-token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ status: "authenticated" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const { api } = await import("./api");
  await api.login("patient001", "password");
  await api.createRegistrationRequest({
    requestedRole: "caregiver",
    account: "caregiver_new",
    initialPassword: "password",
    displayName: "家属",
  });

  assert.deepEqual(
    calls.map(([url]) => String(url).replace("http://localhost:3001", "")),
    ["/auth/csrf", "/auth/login", "/auth/csrf", "/auth/registration-requests"],
  );
  assert.equal(
    new Headers(calls[1][1]?.headers).get("x-csrf-token"),
    "issued-public-token",
  );
  assert.equal(
    new Headers(calls[3][1]?.headers).get("x-csrf-token"),
    "issued-public-token",
  );
});

test("training session resume and abort post to lifecycle paths with CSRF protection", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    if (String(input).endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({ csrfToken: "training-lifecycle-token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ id: "session-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const { api } = await import("./api");
  await api.csrf();
  await api.resumeTrainingSession("session-1");
  await api.abortTrainingSession("session-1", {
    reason: "患者主动要求停止",
  });

  assert.deepEqual(
    calls.map(([url]) => String(url).replace("http://localhost:3001", "")),
    [
      "/auth/csrf",
      "/training-sessions/session-1/resume",
      "/training-sessions/session-1/abort",
    ],
  );
  assert.equal(calls[1][1]?.method, "POST");
  assert.equal(calls[2][1]?.method, "POST");
  assert.equal(
    new Headers(calls[1][1]?.headers).get("x-csrf-token"),
    "training-lifecycle-token",
  );
  assert.equal(
    new Headers(calls[2][1]?.headers).get("x-csrf-token"),
    "training-lifecycle-token",
  );
  assert.deepEqual(JSON.parse(String(calls[2][1]?.body)), {
    reason: "患者主动要求停止",
  });
});

test("high-cost API calls require and preserve caller-owned idempotency keys", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    if (String(input).endsWith("/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "high-cost-csrf" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const { api } = await import("./api");
  await api.csrf();
  assert.throws(
    () =>
      api.createAiAssessmentDraft({
        patientId: "patient-id",
        transcript: "缺少幂等键",
      } as never),
    /缺少有效幂等键/,
  );
  assert.equal(calls.length, 1);

  await api.createAiAssessmentDraft({
    patientId: "patient-id",
    assessmentType: "AD-8",
    physicalConditions: ["wheelchair", "upper_limb_limited"],
    transcript: "评估转写",
    idempotencyKey: "ai-draft-key",
  });
  await api.appendAiConversationMessage("conversation-id", {
    content: "对话内容",
    idempotencyKey: "conversation-key",
  });
  await api.createAssessmentSpeechTranscript({
    patientId: "patient-id",
    idempotencyKey: "speech-key",
    audio: {
      contentBase64: "YXVkaW8=",
      mimeType: "audio/wav",
      durationSeconds: 1,
    },
  });
  await api.createTtsSpeechOutput({
    patientId: "patient-id",
    text: "播放文本",
    idempotencyKey: "tts-key",
  });

  const bodies = calls
    .slice(1)
    .map(
      ([, options]) =>
        JSON.parse(String(options?.body)) as { idempotencyKey?: string },
    );
  assert.deepEqual(
    bodies.map((body) => body.idempotencyKey),
    ["ai-draft-key", "conversation-key", "speech-key", "tts-key"],
  );
  assert.deepEqual(
    (bodies[0] as { physicalConditions?: string[] }).physicalConditions,
    ["wheelchair", "upper_limb_limited"],
  );
});

test("data export transport sends the canonical payload unchanged", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001";
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    if (String(input).endsWith("/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "export-csrf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("\uFEFFpatientExportId,maskedName\npatient_abc,患*", {
      status: 200,
      headers: {
        "Content-Disposition":
          'attachment; filename="rehab-patients-2026-07-17.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }) as typeof fetch;

  const { api } = await import("./api");
  await api.csrf();
  const exported = await api.exportData({
    dataset: "patients",
    format: "csv",
    reason: " canonical export reason ",
    dateFrom: "2026-07-17T00:00:00.000Z",
    dateTo: "2026-07-17T01:00:00.000Z",
    patientId: "patient-id",
    limit: 1,
  });

  assert.deepEqual(
    calls.map(([url]) => String(url).replace("http://localhost:3001", "")),
    ["/auth/csrf", "/admin/exports/patients"],
  );
  assert.equal(calls[1][1]?.method, "POST");
  assert.equal(calls[1][1]?.credentials, "include");
  assert.equal(
    new Headers(calls[1][1]?.headers).get("x-csrf-token"),
    "export-csrf-token",
  );
  assert.deepEqual(JSON.parse(String(calls[1][1]?.body)), {
    format: "csv",
    reason: " canonical export reason ",
    dateFrom: "2026-07-17T00:00:00.000Z",
    dateTo: "2026-07-17T01:00:00.000Z",
    patientId: "patient-id",
    limit: 1,
  });
  assert.equal(exported.filename, "rehab-patients-2026-07-17.csv");
  assert.deepEqual(
    new Uint8Array(await exported.blob.arrayBuffer()),
    new TextEncoder().encode(
      "\uFEFFpatientExportId,maskedName\npatient_abc,患*",
    ),
  );
});
