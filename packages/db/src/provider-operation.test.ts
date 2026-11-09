import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeProviderOperationIdentity,
  createProviderOperationRequestHmac,
  createProviderOperationRequestIntentHmac,
  createProviderOperationResponseHmac,
} from "./provider-operation";

const identity = {
  organizationId: "organization-001",
  patientId: "patient-001",
  actorUserId: "doctor-001",
  operation: "assessment_draft" as const,
  clientIdempotencyKey: "seed-assessment-draft-001",
};
const request = {
  physicalConditions: ["no_known_limitations"],
  transcript: "今天是星期一。苹果、桌子、硬币。",
  assessmentType: "MMSE/CDR",
};
const response = {
  result: {
    physicalConditions: ["no_known_limitations"],
    scoreSummary: { cdr: 1, mmse: 20 },
  },
};
const key = Buffer.alloc(32, 17);
const operationId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b206";

test("DB provider-operation helpers are deterministic and canonical", () => {
  assert.equal(
    canonicalizeProviderOperationIdentity({ ...identity }),
    canonicalizeProviderOperationIdentity({
      ...identity,
      organizationId: "organization-001",
    }),
  );
  assert.equal(
    createProviderOperationRequestHmac(identity, request, key),
    createProviderOperationRequestHmac(identity, {
      assessmentType: "MMSE/CDR",
      transcript: "今天是星期一。苹果、桌子、硬币。",
      physicalConditions: ["no_known_limitations"],
    }, key),
  );
  assert.equal(
    createProviderOperationRequestIntentHmac(identity, request, key, {
      type: "patient_profile",
      id: "patient-001",
      version: "v1",
    }),
    createProviderOperationRequestIntentHmac(identity, request, key, {
      type: "patient_profile",
      id: "patient-001",
      version: "v1",
    }),
  );
  assert.equal(
    createProviderOperationResponseHmac(operationId, response, key),
    createProviderOperationResponseHmac(operationId, {
      result: {
        scoreSummary: { mmse: 20, cdr: 1 },
        physicalConditions: ["no_known_limitations"],
      },
    }, key),
  );
  assert.notEqual(
    createProviderOperationRequestHmac(
      { ...identity, patientId: "patient-002" },
      request,
      key,
    ),
    createProviderOperationRequestHmac(identity, request, key),
  );
});
