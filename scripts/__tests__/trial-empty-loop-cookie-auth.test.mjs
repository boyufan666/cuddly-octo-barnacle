import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const scriptPath = resolve(
  import.meta.dirname,
  "../verify-trial-empty-loop.mjs",
);

const credentialEnvNames = [
  "TRIAL_VERIFY_ADMIN_ACCOUNT",
  "TRIAL_VERIFY_ADMIN_PASSWORD",
  "TRIAL_VERIFY_DOCTOR_ACCOUNT",
  "TRIAL_VERIFY_DOCTOR_PASSWORD",
  "TRIAL_VERIFY_PATIENT_ACCOUNT",
  "TRIAL_VERIFY_PATIENT_PASSWORD",
];

function completeEnv(apiBaseUrl) {
  return {
    TRIAL_VERIFY_API_BASE_URL: apiBaseUrl,
    TRIAL_VERIFY_ADMIN_ACCOUNT: "admin-account",
    TRIAL_VERIFY_ADMIN_PASSWORD: "admin-password",
    TRIAL_VERIFY_DOCTOR_ACCOUNT: "doctor-account",
    TRIAL_VERIFY_DOCTOR_PASSWORD: "doctor-password",
    TRIAL_VERIFY_PATIENT_ACCOUNT: "patient-account",
    TRIAL_VERIFY_PATIENT_PASSWORD: "patient-password",
    TRIAL_VERIFY_PATIENT_NAME: "验收患者",
    TRIAL_VERIFY_PATIENT_GENDER: "unspecified",
    TRIAL_VERIFY_PATIENT_AGE: "70",
    TRIAL_VERIFY_ASSESSMENT_MMSE: "24",
    TRIAL_VERIFY_ASSESSMENT_CDR: "0.5",
    TRIAL_VERIFY_ASSESSMENT_MEMORY: "0.8",
    TRIAL_VERIFY_ASSESSMENT_ORIENTATION: "0.9",
    TRIAL_VERIFY_ASSESSMENT_EXECUTIVE: "0.7",
    TRIAL_VERIFY_ASSESSMENT_LANGUAGE: "0.85",
    TRIAL_VERIFY_ASSESSMENT_TRANSCRIPT: "结构化评估记录",
    TRIAL_VERIFY_ASSESSMENT_ANALYSIS_SUMMARY: "轻度认知风险",
    TRIAL_VERIFY_ASSESSMENT_MODEL_VERSION: "clinician-record-v1",
    TRIAL_VERIFY_ASSESSMENT_CONFIDENCE: "0.9",
    TRIAL_VERIFY_GAME_CODE: "trial-game",
    TRIAL_VERIFY_GAME_NAME: "试点姿态训练",
    TRIAL_VERIFY_GAME_VERSION: "1.0.0",
    TRIAL_VERIFY_GAME_TRAINING_TARGETS: "attention,reaction,upper_limb",
    TRIAL_VERIFY_GAME_TAGS: "camera_pose,moderate_intensity",
    TRIAL_VERIFY_GAME_DEFAULT_DURATION: "15",
    TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY: "medium",
    TRIAL_VERIFY_COLLECTION_CONDITION_CODE: "trial-condition",
    TRIAL_VERIFY_COLLECTION_CONDITION_NAME: "试点采集条件",
    TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE: "trial-protocol",
    TRIAL_VERIFY_COLLECTION_PROTOCOL_NAME: "试点采集协议",
    TRIAL_VERIFY_COLLECTION_PROTOCOL_VERSION: "1.0.0",
    TRIAL_VERIFY_RESULT_SCORE: "88",
    TRIAL_VERIFY_RESULT_COMPLETION_RATE: "0.95",
    TRIAL_VERIFY_RESULT_DURATION_SECONDS: "180",
    TRIAL_VERIFY_RESULT_REACTION_TIME_MS: "420",
    TRIAL_VERIFY_RESULT_MOTION_ACCURACY: "0.91",
    TRIAL_VERIFY_RESULT_EXERCISE_INTENSITY: "moderate",
    TRIAL_VERIFY_METRIC_REACTION_TIME_MS: "420",
    TRIAL_VERIFY_METRIC_REACTION_SAMPLE_COUNT: "30",
    TRIAL_VERIFY_METRIC_REACTION_CONFIDENCE: "0.93",
    TRIAL_VERIFY_METRIC_TARGET_HIT_RATE: "0.9",
    TRIAL_VERIFY_METRIC_TARGET_SAMPLE_COUNT: "30",
    TRIAL_VERIFY_METRIC_TARGET_CONFIDENCE: "0.92",
    TRIAL_VERIFY_METRIC_POSE_VISIBILITY_AVG: "0.94",
    TRIAL_VERIFY_METRIC_POSE_SAMPLE_COUNT: "30",
    TRIAL_VERIFY_METRIC_POSE_CONFIDENCE: "0.95",
    TRIAL_VERIFY_METRIC_ARM_RAISE_ACCURACY: "0.89",
    TRIAL_VERIFY_METRIC_ARM_SAMPLE_COUNT: "30",
    TRIAL_VERIFY_METRIC_ARM_CONFIDENCE: "0.91",
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), part.slice(separator + 1)];
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
  if (cookies.length > 0) response.setHeader("Set-Cookie", cookies);
  response.end(JSON.stringify(body));
}

function runScript(apiBaseUrl, { missingEnv, extraEnv = {} } = {}) {
  const env = {
    ...process.env,
    ...completeEnv(apiBaseUrl),
    ...extraEnv,
  };
  if (missingEnv) delete env[missingEnv];

  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: resolve(import.meta.dirname, "../.."),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolveResult({ code, signal, stdout, stderr });
    });
  });
}

async function startTrialBoundary({ resetAccount } = {}) {
  const events = [];
  const sessions = new Map();
  let csrfSequence = 0;
  let consentSequence = 0;

  const csrfToken = () => `csrf-${++csrfSequence}-${"c".repeat(32)}`;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const cookies = parseCookies(request.headers.cookie);
    const event = {
      method: request.method,
      path: url.pathname,
      cookie: request.headers.cookie ?? "",
      csrf: request.headers["x-csrf-token"],
      authorization: request.headers.authorization,
    };
    events.push(event);

    try {
      if (request.method === "GET" && url.pathname === "/health/live") {
        sendJson(response, 200, {
          status: "live",
          service: "rehab-platform-api",
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/csrf") {
        const csrf = csrfToken();
        sendJson(response, 200, { csrfToken: csrf }, [
          `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
        ]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const body = await readJson(request);
        event.body = body;
        assert.equal(request.headers["x-csrf-token"], cookies.rehab_csrf);
        assert.match(cookies.rehab_csrf ?? "", /^csrf-/);
        assert.equal(cookies.rehab_session, undefined);

        if (body.account === resetAccount) {
          sendJson(response, 201, {
            status: "password_reset_required",
            user: { id: `${body.account}-user` },
          });
          return;
        }

        const role = body.account.split("-")[0];
        assert.equal(body.password, `${role}-password`);
        const session = `${role}-session`;
        const nextCsrf = csrfToken();
        sessions.set(role, { session, csrf: nextCsrf });

        const context =
          role === "admin"
            ? {
                primaryRole: "admin_super",
                adminPermissions: [
                  "user.manage",
                  "game.manage",
                  "game.publish",
                ],
              }
            : role === "doctor"
              ? { primaryRole: "doctor", doctorIds: ["doctor-1"] }
              : { primaryRole: "patient", patientIds: ["patient-1"] };
        sendJson(
          response,
          201,
          {
            status: "authenticated",
            user: { id: `${role}-user` },
            context,
          },
          [
            `rehab_session=${session}; Path=/; HttpOnly`,
            `rehab_csrf=${nextCsrf}; Path=/; SameSite=Lax`,
          ],
        );
        return;
      }

      const expectedRole = expectedRoleFor(request.method, url.pathname);
      assert.ok(
        expectedRole,
        `unexpected route ${request.method} ${url.pathname}`,
      );
      const roleSession = sessions.get(expectedRole);
      assert.ok(
        roleSession,
        `${expectedRole} must log in before protected requests`,
      );
      assert.equal(cookies.rehab_session, roleSession.session);
      assert.equal(cookies.rehab_csrf, roleSession.csrf);
      assert.equal(request.headers.authorization, undefined);
      for (const otherRole of ["admin", "doctor", "patient"].filter(
        (role) => role !== expectedRole,
      )) {
        assert.equal(event.cookie.includes(`${otherRole}-session`), false);
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        assert.equal(request.headers["x-csrf-token"], roleSession.csrf);
      }

      const body =
        request.method === "GET" ? undefined : await readJson(request);
      event.body = body;

      if (request.method === "POST" && url.pathname === "/patients") {
        sendJson(response, 201, {
          id: "patient-1",
          responsibleDoctorId: "doctor-1",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/consents") {
        sendJson(response, 201, {
          id: `consent-${++consentSequence}`,
          status: "granted",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/assessments") {
        sendJson(response, 201, { id: "assessment-1" });
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/patients/patient-1/assessments"
      ) {
        sendJson(response, 200, [{ id: "assessment-1" }]);
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/admin/game-contents"
      ) {
        sendJson(response, 201, {
          id: "game-1",
          gameVersion: "1.0.0",
          runtimeType: "browser_pose_canvas",
          status: "active",
          buildStatus: "released",
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/rehab-plans/recommend"
      ) {
        sendJson(response, 201, {
          id: "recommended-plan-1",
          status: "pending_confirm",
          dailyDuration: 15,
          weekFrequency: 3,
          difficultyLadder: ["easy", "medium"],
          items: [
            {
              id: "plan-item-1",
              gameContentId: "game-1",
              durationMinutes: 15,
              frequencyPerWeek: 3,
              difficulty: "medium",
            },
          ],
        });
        return;
      }
      if (
        request.method === "PATCH" &&
        url.pathname === "/rehab-plans/recommended-plan-1/confirm"
      ) {
        sendJson(response, 200, {
          id: "confirmed-plan-1",
          status: "active",
          isCurrent: true,
          items: [{ id: "plan-item-1", gameContentId: "game-1" }],
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/admin/collection-conditions"
      ) {
        sendJson(response, 201, {
          id: "condition-1",
          status: "active",
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/admin/collection-protocols"
      ) {
        sendJson(response, 201, {
          id: "protocol-1",
          status: "active",
          conditionId: "condition-1",
          gameContentId: "game-1",
          version: "1.0.0",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/collection-batches") {
        sendJson(response, 201, {
          id: "batch-1",
          status: "ready",
          protocolId: "protocol-1",
          conditionId: "condition-1",
          protocolVersion: "1.0.0",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/training-sessions") {
        sendJson(response, 201, {
          id: "session-1",
          sessionStatus: "in_progress",
          collectionBatchId: "batch-1",
          gameRunId: body.gameRunId,
          bridgeProtocolVersion: "1.0.0",
          runtimeConfigSnapshot: {
            runtimeType: "browser_pose_canvas",
            collectionBatch: { id: "batch-1" },
          },
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/training-sessions/session-1/results"
      ) {
        sendJson(response, 201, {
          id: "result-1",
          source: "browser_pose_canvas",
          qualityFlag: "valid",
          abnormalFlag: false,
          collectionBatchId: "batch-1",
        });
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/patients/patient-1/training-records"
      ) {
        sendJson(response, 200, {
          sessions: [
            {
              id: "session-1",
              collectionBatchId: "batch-1",
              result: { id: "result-1", collectionBatchId: "batch-1" },
              motionMetrics: Array.from({ length: 4 }, (_, index) => ({
                id: `metric-${index + 1}`,
                collectionBatchId: "batch-1",
              })),
            },
          ],
          summary: { completedSessions: 1 },
        });
        return;
      }

      throw new Error(`unhandled route ${request.method} ${url.pathname}`);
    } catch (error) {
      sendJson(response, 500, { message: error.message });
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    events,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function expectedRoleFor(method, path) {
  if (method === "POST" && path === "/patients") return "admin";
  if (method === "POST" && path === "/consents") return "patient";
  if (method === "POST" && path === "/assessments") return "doctor";
  if (method === "GET" && path.endsWith("/assessments")) return "doctor";
  if (method === "POST" && path === "/admin/game-contents") return "admin";
  if (method === "POST" && path === "/rehab-plans/recommend") return "doctor";
  if (method === "PATCH" && path.endsWith("/confirm")) return "doctor";
  if (method === "POST" && path === "/admin/collection-conditions") {
    return "admin";
  }
  if (method === "POST" && path === "/admin/collection-protocols") {
    return "admin";
  }
  if (method === "POST" && path === "/collection-batches") return "doctor";
  if (method === "POST" && path === "/training-sessions") return "patient";
  if (method === "POST" && path.endsWith("/results")) return "patient";
  if (method === "GET" && path.endsWith("/training-records")) return "doctor";
  return undefined;
}

test("each role credential is required before the first HTTP request", async (t) => {
  const boundary = await startTrialBoundary();
  t.after(boundary.close);

  for (const missingEnv of credentialEnvNames) {
    const result = await runScript(boundary.baseUrl, { missingEnv });
    assert.notEqual(result.code, 0, `${missingEnv} must fail the process`);
    assert.match(result.stderr, new RegExp(`缺少环境变量 ${missingEnv}`));
  }
  assert.equal(boundary.events.length, 0);
});

test("password_reset_required stops after one csrf and login exchange", async (t) => {
  const boundary = await startTrialBoundary({ resetAccount: "admin-account" });
  t.after(boundary.close);

  const result = await runScript(boundary.baseUrl);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /password_reset_required.*人工完成密码重置/s);
  assert.deepEqual(
    boundary.events.map(({ method, path }) => `${method} ${path}`),
    ["GET /health/live", "GET /auth/csrf", "POST /auth/login"],
  );
});

test("trial loop uses isolated cookie sessions and matching csrf over real HTTP", async (t) => {
  const boundary = await startTrialBoundary();
  t.after(boundary.close);

  const result = await runScript(boundary.baseUrl);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /trial 空库闭环验收通过/);
  const authEvents = boundary.events.filter((event) =>
    ["/auth/csrf", "/auth/login"].includes(event.path),
  );
  assert.deepEqual(
    authEvents.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /auth/csrf",
      "POST /auth/login",
      "GET /auth/csrf",
      "POST /auth/login",
      "GET /auth/csrf",
      "POST /auth/login",
    ],
  );
  assert.deepEqual(
    authEvents
      .filter((event) => event.path === "/auth/login")
      .map((event) => event.body.account),
    ["admin-account", "doctor-account", "patient-account"],
  );
  assert.equal(
    boundary.events.some((event) => event.authorization !== undefined),
    false,
  );
});

test("trial loop production source has no bearer or token compatibility path", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.equal(
    source.match(/new CookieSessionClient\(apiBaseUrl\)/g)?.length,
    3,
  );
  assert.doesNotMatch(source, /\baccessToken\b/);
  assert.doesNotMatch(source, /Authorization|Bearer/);
  assert.doesNotMatch(source, /\boptions\.token\b/);
  assert.doesNotMatch(source, /token-ref|tokenRef/);
});
