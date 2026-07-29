import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { verifyTtsSpeechOutputAcceptance } from "../verify-tts-speech-output-acceptance.mjs";

const execFileAsync = promisify(execFile);
const validWavAudioBytes = createMinimalPcmWav();
const validWavAudioBase64 = validWavAudioBytes.toString("base64");

function validConfig(overrides = {}) {
  const config = {
    apiBaseUrl: "https://rehab.example.com",
    patientAccount: "patient-acceptance",
    patientPassword: "patient-password",
    auditAccount: "audit-acceptance",
    auditPassword: "audit-password",
    patientId: "patient_real_001",
    text: "请告诉我，今天是星期几？",
    scenario: "assessment_prompt",
    fetchImpl: createFetchImpl(),
    ...overrides,
  };
  globalThis.fetch = config.fetchImpl;
  return config;
}

test("TTS speech output acceptance verifier calls platform API and verifies consent plus audit", async () => {
  const apiData = createApiData();
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
  assert.equal(
    apiData.calls.requests.some((request) => request.authorization !== null),
    false,
  );
  const ttsRequest = apiData.calls.requests.find(
    (request) => request.path === "/ai/tts-speech-outputs",
  );
  assert.match(ttsRequest.cookie, /rehab_session=patient-acceptance-session/);
  assert.equal(ttsRequest.csrf, ttsRequest.cookies.rehab_csrf);
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

test("TTS speech output acceptance verifier rejects missing explicit API URL and credentials before API calls", async () => {
  const result = await verifyTtsSpeechOutputAcceptance({
    fetchImpl: createFetchImpl(),
  });

  assert.match(result.failures.join("\n"), /apiBaseUrl/);
  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /patientPassword/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.match(result.failures.join("\n"), /auditPassword/);
});

test("TTS speech output acceptance verifier does not accept legacy bearer credentials", async () => {
  const apiData = createApiData();
  const result = await verifyTtsSpeechOutputAcceptance({
    apiBaseUrl: "https://rehab.example.com",
    patientToken: "legacy-patient-token",
    auditToken: "legacy-audit-token",
    patientId: "patient_real_001",
    text: "请告诉我，今天是星期几？",
    scenario: "assessment_prompt",
    fetchImpl: createFetchImpl(apiData),
  });

  assert.match(result.failures.join("\n"), /patientAccount/);
  assert.match(result.failures.join("\n"), /auditAccount/);
  assert.equal(apiData.calls.requests.length, 0);
});

test("TTS speech output acceptance verifier rejects shared patient and audit accounts before network calls", async () => {
  const apiData = createApiData();
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({
      auditAccount: "patient-acceptance",
      fetchImpl: createFetchImpl(apiData),
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /patientAccount.*auditAccount|不同账号/,
  );
  assert.equal(apiData.calls.requests.length, 0);
});

test("TTS speech output acceptance verifier rejects every invalid CSRF and login 2xx response", async (t) => {
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
        const result = await verifyTtsSpeechOutputAcceptance(
          validConfig({ fetchImpl: createFetchImpl(apiData) }),
        );

        assert.notDeepEqual(result.failures, []);
        assert.doesNotMatch(result.failures.join("\n"), new RegExp(secret));
        assert.doesNotMatch(result.failures.join("\n"), /accessToken/);
      });
    }
  }
});

test("TTS speech output acceptance verifier rejects every invalid 2xx body at every required API node", async (t) => {
  const secret = "shape-secret-access-token";
  const invalidResponses = [
    ["204", { status: 204 }],
    ["null", { body: null }],
    ["false", { body: false }],
    ["empty string", { body: "" }],
    ["raw non-JSON string", { rawBody: "raw-provider-response" }],
    ["wrong shape", { body: { status: { accessToken: secret } } }],
  ];

  for (const node of ["patient", "output", "audit"]) {
    for (const [caseName, override] of invalidResponses) {
      await t.test(`${node} rejects ${caseName}`, async () => {
        const apiData = createApiData();
        apiData.responseOverrides[node] = override;
        const result = await verifyTtsSpeechOutputAcceptance(
          validConfig({ fetchImpl: createFetchImpl(apiData) }),
        );

        assert.notDeepEqual(result.failures, []);
        assert.doesNotMatch(result.failures.join("\n"), new RegExp(secret));
        assert.doesNotMatch(result.failures.join("\n"), /accessToken/);
      });
    }
  }
});

test("TTS speech output acceptance verifier rejects audit metadata key variants", async () => {
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
    apiData.audit["ai.tts_speech_output.generate"][0].metadata[key] =
      "opaque-sensitive-material";
    const result = await verifyTtsSpeechOutputAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("TTS speech output acceptance config template uses isolated account credentials", async () => {
  const template = JSON.parse(
    await readFile(
      "docs/templates/tts-speech-output-acceptance-config.template.json",
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

test("TTS speech output acceptance verifier rejects revoked AI processing consent before submitting text", async () => {
  const apiData = createApiData({
    patient: {
      consents: [
        consent("privacy_policy"),
        consent("ai_processing", {
          status: "revoked",
          revokedAt: "2026-05-29T09:55:00.000Z",
        }),
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /ai_processing/);
  assert.equal(apiData.calls.ttsRequests, 0);
});

test("TTS speech output acceptance verifier rejects responses missing provider audio", async () => {
  const apiData = createApiData({
    output: {
      audio: {
        contentBase64: "",
        byteLength: 0,
      },
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /audio.contentBase64/);
});

test("TTS speech output acceptance verifier rejects audio bytes that do not match the declared mime type", async () => {
  const apiData = createApiData({
    output: {
      audio: {
        contentBase64: Buffer.from("formal-tts-audio-bytes").toString("base64"),
        mimeType: "audio/wav",
        byteLength: 22,
      },
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(
    result.failures.join("\n"),
    /audio.contentBase64.*WAV|audio.contentBase64.*MP3/,
  );
});

test("TTS speech output acceptance verifier rejects a 16-byte RIFF/WAVE prefix without WAV chunks", async () => {
  const apiData = createApiData();
  setOutputAudio(apiData, Buffer.from("RIFF$\x00\x00\x00WAVEfmt ", "binary"));

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /WAV|RIFF|fmt|data/);
});

test("TTS speech output acceptance verifier rejects decoded length that differs from declared byteLength", async () => {
  const apiData = createApiData();
  setOutputAudio(apiData, validWavAudioBytes, {
    byteLength: validWavAudioBytes.length + 1,
  });

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /byteLength|解码/);
});

test("TTS speech output acceptance verifier only accepts the declared WAV contract", async () => {
  const apiData = createApiData();
  setOutputAudio(apiData, Buffer.from("ID3formal-mp3-audio"), {
    mimeType: "audio/mpeg",
    format: "mp3",
  });

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /WAV|audio\/wav/);
});

test("TTS speech output acceptance verifier rejects malformed or unsupported WAV structures", async (t) => {
  const cases = [
    ["RIFF size mismatch", (bytes) => bytes.writeUInt32LE(1, 4)],
    ["missing fmt chunk", (bytes) => bytes.write("JUNK", 12, "ascii")],
    ["unsupported encoding", (bytes) => bytes.writeUInt16LE(3, 20)],
    ["unsupported channels", (bytes) => bytes.writeUInt16LE(3, 22)],
    ["unsupported sample rate", (bytes) => bytes.writeUInt32LE(96000, 24)],
    ["invalid byteRate", (bytes) => bytes.writeUInt32LE(1, 28)],
    ["invalid blockAlign", (bytes) => bytes.writeUInt16LE(1, 32)],
    ["unsupported bit depth", (bytes) => bytes.writeUInt16LE(12, 34)],
    ["missing data chunk", (bytes) => bytes.write("JUNK", 36, "ascii")],
    ["chunk overflow", (bytes) => bytes.writeUInt32LE(4096, 40)],
  ];

  for (const [caseName, mutate] of cases) {
    await t.test(caseName, async () => {
      const apiData = createApiData();
      const bytes = Buffer.from(validWavAudioBytes);
      mutate(bytes);
      setOutputAudio(apiData, bytes);

      const result = await verifyTtsSpeechOutputAcceptance(
        validConfig({ fetchImpl: createFetchImpl(apiData) }),
      );

      assert.match(result.failures.join("\n"), /WAV|RIFF|fmt|data|音频/);
    });
  }

  await t.test("empty data chunk", async () => {
    const apiData = createApiData();
    setOutputAudio(apiData, createMinimalPcmWav({ data: Buffer.alloc(0) }));
    const result = await verifyTtsSpeechOutputAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), /data|WAV|音频/);
  });

  await t.test("missing odd chunk padding", async () => {
    const paddedBytes = createMinimalPcmWav({
      extraChunks: [{ id: "JUNK", data: Buffer.from([1]) }],
    });
    const bytes = Buffer.concat([
      paddedBytes.subarray(0, 45),
      paddedBytes.subarray(46),
    ]);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    const apiData = createApiData();
    setOutputAudio(apiData, bytes);
    const result = await verifyTtsSpeechOutputAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), /padding|chunk|WAV|音频/);
  });
});

test("TTS speech output acceptance verifier accepts a valid padded unknown WAV chunk", async () => {
  const apiData = createApiData();
  setOutputAudio(
    apiData,
    createMinimalPcmWav({
      extraChunks: [{ id: "JUNK", data: Buffer.from([1]) }],
    }),
  );

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
});

test("TTS speech output acceptance verifier rejects audit logs that do not match provider call id", async () => {
  const apiData = createApiData({
    audit: {
      "ai.tts_speech_output.generate": [
        {
          id: "audit_tts_output_001",
          action: "ai.tts_speech_output.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-tts",
            modelVersion: "mimo-v2.5-tts",
            callId: "different-call",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
          },
        },
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /审计日志/);
});

test("TTS speech output acceptance verifier requires exactly one audit candidate and scans every duplicate", async () => {
  const apiData = createApiData();
  const duplicate = structuredClone(
    apiData.audit["ai.tts_speech_output.generate"][0],
  );
  duplicate.id = "audit_tts_output_002";
  duplicate.metadata.audio.contentBase64 = "UklGRg==";
  apiData.audit["ai.tts_speech_output.generate"].push(duplicate);

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /恰好 1 条|数量.*1/);
  assert.match(failures, /audio\.contentBase64/);
});

test("TTS speech output acceptance verifier binds scenario, inputTextHash, and audio to current evidence", async () => {
  const apiData = createApiData();
  const metadata = apiData.audit["ai.tts_speech_output.generate"][0].metadata;
  metadata.scenario = "caregiver_prompt";
  metadata.inputTextHash = "a".repeat(64);
  metadata.audio.byteLength += 2;

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(
    result.failures.join("\n"),
    /scenario|inputTextHash|audio|供应商调用证据|审计日志/,
  );
});

test("TTS speech output acceptance verifier scans dangerous response key variants", async () => {
  for (const key of [
    "fallbackEnabled",
    "mockResult",
    "demoMode",
    "syntheticAudio",
  ]) {
    const apiData = createApiData();
    apiData.output.ttsEvidence[key] = false;
    const result = await verifyTtsSpeechOutputAcceptance(
      validConfig({ fetchImpl: createFetchImpl(apiData) }),
    );
    assert.match(result.failures.join("\n"), new RegExp(key));
  }
});

test("TTS speech output acceptance verifier rejects Bearer values ending in equals", async () => {
  const apiData = createApiData();
  apiData.output.ttsEvidence.voiceId = "Bearer abcdefg=";
  apiData.audit["ai.tts_speech_output.generate"][0].metadata.voiceId =
    "Bearer abcdefg=";

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.voiceId/);
});

test("TTS speech output acceptance verifier accepts a legitimate 40-character hex callId", async () => {
  const apiData = createApiData();
  const callId = "0123456789abcdef0123456789abcdef01234567";
  apiData.output.ttsEvidence.callId = callId;
  apiData.audit["ai.tts_speech_output.generate"][0].metadata.callId = callId;

  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.deepEqual(result.failures, []);
});

test("TTS speech output acceptance verifier rejects fallback or manual provider evidence", async () => {
  const apiData = createApiData({
    output: {
      ttsEvidence: {
        callId: "manual-tts-call",
      },
    },
    audit: {
      "ai.tts_speech_output.generate": [
        {
          id: "audit_tts_output_001",
          action: "ai.tts_speech_output.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-tts",
            modelVersion: "mimo-v2.5-tts",
            callId: "manual-tts-call",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_text_to_speech",
            calledAt: "2026-05-29T09:58:45.000Z",
            voiceId: "Chloe",
          },
        },
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /manual/);
});

test("TTS speech output acceptance verifier rejects audit metadata containing sensitive payloads", async () => {
  const apiData = createApiData({
    audit: {
      "ai.tts_speech_output.generate": [
        {
          id: "audit_tts_output_001",
          action: "ai.tts_speech_output.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-tts",
            modelVersion: "mimo-v2.5-tts",
            callId: "tts-call-real-001",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_text_to_speech",
            calledAt: "2026-05-29T09:58:45.000Z",
            voiceId: "Chloe",
            text: "请告诉我，今天是星期几？",
            audioContentBase64: Buffer.from("formal-audio").toString("base64"),
            apiKey: "sk-should-not-be-logged",
            providerAuthorization: "Bearer malicious-tts-token",
          },
        },
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /审计 metadata/);
  assert.doesNotMatch(failures, /metadata\.endpointRef/);
});

test("TTS speech output acceptance verifier rejects raw payload metadata keys", async () => {
  const apiData = createApiData({
    audit: {
      "ai.tts_speech_output.generate": [
        {
          id: "audit_tts_output_001",
          action: "ai.tts_speech_output.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-tts",
            modelVersion: "mimo-v2.5-tts",
            callId: "tts-call-real-001",
            endpointRef:
              "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_text_to_speech",
            calledAt: "2026-05-29T09:58:45.000Z",
            voiceId: "Chloe",
            payload: {
              providerRequestId: "provider-request-001",
              summary: "structured provider request envelope",
            },
          },
        },
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.payload/);
});

test("TTS speech output acceptance verifier rejects token-like endpointRef URL parts", async () => {
  const endpointRef =
    "https://token-plan-secretabcdefgh.xiaomimimo.com/v1/chat/completions";
  const apiData = createApiData({
    output: {
      ttsEvidence: {
        endpointRef,
      },
    },
    audit: {
      "ai.tts_speech_output.generate": [
        {
          id: "audit_tts_output_001",
          action: "ai.tts_speech_output.generate",
          targetType: "patient_profile",
          targetId: "patient_real_001",
          result: "success",
          metadata: {
            provider: "xiaomi-mimo-tts",
            modelVersion: "mimo-v2.5-tts",
            callId: "tts-call-real-001",
            endpointRef,
            source: "provider_text_to_speech",
            calledAt: "2026-05-29T09:58:45.000Z",
            voiceId: "Chloe",
          },
        },
      ],
    },
  });
  const result = await verifyTtsSpeechOutputAcceptance(
    validConfig({ fetchImpl: createFetchImpl(apiData) }),
  );

  assert.match(result.failures.join("\n"), /metadata\.endpointRef/);
});

test("TTS speech output acceptance CLI redacts failed response bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tts-acceptance-"));
  const configPath = join(dir, "tts-config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      text: "请告诉我，今天是星期几？",
      scenario: "assessment_prompt",
    }),
  );
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  await writeFile(
    fetchFixturePath,
    [
      "globalThis.fetch = async (url) => {",
      "  const response = new Response(JSON.stringify({ apiKey: 'sk-secret-value', token: 'patient-token', text: '完整待合成文本'.repeat(20), audioContentBase64: 'Zm9ybWFsLWF1ZGlvLWJ5dGVz' }), { status: 500, headers: { 'Content-Type': 'application/json' } });",
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
        "scripts/verify-tts-speech-output-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /HTTP 500/);
      assert.match(error.stderr, /响应体已隐藏/);
      assert.doesNotMatch(error.stderr, /sk-secret-value/);
      assert.doesNotMatch(error.stderr, /patient-token/);
      assert.doesNotMatch(error.stderr, /完整待合成文本完整待合成文本/);
      assert.doesNotMatch(error.stderr, /Zm9ybWFsLWF1ZGlv/);
      return true;
    },
  );
});

test("TTS speech output acceptance CLI reports malformed response types without leaking values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tts-acceptance-shape-"));
  const configPath = join(dir, "tts-config.json");
  const fetchFixturePath = join(dir, "fetch-fixture.mjs");
  const secret = "cli-shape-secret-access-token";
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: "https://rehab.example.com",
      patientAccount: "patient-acceptance",
      patientPassword: "patient-password",
      auditAccount: "audit-acceptance",
      auditPassword: "audit-password",
      patientId: "patient_real_001",
      text: "请告诉我，今天是星期几？",
      scenario: "assessment_prompt",
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
      "    return reply(url, 201, { status: 'authenticated', context: { primaryRole: 'patient' }, accessToken: 'malicious-login-access-token' }, [`rehab_session=patient-session; Path=/`, `rehab_csrf=${token}; Path=/`]);",
      "  }",
      "  if (path === '/patients/patient_real_001') {",
      "    return reply(url, 200, { id: 'patient_real_001', consents: [",
      "      { consentType: 'privacy_policy', status: 'granted', revokedAt: null },",
      "      { consentType: 'ai_processing', status: 'granted', revokedAt: null }",
      "    ] });",
      "  }",
      `  if (path === '/ai/tts-speech-outputs') return reply(url, 200, { patientId: 'patient_real_001', status: { accessToken: '${secret}' } });`,
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
        "scripts/verify-tts-speech-output-acceptance.mjs",
        configPath,
      ]),
    (error) => {
      assert.match(error.stderr, /TTS 语音输出响应\.status/);
      assert.match(error.stderr, /期望类型.*string.*实际类型.*object/);
      assert.doesNotMatch(error.stderr, new RegExp(secret));
      assert.doesNotMatch(error.stderr, /accessToken/);
      return true;
    },
  );
});

test("TTS speech output acceptance CLI redacts malformed JSON parser details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tts-acceptance-json-"));
  const configPath = join(dir, "tts-config.json");
  const secret = "CONFIG_PASSWORD_SECRET_d91270";
  await writeFile(configPath, secret);

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-tts-speech-output-acceptance.mjs",
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

    if (parsed.pathname.endsWith("/ai/tts-speech-outputs")) {
      if (auth.account !== "patient-acceptance") {
        return response(403, { message: "wrong patient session" }, { url });
      }
      apiData.calls.ttsRequests += 1;
      if (apiData.responseOverrides.output) {
        return responseFromOverride(apiData.responseOverrides.output, url);
      }
      return response(200, apiData.output, { url });
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

function createApiData(overrides = {}) {
  return deepMerge(
    {
      calls: {
        csrfRequests: 0,
        ttsRequests: 0,
        requests: [],
      },
      responseOverrides: {},
      patient: {
        id: "patient_real_001",
        consents: [consent("privacy_policy"), consent("ai_processing")],
      },
      output: {
        patientId: "patient_real_001",
        status: "synthesized",
        audio: {
          contentBase64: validWavAudioBase64,
          mimeType: "audio/wav",
          byteLength: validWavAudioBytes.length,
        },
        ttsEvidence: {
          provider: "xiaomi-mimo-tts",
          modelVersion: "mimo-v2.5-tts",
          callId: "tts-call-real-001",
          endpointRef:
            "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
          source: "provider_text_to_speech",
          calledAt: "2026-05-29T09:58:45.000Z",
          voiceId: "Chloe",
          scenario: "assessment_prompt",
          inputTextHash:
            "3f8f0e7b1d0f3c6a42c77bd88d2e90bc67504a1a4a887a5e25f44fd595b7c57e",
          audio: {
            mimeType: "audio/wav",
            format: "wav",
            byteLength: validWavAudioBytes.length,
          },
        },
      },
      audit: {
        "ai.tts_speech_output.generate": [
          {
            id: "audit_tts_output_001",
            action: "ai.tts_speech_output.generate",
            targetType: "patient_profile",
            targetId: "patient_real_001",
            result: "success",
            metadata: {
              provider: "xiaomi-mimo-tts",
              modelVersion: "mimo-v2.5-tts",
              callId: "tts-call-real-001",
              endpointRef:
                "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
              source: "provider_text_to_speech",
              calledAt: "2026-05-29T09:58:45.000Z",
              voiceId: "Chloe",
              scenario: "assessment_prompt",
              inputTextHash:
                "3f8f0e7b1d0f3c6a42c77bd88d2e90bc67504a1a4a887a5e25f44fd595b7c57e",
              audio: {
                mimeType: "audio/wav",
                format: "wav",
                byteLength: validWavAudioBytes.length,
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
    grantedAt: "2026-05-29T09:50:00.000Z",
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

function setOutputAudio(
  apiData,
  bytes,
  { mimeType = "audio/wav", format = "wav", byteLength = bytes.length } = {},
) {
  apiData.output.audio = {
    contentBase64: bytes.toString("base64"),
    mimeType,
    byteLength,
  };
  apiData.output.ttsEvidence.audio = { mimeType, format, byteLength };
  apiData.audit["ai.tts_speech_output.generate"][0].metadata.audio = {
    mimeType,
    format,
    byteLength,
  };
}

function createMinimalPcmWav({
  audioFormat = 1,
  channels = 1,
  sampleRate = 24000,
  bitsPerSample = 16,
  data = Buffer.from([0, 0]),
  extraChunks = [],
} = {}) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const fmtData = Buffer.alloc(16);
  fmtData.writeUInt16LE(audioFormat, 0);
  fmtData.writeUInt16LE(channels, 2);
  fmtData.writeUInt32LE(sampleRate, 4);
  fmtData.writeUInt32LE(byteRate, 8);
  fmtData.writeUInt16LE(blockAlign, 12);
  fmtData.writeUInt16LE(bitsPerSample, 14);
  const chunks = [
    createWavChunk("fmt ", fmtData),
    ...extraChunks.map((chunk) => createWavChunk(chunk.id, chunk.data)),
    createWavChunk("data", data),
  ];
  const wavePayload = Buffer.concat([Buffer.from("WAVE"), ...chunks]);
  const riffHeader = Buffer.alloc(8);
  riffHeader.write("RIFF", 0, "ascii");
  riffHeader.writeUInt32LE(wavePayload.length, 4);
  return Buffer.concat([riffHeader, wavePayload]);
}

function createWavChunk(id, data) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, "ascii");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([
    header,
    data,
    ...(data.length % 2 === 0 ? [] : [Buffer.alloc(1)]),
  ]);
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
