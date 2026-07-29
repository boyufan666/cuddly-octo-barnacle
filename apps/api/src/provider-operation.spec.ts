import {
  assertProviderOperationStatusTransition,
  canTransitionProviderOperationStatus,
  createProviderOperationIdentityHash,
  createProviderOperationResponseHmac,
  createProviderOperationRequestIntentHmac,
  createProviderOperationRequestHmac,
  isProviderOperationKind,
  isProviderOperationStatus,
  providerOperationKinds,
  providerOperationStatuses,
  type ProviderOperationIdentity,
  type ProviderOperationStatus,
} from './provider-operation';

const identity: ProviderOperationIdentity = {
  organizationId: 'organization-001',
  patientId: 'patient-001',
  actorUserId: 'user-001',
  operation: 'assessment_draft',
  clientIdempotencyKey: 'assessment-request-000001',
};

const hmacKey = Buffer.alloc(32, 7);

describe('provider operation contract', () => {
  it('provides the four persisted operation kinds and all explicit statuses', () => {
    expect(providerOperationKinds).toEqual([
      'assessment_draft',
      'conversation_turn',
      'speech_transcript',
      'tts_output',
    ]);
    expect(providerOperationStatuses).toEqual([
      'accepted',
      'reserved',
      'dispatching',
      'completed',
      'provider_failed',
      'response_rejected',
      'outcome_unknown',
      'completed_confirmed',
      'closed_unconfirmed',
    ]);
    expect(isProviderOperationKind('tts_output')).toBe(true);
    expect(isProviderOperationKind('ai')).toBe(false);
    expect(isProviderOperationStatus('outcome_unknown')).toBe(true);
    expect(isProviderOperationStatus('retrying')).toBe(false);
  });

  it('creates deterministic identity hashes and request HMACs independent of object key order', () => {
    const sameRequestDifferentKeyOrder = {
      nested: { answer: 'yes', confidence: 0.8 },
      prompt: 'screened input',
    };
    const sameRequestOriginalOrder = {
      prompt: 'screened input',
      nested: { confidence: 0.8, answer: 'yes' },
    };

    expect(createProviderOperationIdentityHash(identity)).toBe(
      createProviderOperationIdentityHash({ ...identity }),
    );
    expect(
      createProviderOperationRequestHmac(
        identity,
        sameRequestOriginalOrder,
        hmacKey,
      ),
    ).toBe(
      createProviderOperationRequestHmac(
        identity,
        sameRequestDifferentKeyOrder,
        hmacKey,
      ),
    );
  });

  it('binds the request HMAC to the complete operation identity', () => {
    const request = { prompt: 'screened input' };
    const original = createProviderOperationRequestHmac(
      identity,
      request,
      hmacKey,
    );

    expect(
      createProviderOperationRequestHmac(
        { ...identity, patientId: 'patient-002' },
        request,
        hmacKey,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationRequestHmac(
        identity,
        { prompt: 'different screened input' },
        hmacKey,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationRequestHmac(
        identity,
        request,
        Buffer.alloc(32, 8),
      ),
    ).not.toBe(original);
  });

  it('creates a canonical response HMAC bound to its operation and encryption key', () => {
    const operationId = '9a9f4e6d-7d7c-4b3a-91f5-63ffdbaa9961';
    const original = createProviderOperationResponseHmac(
      operationId,
      { nested: { answer: 'yes', confidence: 0.8 }, summary: 'screened' },
      hmacKey,
    );

    expect(
      createProviderOperationResponseHmac(
        operationId,
        { summary: 'screened', nested: { confidence: 0.8, answer: 'yes' } },
        hmacKey,
      ),
    ).toBe(original);
    expect(
      createProviderOperationResponseHmac(
        '9a9f4e6d-7d7c-4b3a-91f5-63ffdbaa9962',
        { nested: { answer: 'yes', confidence: 0.8 }, summary: 'screened' },
        hmacKey,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationResponseHmac(
        operationId,
        { nested: { answer: 'no', confidence: 0.8 }, summary: 'screened' },
        hmacKey,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationResponseHmac(
        operationId,
        { nested: { answer: 'yes', confidence: 0.8 }, summary: 'screened' },
        Buffer.alloc(32, 8),
      ),
    ).not.toBe(original);
  });

  it('creates an intent HMAC independent of caller key and actor, but bound to scope, request, and business object', () => {
    const request = { prompt: 'screened input' };
    const expectedBusinessObject = {
      type: 'clinical_assessment',
      id: 'assessment-001',
      version: '1',
    };
    const original = createProviderOperationRequestIntentHmac(
      identity,
      request,
      hmacKey,
      expectedBusinessObject,
    );

    expect(
      createProviderOperationRequestIntentHmac(
        {
          ...identity,
          actorUserId: 'another-doctor-id',
          clientIdempotencyKey: 'another-request-key-0001',
        },
        request,
        hmacKey,
        expectedBusinessObject,
      ),
    ).toBe(original);
    expect(
      createProviderOperationRequestIntentHmac(
        { ...identity, patientId: 'patient-002' },
        request,
        hmacKey,
        expectedBusinessObject,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationRequestIntentHmac(
        identity,
        { prompt: 'different screened input' },
        hmacKey,
        expectedBusinessObject,
      ),
    ).not.toBe(original);
    expect(
      createProviderOperationRequestIntentHmac(identity, request, hmacKey, {
        ...expectedBusinessObject,
        id: 'assessment-002',
      }),
    ).not.toBe(original);
  });

  it('rejects ambiguous identity, HMAC key, and non-canonical JSON values', () => {
    const sparseArray: unknown[] = [];
    sparseArray.length = 3;
    sparseArray[0] = 1;
    sparseArray[2] = 3;

    expect(() =>
      createProviderOperationIdentityHash({
        ...identity,
        clientIdempotencyKey: ' trailing-space ',
      }),
    ).toThrow(/clientIdempotencyKey/);
    expect(() =>
      createProviderOperationRequestHmac(
        identity,
        { prompt: undefined },
        hmacKey,
      ),
    ).toThrow(/valid JSON/);
    expect(() =>
      createProviderOperationRequestHmac(
        identity,
        { value: Number.NaN },
        hmacKey,
      ),
    ).toThrow(/valid JSON/);
    expect(() =>
      createProviderOperationRequestHmac(identity, sparseArray, hmacKey),
    ).toThrow(/valid JSON array/);
    expect(() =>
      createProviderOperationRequestHmac(
        identity,
        { prompt: 'value' },
        Buffer.alloc(31),
      ),
    ).toThrow(/exactly 32 bytes/);
    expect(() =>
      createProviderOperationResponseHmac(
        'not-a-uuid',
        { summary: 'value' },
        hmacKey,
      ),
    ).toThrow(/canonical UUID/);
  });

  it('allows only the approved one-way state diagram', () => {
    const allowed: Array<[ProviderOperationStatus, ProviderOperationStatus]> = [
      ['accepted', 'reserved'],
      ['reserved', 'dispatching'],
      ['dispatching', 'completed'],
      ['dispatching', 'provider_failed'],
      ['dispatching', 'response_rejected'],
      ['dispatching', 'outcome_unknown'],
      ['outcome_unknown', 'completed_confirmed'],
      ['outcome_unknown', 'closed_unconfirmed'],
    ];

    for (const from of providerOperationStatuses) {
      for (const to of providerOperationStatuses) {
        expect(canTransitionProviderOperationStatus(from, to)).toBe(
          allowed.some(
            ([allowedFrom, allowedTo]) =>
              allowedFrom === from && allowedTo === to,
          ),
        );
      }
    }
  });

  it('rejects no-op, retry, and terminal transitions', () => {
    expect(() =>
      assertProviderOperationStatusTransition('dispatching', 'dispatching'),
    ).toThrow(/cannot transition/);
    expect(() =>
      assertProviderOperationStatusTransition('outcome_unknown', 'dispatching'),
    ).toThrow(/cannot transition/);
    expect(() =>
      assertProviderOperationStatusTransition('completed', 'dispatching'),
    ).toThrow(/cannot transition/);
    expect(
      canTransitionProviderOperationStatus(
        'unknown' as ProviderOperationStatus,
        'accepted',
      ),
    ).toBe(false);
    expect(() =>
      assertProviderOperationStatusTransition(
        'unknown' as ProviderOperationStatus,
        'accepted',
      ),
    ).toThrow(/must be recognized/);
  });
});
