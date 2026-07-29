import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifySpeechAiAssessmentAcceptance } from "../verify-speech-ai-assessment-acceptance.mjs";

const execFileAsync = promisify(execFile);

function validConfig(overrides = {}) {
  const config = {
    apiBaseUrl: "https://rehab.example.com",
    doctorAccount: "doctor-acceptance",
    doctorPassword: "doctor-password",
    auditAccount: "audit-acceptance",
    auditPassword: "audit-password",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    audioFilePath: "/tmp/formal-speech.wav",
    audioMimeType: "audio/wav",
    durationSeconds: 42,
    humanReview: {
      reviewerUserId: "doctor-user-id",
      reviewedAt: "2026-05-27T10:15:00.000Z",
      conclusion: "approved",
      notes: "医生复核语音转写、AI 评分和摘要后批准入库。",
    },
    fetchImpl: createFetchImpl(),
    ...overrides,
  };
  globalThis.fetch = config.fetchImpl;
  return config;
}

test("speech AI assessment verifier runs STT, AI draft, approved formal assessment, and audit checks", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(apiData.calls.transcriptRequests, 1);
  assert.equal(apiData.calls.draftRequests, 1);
  assert.equal(apiData.calls.assessmentCreates, 1);
  assert.equal(apiData.calls.assessmentsReads, 4);
  assert.equal(
    apiData.createdAssessmentBody.rawInputSummary.source,
    "speech_ai_assessment",
  );
  assert.deepEqual(
    apiData.createdAssessmentBody.rawInputSummary.evidence.speech,
    apiData.transcript.speechEvidence,
  );
  assert.equal(
    apiData.createdAssessmentBody.rawInputSummary.evidence.ai.callId,
    apiData.draft.rawInputSummary.evidence.callId,
  );
  assert.equal(
    apiData.calls.requests.some((request) => request.authorization !== null),
    false,
  );
  for (const path of [
    "/ai/assessment-speech-transcripts",
    "/ai/assessment-drafts",
    "/assessments",
  ]) {
    const request = apiData.calls.requests.find((item) => item.path === path);
    assert.match(request.cookie, /rehab_session=doctor-acceptance-session/);
    assert.equal(request.csrf, request.cookies.rehab_csrf);
  }
  const auditRequest = apiData.calls.requests.find(
    (request) => request.path === "/admin/audit-logs",
  );
  assert.match(auditRequest.cookie, /rehab_session=audit-acceptance-session/);
  assert.doesNotMatch(auditRequest.cookie, /doctor-acceptance-session/);
  const csrfRequests = apiData.calls.requests.filter(
    (request) => request.path === "/auth/csrf",
  );
  assert.equal(csrfRequests.length, 2);
  assert.deepEqual(
    csrfRequests.map((request) => request.cookie),
    ["", ""],
  );
});

test("speech AI assessment verifier does not accept legacy bearer credentials", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const result = await verifySpeechAiAssessmentAcceptance({
    apiBaseUrl: "https://rehab.example.com",
    doctorToken: "legacy-doctor-token",
    auditToken: "legacy-audit-token",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    audioFilePath,
    audioMimeType: "audio/wav",
    durationSeconds: 42,
    humanReview: {
      reviewerUserId: "doctor-user-id",
      reviewedAt: "2026-05-27T10:15:00.000Z",
      conclusion: "approved",
    },
    fetchImpl: createFetchImpl(apiData),
  });

  assert.match(result.failures.join("\n"), /doctorAccount/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.equal(apiData.calls.requests.length, 0);
});

test("speech AI assessment verifier rejects shared doctor and audit accounts before file reads or network calls", async (t) => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  let fileAccessCount = 0;
  fs.existsSync = (...args) => {
    fileAccessCount += 1;
    return originalExistsSync(...args);
  };
  fs.readFileSync = (...args) => {
    fileAccessCount += 1;
    return originalReadFileSync(...args);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({
      audioFilePath,
      auditAccount: "doctor-acceptance",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /doctorAccount.*auditAccount|不同账号/,
  );
  assert.equal(fileAccessCount, 0);
  assert.equal(apiData.calls.requests.length, 0);
});

test("speech AI assessment verifier rejects every invalid CSRF and login 2xx response", async (t) => {
  const { audioFilePath } = await prepareAudioFile();
  const secret = "auth-shape-secret-access-token";
  const invalidResponses = [
    ["204", { status: 204 }],
    ["null", { body: null }],
    ["false", { body: false }],
    ["empty string", { body: "" }],
    ["raw non-JSON string", { rawBody: "raw-auth-response" }],
    ["error shape", { body: { error: { accessToken: secret } } }],
  ];

  for (const node of [
    "csrf:doctor-acceptance",
    "login:doctor-acceptance",
    "csrf:audit-acceptance",
    "login:audit-acceptance",
  ]) {
    for (const [caseName, override] of invalidResponses) {
      await t.test(`${node} rejects ${caseName}`, async () => {
        const apiData = createApiData();
        apiData.responseOverrides[node] = override;
        const result = await verifySpeechAiAssessmentAcceptance(
          validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
        );

        assert.notDeepEqual(result.failures, []);
        assert.doesNotMatch(result.failures.join("\n"), new RegExp(secret));
        assert.doesNotMatch(result.failures.join("\n"), /accessToken/);
      });
    }
  }
});

test("speech AI assessment verifier rejects every invalid 2xx body at every required API node", async (t) => {
  const { audioFilePath } = await prepareAudioFile();
  const secret = "shape-secret-access-token";
  const invalidResponses = [
    ["204", { status: 204 }],
    ["null", { body: null }],
    ["false", { body: false }],
    ["empty string", { body: "" }],
    ["raw non-JSON string", { rawBody: "raw-provider-response" }],
    ["wrong shape", { body: { status: { accessToken: secret } } }],
  ];
  const nodes = [
    "me",
    "patient",
    "assessmentsBefore",
    "transcript",
    "assessmentsAfterTranscript",
    "draft",
    "assessmentsAfterDraft",
    "createdAssessment",
    "assessmentsAfterFormal",
    "audit:ai.assessment_speech_transcript.generate",
    "audit:ai.assessment_draft.generate",
    "audit:assessment.create",
  ];

  for (const node of nodes) {
    for (const [caseName, override] of invalidResponses) {
      await t.test(`${node} rejects ${caseName}`, async () => {
        const apiData = createApiData();
        apiData.responseOverrides[node] = override;
        const result = await verifySpeechAiAssessmentAcceptance(
          validConfig({
            audioFilePath,
            fetchImpl: createFetchImpl(apiData),
          }),
        );

        assert.notDeepEqual(result.failures, []);
        assert.doesNotMatch(result.failures.join("\n"), new RegExp(secret));
        assert.doesNotMatch(result.failures.join("\n"), /accessToken/);
      });
    }
  }
});

test("speech AI assessment verifier rejects audit metadata key variants", async () => {
  const { audioFilePath } = await prepareAudioFile();
  for (const key of [
    "fullTranscript",
    "inputText",
    "accessToken",
    "audioData",
    "sessionCookie",
    "clientCredential",
    "requestEnvelope",
    "responseEnvelope",
    "rawBase64",
  ]) {
    const apiData = createApiData();
    apiData.audit["ai.assessment_speech_transcript.generate"][0].metadata[key] =
      "opaque-sensitive-material";
    const result = await verifySpeechAiAssessmentAcceptance(
      validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("speech AI assessment config template uses isolated account credentials", async () => {
  const template = JSON.parse(
    await readFile(
      "docs/templates/speech-ai-assessment-acceptance-config.template.json",
      "utf8",
    ),
  );

  for (const key of [
    "doctorAccount",
    "doctorPassword",
    "auditAccount",
    "auditPassword",
  ]) {
    assert.equal(typeof template[key], "string");
    assert.ok(template[key].length > 0);
  }
  assert.equal("doctorToken" in template, false);
  assert.equal("auditToken" in template, false);
});

test("speech AI assessment verifier rejects browser webm as formal provider audio", async () => {
  const { audioFilePath } = await prepareAudioFile("formal-speech.webm");
  const apiData = createApiData();
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({
      audioFilePath,
      audioMimeType: "audio/webm",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(result.failures.join("\n"), /正式音频格式/);
  assert.equal(apiData.calls.transcriptRequests, 0);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("speech AI assessment verifier rejects revoked microphone consent before API writes", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    patient: {
      consents: [
        consent("privacy_policy"),
        consent("ai_processing"),
        consent("microphone_capture", {
          status: "revoked",
          revokedAt: "2026-05-27T10:00:00.000Z",
        }),
      ],
    },
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /microphone_capture/);
  assert.equal(apiData.calls.transcriptRequests, 0);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("speech AI assessment verifier rejects draft or transcript phases creating formal records", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    assessmentsAfterTranscript: [
      existingAssessment(),
      formalSpeechAssessment(),
    ],
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /语音转写阶段.*正式评估/);
  assert.equal(apiData.calls.draftRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("speech AI assessment verifier requires approved human reviewer to match current doctor session user", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({
      audioFilePath,
      fetchImpl: createFetchImpl(apiData),
      humanReview: {
        reviewerUserId: "other-doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /复核人|当前医师/);
  assert.equal(apiData.calls.transcriptRequests, 0);
  assert.equal(apiData.calls.assessmentCreates, 0);
});

test("speech AI assessment verifier rejects missing speech provider call evidence", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    transcript: {
      speechEvidence: {
        callId: "",
        calledAt: "",
      },
    },
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /speechEvidence.callId/);
  assert.match(result.failures.join("\n"), /speechEvidence.calledAt/);
  assert.equal(apiData.calls.draftRequests, 0);
});

test("speech AI assessment verifier rejects formal record that does not preserve speech AI evidence envelope", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    assessmentsAfterFormal: [
      formalSpeechAssessment({
        rawInputSummary: {
          evidence: {
            ai: {
              callId: "different-ai-call",
            },
          },
        },
      }),
      existingAssessment(),
    ],
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /AI、语音和 approved 人工复核/);
});

test("speech AI assessment verifier rejects missing audit logs for speech, AI draft, or formal assessment", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    audit: {
      "ai.assessment_speech_transcript.generate": [],
      "ai.assessment_draft.generate": [],
      "assessment.create": [],
    },
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计日志/);
});

test("speech AI assessment verifier requires one candidate per audit identity and scans every duplicate", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const duplicateSpeech = structuredClone(
    apiData.audit["ai.assessment_speech_transcript.generate"][0],
  );
  duplicateSpeech.id = "audit_speech_transcript_002";
  duplicateSpeech.metadata.transcript = "不得进入审计的完整转写";
  apiData.audit["ai.assessment_speech_transcript.generate"].push(
    duplicateSpeech,
  );
  const duplicateDraft = structuredClone(
    apiData.audit["ai.assessment_draft.generate"][0],
  );
  duplicateDraft.id = "audit_ai_draft_002";
  duplicateDraft.metadata.accessToken = "Bearer abcdefg=";
  apiData.audit["ai.assessment_draft.generate"].push(duplicateDraft);
  apiData.audit["assessment.create"].push({
    id: "audit_assessment_create_002",
    action: "assessment.create",
    targetType: "assessment_record",
    targetId: "assessment_speech_ai_001",
    result: "success",
    metadata: {
      audio: { contentBase64: "UklGRg==" },
    },
  });

  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /语音转写成功审计候选.*1/);
  assert.match(failures, /AI 草稿成功审计候选.*1/);
  assert.match(failures, /正式评估创建成功审计候选.*1/);
  assert.match(failures, /transcript/);
  assert.match(failures, /accessToken/);
  assert.match(failures, /audio/);
});

test("speech AI assessment verifier binds transcript audit audio to current evidence", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  apiData.audit[
    "ai.assessment_speech_transcript.generate"
  ][0].metadata.audio.durationSeconds = 41;

  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /audio|语音供应商调用证据/);
});

test("speech AI assessment verifier scans dangerous response key variants", async () => {
  const { audioFilePath } = await prepareAudioFile();
  for (const key of [
    "fallbackEnabled",
    "mockResult",
    "demoMode",
    "syntheticSummary",
  ]) {
    const apiData = createApiData();
    apiData.draft.rawInputSummary[key] = false;
    const result = await verifySpeechAiAssessmentAcceptance(
      validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("speech AI assessment verifier rejects Bearer values ending in equals", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  apiData.transcript.speechEvidence.callId = "Bearer abcdefg=";
  apiData.audit["ai.assessment_speech_transcript.generate"][0].metadata.callId =
    "Bearer abcdefg=";
  apiData.assessmentsAfterFormal[0].rawInputSummary.evidence.speech.callId =
    "Bearer abcdefg=";

  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /callId/);
});

test("speech AI assessment verifier accepts a legitimate 40-character hex callId", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const callId = "0123456789abcdef0123456789abcdef01234567";
  apiData.transcript.speechEvidence.callId = callId;
  apiData.audit["ai.assessment_speech_transcript.generate"][0].metadata.callId =
    callId;
  apiData.assessmentsAfterFormal[0].rawInputSummary.evidence.speech.callId =
    callId;

  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
});

test("speech AI assessment verifier rejects demo manual markers and sensitive audit payloads", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    audit: {
      "ai.assessment_speech_transcript.generate": [
        {
          id: "audit_speech_transcript_001",
          action: "ai.assessment_speech_transcript.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-audio-understanding",
            modelVersion: "mimo-v2.5",
            callId: "speech-call-real-001",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
            transcript: "患者完整敏感语音转写",
            message: "manual fallback accepted",
            providerAuthorization: "Bearer malicious-audit-token",
          },
        },
      ],
    },
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /审计 metadata/);
  assert.doesNotMatch(failures, /metadata\.endpointRef/);
});

test("speech AI assessment verifier rejects raw payload metadata keys", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    audit: {
      "ai.assessment_speech_transcript.generate": [
        {
          id: "audit_speech_transcript_001",
          action: "ai.assessment_speech_transcript.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-audio-understanding",
            modelVersion: "mimo-v2.5",
            callId: "speech-call-real-001",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
            payload: {
              providerRequestId: "provider-request-001",
              summary: "structured provider request envelope",
            },
          },
        },
      ],
    },
  });
  const result = await verifySpeechAiAssessmentAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.payload/);
});

test("speech AI assessment CLI redacts failed response bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-ai-acceptance-"));
  const audioFilePath = join(dir, "formal-speech.wav");
  const configPath = join(dir, "speech-ai-config.json");
  await writeFile(audioFilePath, "formal-audio-bytes");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      doctorAccount: "doctor-acceptance",
      doctorPassword: "doctor-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath,
      audioMimeType: "audio/wav",
      durationSeconds: 42,
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
      },
    }),
  );
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "globalThis.fetch = async (url) => {",
      "  const response = new Response('token=doctor-token transcript=患者敏感转写 key=real-key audioContentBase64=AAAA', { status: 502 });",
      "  Object.defineProperty(response, 'url', { value: String(url) });",
      "  return response;",
      "};",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "--import",
        fetchFixturePath,
        "scripts/verify-speech-ai-assessment-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /doctor-token/);
      assert.doesNotMatch(error.stderr, /患者敏感转写/);
      assert.doesNotMatch(error.stderr, /real-key/);
      return true;
    },
  );
});

test("speech AI assessment CLI reports malformed response types without leaking values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-ai-shape-"));
  const audioFilePath = join(dir, "formal-speech.wav");
  const configPath = join(dir, "speech-ai-config.json");
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  const secret = "cli-shape-secret-access-token";
  await writeFile(audioFilePath, "formal-audio-bytes");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      doctorAccount: "doctor-acceptance",
      doctorPassword: "doctor-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath,
      audioMimeType: "audio/wav",
      durationSeconds: 42,
      humanReview: {
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
      },
    }),
  );
  await writeFile(
    fetchFixturePath,
    [
      "function reply(url, status, body, cookies = []) {",
      "  const headers = new Headers({ 'Content-Type': 'application/json' });",
      "  for (const cookie of cookies) headers.append('Set-Cookie', cookie);",
      "  const response = new Response(JSON.stringify(body), { status, headers });",
      "  Object.defineProperty(response, 'url', { value: String(url) });",
      "  return response;",
      "}",
      "let csrf = 0;",
      "globalThis.fetch = async (url) => {",
      "  const path = new URL(url).pathname;",
      "  if (path === '/auth/csrf') {",
      "    const token = `csrf-${++csrf}`;",
      "    return reply(url, 200, { csrfToken: token }, [`rehab_csrf=${token}; Path=/`]);",
      "  }",
      "  if (path === '/auth/login') {",
      "    const token = `csrf-${++csrf}`;",
      "    return reply(url, 201, { status: 'authenticated', context: { primaryRole: 'doctor' } }, [`rehab_session=doctor-session; Path=/`, `rehab_csrf=${token}; Path=/`]);",
      "  }",
      "  if (path === '/me') return reply(url, 200, { user: { id: 'doctor-user-id', roles: [{ roleCode: 'doctor' }] } });",
      "  if (path === '/patients/patient_real_001') return reply(url, 200, { id: 'patient_real_001', consents: [",
      "    { consentType: 'privacy_policy', status: 'granted', revokedAt: null },",
      "    { consentType: 'ai_processing', status: 'granted', revokedAt: null },",
      "    { consentType: 'microphone_capture', status: 'granted', revokedAt: null }",
      "  ] });",
      "  if (path === '/patients/patient_real_001/assessments') return reply(url, 200, []);",
      `  if (path === '/ai/assessment-speech-transcripts') return reply(url, 200, { patientId: 'patient_real_001', assessmentType: 'MMSE/CDR', status: { accessToken: '${secret}' } });`,
      "  return reply(url, 404, { message: 'not found' });",
      "};",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "--import",
        fetchFixturePath,
        "scripts/verify-speech-ai-assessment-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /语音转写响应\.status/);
      assert.match(error.stderr, /期望类型.*string.*实际类型.*object/);
      assert.doesNotMatch(error.stderr, new RegExp(secret));
      assert.doesNotMatch(error.stderr, /accessToken/);
      return true;
    },
  );
});

test("speech AI assessment CLI redacts malformed JSON parser details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-ai-json-"));
  const configPath = join(dir, "speech-ai-config.json");
  const secret = "CONFIG_PASSWORD_SECRET_aa82f1";
  await writeFile(configPath, secret);

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-speech-ai-assessment-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /配置文件不是有效 JSON/);
      assert.doesNotMatch(error.stderr, new RegExp(secret));
      assert.doesNotMatch(error.stderr, /Unexpected token|JSON at position/);
      return true;
    },
  );
});

async function prepareAudioFile(fileName = "formal-speech.wav") {
  const dir = await mkdtemp(join(tmpdir(), "speech-ai-acceptance-audio-"));
  const audioFilePath = join(dir, fileName);
  await writeFile(audioFilePath, "formal-audio-bytes");
  return { audioFilePath };
}

function createFetchImpl(apiData = createApiData()) {
  const issuedCsrfTokens = new Set();
  const sessions = new Map();
  let csrfSequence = 0;

  return async (url, options = {}) => {
    const parsed = new URL(url);
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    const cookies = parseCookies(headers.get("cookie"));
    const event = {
      path: parsed.pathname,
      method,
      cookie: headers.get("cookie") ?? "",
      cookies,
      csrf: headers.get("x-csrf-token"),
      authorization: headers.get("authorization"),
    };
    apiData.calls.requests.push(event);

    if (event.authorization !== null) {
      return response(400, { message: "authorization forbidden" }, { url });
    }

    if (method === "GET" && parsed.pathname === "/auth/csrf") {
      const account =
        apiData.calls.csrfRequests++ === 0
          ? "doctor-acceptance"
          : "audit-acceptance";
      const csrf = `csrf-${++csrfSequence}`;
      issuedCsrfTokens.add(csrf);
      const override = apiData.responseOverrides[`csrf:${account}`];
      if (override) {
        return responseFromOverride(override, url, {
          cookies: [`rehab_csrf=${csrf}; Path=/; SameSite=Lax`],
        });
      }
      return response(
        200,
        { csrfToken: csrf },
        {
          url,
          cookies: [`rehab_csrf=${csrf}; Path=/; SameSite=Lax`],
        },
      );
    }

    if (method === "POST" && parsed.pathname === "/auth/login") {
      const body = JSON.parse(options.body);
      event.account = body.account;
      if (
        cookies.rehab_csrf !== event.csrf ||
        !issuedCsrfTokens.has(event.csrf)
      ) {
        return response(403, { message: "invalid csrf" }, { url });
      }
      const expectedPassword = {
        "doctor-acceptance": "doctor-password",
        "audit-acceptance": "audit-password",
      }[body.account];
      if (body.password !== expectedPassword) {
        return response(401, { message: "invalid credentials" }, { url });
      }
      const session = `${body.account}-session`;
      const csrf = `csrf-${++csrfSequence}`;
      sessions.set(session, { account: body.account, csrf });
      const loginCookies = [
        `rehab_session=${session}; Path=/; HttpOnly`,
        `rehab_csrf=${csrf}; Path=/; SameSite=Lax`,
      ];
      const override = apiData.responseOverrides[`login:${body.account}`];
      if (override) {
        return responseFromOverride(override, url, { cookies: loginCookies });
      }
      return response(
        201,
        {
          status: "authenticated",
          context: {
            primaryRole:
              body.account === "audit-acceptance" ? "admin" : "doctor",
          },
          accessToken: "malicious-login-access-token",
        },
        {
          url,
          cookies: loginCookies,
        },
      );
    }

    const auth = sessions.get(cookies.rehab_session);
    if (!auth) {
      return response(401, { message: "missing session" }, { url });
    }
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      (cookies.rehab_csrf !== auth.csrf || event.csrf !== auth.csrf)
    ) {
      return response(403, { message: "invalid csrf" }, { url });
    }

    if (parsed.pathname.endsWith("/me")) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      apiData.calls.meRequests += 1;
      if (apiData.responseOverrides.me) {
        return responseFromOverride(apiData.responseOverrides.me, url);
      }
      return response(200, apiData.me, { url });
    }

    if (parsed.pathname.endsWith(`/patients/${apiData.patient.id}`)) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      if (apiData.responseOverrides.patient) {
        return responseFromOverride(apiData.responseOverrides.patient, url);
      }
      return response(200, apiData.patient, { url });
    }

    if (
      parsed.pathname.endsWith(`/patients/${apiData.patient.id}/assessments`)
    ) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      apiData.calls.assessmentsReads += 1;
      const assessmentNode = [
        "assessmentsBefore",
        "assessmentsAfterTranscript",
        "assessmentsAfterDraft",
        "assessmentsAfterFormal",
      ][apiData.calls.assessmentsReads - 1];
      if (apiData.responseOverrides[assessmentNode]) {
        return responseFromOverride(
          apiData.responseOverrides[assessmentNode],
          url,
        );
      }
      if (apiData.calls.assessmentsReads === 1) {
        return response(200, apiData.assessmentsBefore, { url });
      }
      if (apiData.calls.assessmentsReads === 2) {
        return response(200, apiData.assessmentsAfterTranscript, { url });
      }
      if (apiData.calls.assessmentsReads === 3) {
        return response(200, apiData.assessmentsAfterDraft, { url });
      }
      return response(200, apiData.assessmentsAfterFormal, { url });
    }

    if (parsed.pathname.endsWith("/ai/assessment-speech-transcripts")) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      apiData.calls.transcriptRequests += 1;
      apiData.transcriptRequestBody = JSON.parse(options.body);
      if (apiData.responseOverrides.transcript) {
        return responseFromOverride(apiData.responseOverrides.transcript, url);
      }
      return response(200, apiData.transcript, { url });
    }

    if (parsed.pathname.endsWith("/ai/assessment-drafts")) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      apiData.calls.draftRequests += 1;
      apiData.draftRequestBody = JSON.parse(options.body);
      if (apiData.responseOverrides.draft) {
        return responseFromOverride(apiData.responseOverrides.draft, url);
      }
      return response(200, apiData.draft, { url });
    }

    if (parsed.pathname.endsWith("/assessments")) {
      if (auth.account !== "doctor-acceptance") {
        return response(403, { message: "wrong doctor session" }, { url });
      }
      apiData.calls.assessmentCreates += 1;
      apiData.createdAssessmentBody = JSON.parse(options.body);
      if (apiData.responseOverrides.createdAssessment) {
        return responseFromOverride(
          apiData.responseOverrides.createdAssessment,
          url,
        );
      }
      return response(200, apiData.createdAssessment, { url });
    }

    if (parsed.pathname.endsWith("/admin/audit-logs")) {
      if (auth.account !== "audit-acceptance") {
        return response(403, { message: "wrong audit session" }, { url });
      }
      const action = parsed.searchParams.get("action") ?? "";
      if (apiData.responseOverrides[`audit:${action}`]) {
        return responseFromOverride(
          apiData.responseOverrides[`audit:${action}`],
          url,
        );
      }
      return response(200, apiData.audit[action] ?? [], { url });
    }

    return response(404, { message: "not found" }, { url });
  };
}

function parseCookies(header = "") {
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

function createApiData(overrides = {}) {
  const transcript = speechTranscript();
  const draft = aiDraft({
    rawInputSummary: { transcript: transcript.transcript },
  });
  const createdAssessment = formalSpeechAssessment({
    rawInputSummary: buildFormalRawInputSummary({ draft, transcript }),
  });
  return deepMerge(
    {
      calls: {
        csrfRequests: 0,
        assessmentsReads: 0,
        meRequests: 0,
        transcriptRequests: 0,
        draftRequests: 0,
        assessmentCreates: 0,
        requests: [],
      },
      responseOverrides: {},
      transcriptRequestBody: null,
      draftRequestBody: null,
      createdAssessmentBody: null,
      me: {
        user: {
          id: "doctor-user-id",
          account: "doctor001",
          displayName: "王医生",
          roles: [
            {
              roleCode: "doctor",
              relatedObjectType: "doctor_profile",
              relatedObjectId: "doctor-profile-id",
            },
          ],
        },
      },
      patient: {
        id: "patient_real_001",
        consents: [
          consent("privacy_policy"),
          consent("ai_processing"),
          consent("microphone_capture"),
        ],
      },
      assessmentsBefore: [existingAssessment()],
      assessmentsAfterTranscript: [existingAssessment()],
      assessmentsAfterDraft: [existingAssessment()],
      transcript,
      draft,
      createdAssessment,
      assessmentsAfterFormal: [createdAssessment, existingAssessment()],
      audit: {
        "ai.assessment_speech_transcript.generate": [
          {
            id: "audit_speech_transcript_001",
            action: "ai.assessment_speech_transcript.generate",
            targetType: "patient_profile",
            targetId: "patient_real_001",
            result: "success",
            metadata: {
              provider: "xiaomi-mimo-audio-understanding",
              modelVersion: "mimo-v2.5",
              callId: "speech-call-real-001",
              endpointRef:
                "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
              source: "provider_audio_understanding",
              calledAt: "2026-05-27T09:58:45.000Z",
              audio: {
                mimeType: "audio/wav",
                durationSeconds: 42,
              },
            },
          },
        ],
        "ai.assessment_draft.generate": [
          {
            id: "audit_ai_draft_001",
            action: "ai.assessment_draft.generate",
            targetType: "patient_profile",
            targetId: "patient_real_001",
            result: "success",
            metadata: {
              provider: "xiaomi-mimo",
              modelVersion: "MiMo-V2.5",
              promptVersion: "cognitive-assessment-mimo-2026-05",
              callId: "mimo-call-001",
              status: "pending_human_review",
            },
          },
        ],
        "assessment.create": [
          {
            id: "audit_assessment_create_001",
            action: "assessment.create",
            targetType: "assessment_record",
            targetId: "assessment_speech_ai_001",
            result: "success",
            metadata: null,
          },
        ],
      },
    },
    overrides,
  );
}

function buildFormalRawInputSummary({ draft, transcript }) {
  return {
    ...draft.rawInputSummary,
    source: "speech_ai_assessment",
    evidence: {
      ai: stripDraftHumanReview(draft.rawInputSummary.evidence),
      speech: transcript.speechEvidence,
      humanReview: {
        required: true,
        reviewerUserId: "doctor-user-id",
        reviewedAt: "2026-05-27T10:15:00.000Z",
        conclusion: "approved",
        notes: "医生复核语音转写、AI 评分和摘要后批准入库。",
      },
    },
  };
}

function stripDraftHumanReview(evidence) {
  const { humanReview: _humanReview, ...providerEvidence } = evidence;
  return providerEvidence;
}

function speechTranscript(overrides = {}) {
  return deepMerge(
    {
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      status: "transcribed",
      transcript: "今天是星期三，我记得苹果、桌子、硬币三个词。",
      speechEvidence: {
        provider: "xiaomi-mimo-audio-understanding",
        modelVersion: "mimo-v2.5",
        callId: "speech-call-real-001",
        endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
        source: "provider_audio_understanding",
        calledAt: "2026-05-27T09:58:45.000Z",
        audio: {
          mimeType: "audio/wav",
          durationSeconds: 42,
        },
      },
    },
    overrides,
  );
}

function aiDraft(overrides = {}) {
  return deepMerge(
    {
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      status: "pending_human_review",
      riskLevel: "moderate",
      scoreSummary: {
        mmse: 21,
        cdr: 1,
        memory: 45,
        orientation: 62,
        executive: 50,
        language: 72,
      },
      rawInputSummary: {
        source: "production_ai_assessment",
        transcript: "今天是星期三，我记得苹果、桌子、硬币三个词。",
        analysisSummary:
          "患者短时记忆与执行功能下降，建议进行反应和上肢协调训练。",
        modelVersion: "MiMo-V2.5",
        confidence: 0.82,
        evidence: {
          provider: "xiaomi-mimo",
          model: "MiMo-V2.5",
          modelVersion: "MiMo-V2.5",
          callId: "mimo-call-001",
          endpointRef:
            "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
          promptVersion: "cognitive-assessment-mimo-2026-05",
          calledAt: "2026-05-27T10:10:00.000Z",
          humanReview: {
            required: true,
            status: "pending_human_review",
          },
        },
      },
    },
    overrides,
  );
}

function formalSpeechAssessment(overrides = {}) {
  return deepMerge(
    {
      id: "assessment_speech_ai_001",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      source: "speech_ai_assessment",
      scoreSummary: aiDraft().scoreSummary,
      rawInputSummary: buildFormalRawInputSummary({
        draft: aiDraft(),
        transcript: speechTranscript(),
      }),
      createdAt: "2026-05-27T10:15:05.000Z",
      completedAt: "2026-05-27T10:15:05.000Z",
      riskGrades: [
        {
          id: "risk_speech_ai_001",
          riskLevel: "moderate",
          systemRiskLevel: "moderate",
          reasonSummary: "MMSE 21 且 CDR 1，提示中度风险。",
          isCurrent: true,
        },
      ],
      aiAnalyses: [
        {
          id: "analysis_speech_ai_001",
          analysisScene: "assessment_summary",
          modelVersion: "MiMo-V2.5",
          confidence: 0.82,
          inputSummary: aiDraft().rawInputSummary,
          outputSummary: {
            riskLevel: "moderate",
            reasonSummary: "MMSE 21 且 CDR 1，提示中度风险。",
          },
        },
      ],
    },
    overrides,
  );
}

function existingAssessment() {
  return {
    id: "assessment_existing_001",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    source: "clinician_input",
    scoreSummary: {
      mmse: 26,
      cdr: 0.5,
      memory: 72,
      orientation: 80,
      executive: 75,
      language: 82,
    },
    rawInputSummary: {
      source: "clinician_input",
      transcript: "既往评估记录。",
    },
    createdAt: "2026-05-20T10:00:00.000Z",
    riskGrades: [],
    aiAnalyses: [],
  };
}

function consent(consentType, overrides = {}) {
  return {
    id: `consent_${consentType}`,
    consentType,
    consentVersion: "v1.2",
    status: "granted",
    revokedAt: null,
    grantedAt: "2026-05-27T09:50:00.000Z",
    ...overrides,
  };
}

function response(status, body, { url, cookies = [] } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  const result = new Response(
    status === 204 ? undefined : JSON.stringify(body),
    { status, headers },
  );
  Object.defineProperty(result, "url", {
    value: String(url ?? "https://rehab.example.com"),
  });
  return result;
}

function responseFromOverride(override, url, { cookies = [] } = {}) {
  if (Object.hasOwn(override, "rawBody")) {
    const headers = new Headers({ "Content-Type": "text/plain" });
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);
    const result = new Response(override.rawBody, {
      status: override.status ?? 200,
      headers,
    });
    Object.defineProperty(result, "url", { value: String(url) });
    return result;
  }
  return response(
    override.status ?? 200,
    Object.hasOwn(override, "body") ? override.body : undefined,
    { url, cookies },
  );
}

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides))
    return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
