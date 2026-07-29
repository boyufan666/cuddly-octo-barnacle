import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { verifySpeechTranscriptAcceptance } from "../verify-speech-transcript-acceptance.mjs";

const execFileAsync = promisify(execFile);

function validConfig(overrides = {}) {
  const config = {
    apiBaseUrl: "https://rehab.example.com",
    patientAccount: "patient-acceptance",
    patientPassword: "patient-password",
    auditAccount: "audit-acceptance",
    auditPassword: "audit-password",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    audioFilePath: "/tmp/formal-speech.wav",
    audioMimeType: "audio/wav",
    durationSeconds: 42,
    fetchImpl: createFetchImpl(),
    ...overrides,
  };
  globalThis.fetch = config.fetchImpl;
  return config;
}

test("speech transcript acceptance verifier submits real audio through API and verifies consent plus audit", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(
    apiData.calls.requests.some((request) => request.authorization !== null),
    false,
  );
  const transcriptRequest = apiData.calls.requests.find(
    (request) => request.path === "/ai/assessment-speech-transcripts",
  );
  assert.match(
    transcriptRequest.cookie,
    /rehab_session=patient-acceptance-session/,
  );
  assert.equal(transcriptRequest.csrf, transcriptRequest.cookies.rehab_csrf);
  const auditRequest = apiData.calls.requests.find(
    (request) => request.path === "/admin/audit-logs",
  );
  assert.match(auditRequest.cookie, /rehab_session=audit-acceptance-session/);
  assert.doesNotMatch(auditRequest.cookie, /patient-acceptance-session/);
  const csrfRequests = apiData.calls.requests.filter(
    (request) => request.path === "/auth/csrf",
  );
  assert.equal(csrfRequests.length, 2);
  assert.deepEqual(
    csrfRequests.map((request) => request.cookie),
    ["", ""],
  );
});

test("speech transcript acceptance verifier rejects missing explicit API URL and credentials before API calls", async () => {
  const result = await verifySpeechTranscriptAcceptance({
    fetchImpl: createFetchImpl(),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /patientPassword/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.match(result.failures.join("\n"), /auditPassword/);
});

test("speech transcript acceptance verifier does not accept legacy bearer credentials", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const result = await verifySpeechTranscriptAcceptance({
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "legacy-patient-token",
    auditToken: "legacy-audit-token",
    patientId: "patient_real_001",
    assessmentType: "MMSE/CDR",
    audioFilePath,
    audioMimeType: "audio/wav",
    durationSeconds: 42,
    fetchImpl: createFetchImpl(apiData),
  });

  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.equal(apiData.calls.requests.length, 0);
});

test("speech transcript acceptance verifier rejects shared patient and audit accounts before file reads or network calls", async (t) => {
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

  const result = await verifySpeechTranscriptAcceptance(
    validConfig({
      audioFilePath,
      auditAccount: "patient-acceptance",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /patientAccount.*auditAccount|不同账号/,
  );
  assert.equal(fileAccessCount, 0);
  assert.equal(apiData.calls.requests.length, 0);
});

test("speech transcript acceptance verifier rejects every invalid CSRF and login 2xx response", async (t) => {
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
    "csrf:patient-acceptance",
    "login:patient-acceptance",
    "csrf:audit-acceptance",
    "login:audit-acceptance",
  ]) {
    for (const [caseName, override] of invalidResponses) {
      await t.test(`${node} rejects ${caseName}`, async () => {
        const apiData = createApiData();
        apiData.responseOverrides[node] = override;
        const result = await verifySpeechTranscriptAcceptance(
          validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
        );

        assert.notDeepEqual(result.failures, []);
        assert.doesNotMatch(result.failures.join("\n"), new RegExp(secret));
        assert.doesNotMatch(result.failures.join("\n"), /accessToken/);
      });
    }
  }
});

test("speech transcript acceptance verifier rejects every invalid 2xx body at every required API node", async (t) => {
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

  for (const node of ["patient", "transcript", "audit"]) {
    for (const [caseName, override] of invalidResponses) {
      await t.test(`${node} rejects ${caseName}`, async () => {
        const apiData = createApiData();
        apiData.responseOverrides[node] = override;
        const result = await verifySpeechTranscriptAcceptance(
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

test("speech transcript acceptance verifier rejects audit metadata key variants", async () => {
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
    const result = await verifySpeechTranscriptAcceptance(
      validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("speech transcript acceptance config template uses isolated account credentials", async () => {
  const template = JSON.parse(
    await readFile(
      "docs/templates/speech-transcript-acceptance-config.template.json",
      "utf8",
    ),
  );

  for (const key of [
    "patientAccount",
    "patientPassword",
    "auditAccount",
    "auditPassword",
  ]) {
    assert.equal(typeof template[key], "string");
    assert.ok(template[key].length > 0);
  }
  assert.equal("patientToken" in template, false);
  assert.equal("auditToken" in template, false);
});

test("speech transcript acceptance verifier rejects browser webm as formal provider audio", async () => {
  const { audioFilePath } = await prepareAudioFile("formal-speech.webm");
  const apiData = createApiData();
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({
      audioFilePath,
      audioMimeType: "audio/webm",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(result.failures.join("\n"), /正式音频格式/);
  assert.equal(apiData.calls.transcriptRequests, 0);
});

test("speech transcript acceptance verifier rejects mock or demo API URLs", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({
      apiBaseUrl: "https://mock-demo-rehab.example.com/api",
      audioFilePath,
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /mock|demo|fallback|fixed|seed|manual/i,
  );
});

test("speech transcript acceptance verifier rejects revoked microphone consent before submitting audio", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    patient: {
      consents: [
        consent("privacy_policy"),
        consent("ai_processing"),
        consent("microphone_capture", {
          status: "revoked",
          revokedAt: "2026-05-27T09:55:00.000Z",
        }),
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /microphone_capture/);
  assert.equal(apiData.calls.transcriptRequests, 0);
});

test("speech transcript acceptance verifier rejects transcript responses missing provider evidence", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    transcript: {
      speechEvidence: {
        callId: "",
      },
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /speechEvidence.callId/);
});

test("speech transcript acceptance verifier rejects audit logs that do not match provider call id", async () => {
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
            callId: "different-call",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
          },
        },
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计日志/);
});

test("speech transcript acceptance verifier requires exactly one audit candidate and scans every duplicate", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const duplicate = structuredClone(
    apiData.audit["ai.assessment_speech_transcript.generate"][0],
  );
  duplicate.id = "audit_speech_transcript_002";
  duplicate.metadata.transcript = "不得进入审计的完整转写";
  apiData.audit["ai.assessment_speech_transcript.generate"].push(duplicate);

  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /恰好 1 条|数量.*1/);
  assert.match(failures, /metadata\.transcript/);
});

test("speech transcript acceptance verifier binds audit audio to current speech evidence", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  apiData.audit[
    "ai.assessment_speech_transcript.generate"
  ][0].metadata.audio.durationSeconds = 41;

  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /audio|审计日志/);
});

test("speech transcript acceptance verifier scans dangerous response key variants", async () => {
  const { audioFilePath } = await prepareAudioFile();
  for (const key of [
    "fallbackEnabled",
    "mockResult",
    "demoMode",
    "syntheticAudio",
  ]) {
    const apiData = createApiData();
    apiData.transcript.speechEvidence[key] = false;
    const result = await verifySpeechTranscriptAcceptance(
      validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("speech transcript acceptance verifier rejects Bearer values ending in equals", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  apiData.transcript.speechEvidence.callId = "Bearer abcdefg=";
  apiData.audit["ai.assessment_speech_transcript.generate"][0].metadata.callId =
    "Bearer abcdefg=";

  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.callId/);
});

test("speech transcript acceptance verifier accepts a legitimate 40-character hex callId", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData();
  const callId = "0123456789abcdef0123456789abcdef01234567";
  apiData.transcript.speechEvidence.callId = callId;
  apiData.audit["ai.assessment_speech_transcript.generate"][0].metadata.callId =
    callId;

  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
});

test("speech transcript acceptance verifier rejects demo fallback or manual transcript responses", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    transcript: {
      transcript: "demo fixed transcript from fallback manual speech service",
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /mock|demo|fallback|fixed|manual/i);
});

test("speech transcript acceptance verifier rejects manual markers in provider evidence and audit metadata", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    transcript: {
      speechEvidence: {
        callId: "manual-transcript-call",
      },
    },
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
            callId: "manual-transcript-call",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
          },
        },
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /manual/);
});

test("speech transcript acceptance verifier requires provider audio source and call time", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const apiData = createApiData({
    transcript: {
      speechEvidence: {
        source: "manual_transcript",
        calledAt: "",
      },
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /speechEvidence.source/);
  assert.match(result.failures.join("\n"), /speechEvidence.calledAt/);
});

test("speech transcript acceptance verifier rejects audit metadata containing sensitive payloads", async () => {
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
            audioContentBase64:
              Buffer.from("formal-audio-bytes").toString("base64"),
            transcript: "今天是星期三，我记得苹果、桌子、硬币三个词。",
            apiKey: "sk-should-not-be-logged",
          },
        },
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /审计 metadata/);
  assert.doesNotMatch(failures, /metadata\.endpointRef/);
});

test("speech transcript acceptance verifier rejects raw payload metadata keys", async () => {
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
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.payload/);
});

test("speech transcript acceptance verifier rejects token-like endpointRef URL parts", async () => {
  const { audioFilePath } = await prepareAudioFile();
  const endpointRef =
    "https://token-plan-secretabcdefgh.xiaomimimo.com/v1/chat/completions";
  const apiData = createApiData({
    transcript: {
      speechEvidence: {
        endpointRef,
      },
    },
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
            endpointRef,
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
          },
        },
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.endpointRef/);
});

test("speech transcript acceptance verifier rejects audit metadata values containing demo markers or raw payloads", async () => {
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
            message: "demo speech transcript accepted",
            payload: "Bearer patient-secret-token",
            nested: {
              data: "Zm9ybWFsLWF1ZGlvLWJ5dGVzZm9ybWFsLWF1ZGlvLWJ5dGVzZm9ybWFsLWF1ZGlvLWJ5dGVz",
            },
          },
        },
      ],
    },
  });
  const result = await verifySpeechTranscriptAcceptance(
    validConfig({ audioFilePath, fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /审计 metadata/);
  assert.doesNotMatch(failures, /metadata\.endpointRef/);
});

test("speech transcript acceptance CLI redacts failed response bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-"));
  const audioFilePath = join(dir, "formal-speech.wav");
  const configPath = join(dir, "speech-config.json");
  await writeFile(audioFilePath, "formal-audio-bytes");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath,
      audioMimeType: "audio/wav",
      durationSeconds: 42,
    }),
  );
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "globalThis.fetch = async (url) => {",
      "  const response = new Response(JSON.stringify({",
      "      message: 'provider failed',",
      "      apiKey: 'sk-secret-value',",
      "      token: 'patient-token',",
      "      audioContentBase64: 'Zm9ybWFsLWF1ZGlvLWJ5dGVz',",
      "      transcript: '患者完整敏感转写内容'.repeat(20)",
      "  }), { status: 500, headers: { 'Content-Type': 'application/json' } });",
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
        "scripts/verify-speech-transcript-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 500/);
      assert.doesNotMatch(error.stderr, /sk-secret-value/);
      assert.doesNotMatch(error.stderr, /patient-token/);
      assert.doesNotMatch(error.stderr, /Zm9ybWFsLWF1ZGlvLWJ5dGVz/);
      assert.doesNotMatch(
        error.stderr,
        /患者完整敏感转写内容患者完整敏感转写内容/,
      );
      return true;
    },
  );
});

test("speech transcript acceptance CLI never prints failed response body details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-"));
  const audioFilePath = join(dir, "formal-speech.wav");
  const configPath = join(dir, "speech-config.json");
  await writeFile(audioFilePath, "formal-audio-bytes");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath,
      audioMimeType: "audio/wav",
      durationSeconds: 42,
    }),
  );
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "globalThis.fetch = async (url) => {",
      "  const response = new Response('detail=real-short-token-123 transcript=短转写内容 key=real-key', { status: 502 });",
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
        "scripts/verify-speech-transcript-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 502/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /real-short-token-123/);
      assert.doesNotMatch(error.stderr, /短转写内容/);
      assert.doesNotMatch(error.stderr, /real-key/);
      return true;
    },
  );
});

test("speech transcript acceptance CLI reports malformed response types without leaking values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-shape-"));
  const audioFilePath = join(dir, "formal-speech.wav");
  const configPath = join(dir, "speech-config.json");
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  const secret = "cli-shape-secret-access-token";
  await writeFile(audioFilePath, "formal-audio-bytes");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath,
      audioMimeType: "audio/wav",
      durationSeconds: 42,
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
      "globalThis.fetch = async (url, options = {}) => {",
      "  const path = new URL(url).pathname;",
      "  if (path === '/auth/csrf') {",
      "    const token = `csrf-${++csrf}`;",
      "    return reply(url, 200, { csrfToken: token }, [`rehab_csrf=${token}; Path=/`]);",
      "  }",
      "  if (path === '/auth/login') {",
      "    const token = `csrf-${++csrf}`;",
      "    return reply(url, 201, { status: 'authenticated', context: { primaryRole: 'patient' } }, [`rehab_session=patient-session; Path=/`, `rehab_csrf=${token}; Path=/`]);",
      "  }",
      "  if (path === '/patients/patient_real_001') {",
      "    return reply(url, 200, { id: 'patient_real_001', consents: [",
      "      { consentType: 'privacy_policy', status: 'granted', revokedAt: null },",
      "      { consentType: 'ai_processing', status: 'granted', revokedAt: null },",
      "      { consentType: 'microphone_capture', status: 'granted', revokedAt: null }",
      "    ] });",
      "  }",
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
        "scripts/verify-speech-transcript-acceptance.mjs",
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

test("speech transcript acceptance CLI reports invalid audio file path without printing a stack trace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-"));
  const configPath = join(dir, "speech-config.json");
  await mkdir(join(dir, "artifacts"), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      assessmentType: "MMSE/CDR",
      audioFilePath: join(dir, "missing.wav"),
      audioMimeType: "audio/wav",
      durationSeconds: 42,
    }),
  );

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-speech-transcript-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /音频文件不存在/);
      assert.doesNotMatch(error.stderr, /ENOENT|at readFile|SyntaxError/);
      return true;
    },
  );
});

test("speech transcript acceptance CLI redacts malformed JSON parser details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-json-"));
  const configPath = join(dir, "speech-config.json");
  const secret = "CONFIG_PASSWORD_SECRET_7f3f62";
  await writeFile(configPath, secret);

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-speech-transcript-acceptance.mjs",
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
          ? "patient-acceptance"
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
        "patient-acceptance": "patient-password",
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
              body.account === "audit-acceptance" ? "admin" : "patient",
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

    if (parsed.pathname.endsWith(`/patients/${apiData.patient.id}`)) {
      if (auth.account !== "patient-acceptance") {
        return response(403, { message: "wrong patient session" }, { url });
      }
      if (apiData.responseOverrides.patient) {
        return responseFromOverride(apiData.responseOverrides.patient, url);
      }
      return response(200, apiData.patient, { url });
    }

    if (parsed.pathname.endsWith("/ai/assessment-speech-transcripts")) {
      if (auth.account !== "patient-acceptance") {
        return response(403, { message: "wrong patient session" }, { url });
      }
      apiData.calls.transcriptRequests += 1;
      if (apiData.responseOverrides.transcript) {
        return responseFromOverride(apiData.responseOverrides.transcript, url);
      }
      return response(200, apiData.transcript, { url });
    }

    if (parsed.pathname.endsWith("/admin/audit-logs")) {
      if (auth.account !== "audit-acceptance") {
        return response(403, { message: "wrong audit session" }, { url });
      }
      if (apiData.responseOverrides.audit) {
        return responseFromOverride(apiData.responseOverrides.audit, url);
      }
      return response(
        200,
        apiData.audit[parsed.searchParams.get("action") ?? ""] ?? [],
        { url },
      );
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

async function prepareAudioFile(fileName = "formal-speech.wav") {
  const dir = await mkdtemp(join(tmpdir(), "speech-acceptance-audio-"));
  const audioFilePath = join(dir, fileName);
  await writeFile(audioFilePath, "formal-audio-bytes");
  return { audioFilePath };
}

function createApiData(overrides = {}) {
  return deepMerge(
    {
      calls: {
        csrfRequests: 0,
        transcriptRequests: 0,
        requests: [],
      },
      responseOverrides: {},
      patient: {
        id: "patient_real_001",
        consents: [
          consent("privacy_policy"),
          consent("ai_processing"),
          consent("microphone_capture"),
        ],
      },
      transcript: {
        patientId: "patient_real_001",
        assessmentType: "MMSE/CDR",
        status: "transcribed",
        transcript: "今天是星期三，我记得苹果、桌子、硬币三个词。",
        speechEvidence: {
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
      },
    },
    overrides,
  );
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
