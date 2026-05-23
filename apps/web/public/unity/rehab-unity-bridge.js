(function attachRehabUnityBridge(global) {
  "use strict";

  var protocolVersion = "1.0.0";
  var eventType = "training_result";

  function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(label + " must be an object.");
    }
    return value;
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(label + " must be a non-empty string.");
    }
    return value.trim();
  }

  function requireNumber(value, label, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(label + " must be a finite number.");
    }
    if (value < min || value > max) {
      throw new Error(label + " must be between " + min + " and " + max + ".");
    }
    return value;
  }

  function requirePositiveNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(label + " must be greater than 0.");
    }
    return value;
  }

  function requireIsoDate(value, label) {
    var text = requireString(value, label);
    if (Number.isNaN(new Date(text).getTime())) {
      throw new Error(label + " must be a valid ISO date string.");
    }
    return text;
  }

  function requireIntensity(value) {
    if (value !== "low" && value !== "moderate" && value !== "high") {
      throw new Error("exerciseIntensity must be low, moderate, or high.");
    }
    return value;
  }

  function normalizeMetric(metric, index) {
    requireObject(metric, "motionMetrics[" + index + "]");
    var normalized = {
      metricType: requireString(
        metric.metricType,
        "motionMetrics[" + index + "].metricType",
      ),
      metricValue: requireNumber(
        metric.metricValue,
        "motionMetrics[" + index + "].metricValue",
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
      confidence: requireNumber(
        metric.confidence,
        "motionMetrics[" + index + "].confidence",
        0,
        1,
      ),
    };

    if (metric.rawSummary !== undefined) {
      normalized.rawSummary = requireObject(
        metric.rawSummary,
        "motionMetrics[" + index + "].rawSummary",
      );
    }
    if (metric.unit !== undefined) {
      normalized.unit = requireString(
        metric.unit,
        "motionMetrics[" + index + "].unit",
      );
    }
    if (metric.sampleCount !== undefined) {
      normalized.sampleCount = requireNumber(
        metric.sampleCount,
        "motionMetrics[" + index + "].sampleCount",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      if (Math.floor(normalized.sampleCount) !== normalized.sampleCount) {
        throw new Error("motionMetrics[" + index + "].sampleCount must be an integer.");
      }
    }
    if (metric.windowStartedAt !== undefined) {
      normalized.windowStartedAt = requireIsoDate(
        metric.windowStartedAt,
        "motionMetrics[" + index + "].windowStartedAt",
      );
    }
    if (metric.windowEndedAt !== undefined) {
      normalized.windowEndedAt = requireIsoDate(
        metric.windowEndedAt,
        "motionMetrics[" + index + "].windowEndedAt",
      );
    }
    if (
      normalized.windowStartedAt &&
      normalized.windowEndedAt &&
      new Date(normalized.windowStartedAt).getTime() >
        new Date(normalized.windowEndedAt).getTime()
    ) {
      throw new Error("motion metric windowStartedAt must not be later than windowEndedAt.");
    }
    if (metric.qualityFlag !== undefined) {
      normalized.qualityFlag = requireString(
        metric.qualityFlag,
        "motionMetrics[" + index + "].qualityFlag",
      );
    }
    if (metric.bodyPart !== undefined) {
      normalized.bodyPart = requireString(
        metric.bodyPart,
        "motionMetrics[" + index + "].bodyPart",
      );
    }
    if (metric.jointName !== undefined) {
      normalized.jointName = requireString(
        metric.jointName,
        "motionMetrics[" + index + "].jointName",
      );
    }

    return normalized;
  }

  function buildTrainingResultEvent(result) {
    requireObject(result, "result");

    var sessionId = requireString(result.sessionId, "sessionId");
    var gameRunId = requireString(result.gameRunId, "gameRunId");
    var gameVersion = requireString(result.gameVersion, "gameVersion");
    var clientGeneratedAt = requireIsoDate(
      result.clientGeneratedAt,
      "clientGeneratedAt",
    );
    var rawPayloadHash = requireString(result.rawPayloadHash, "rawPayloadHash");
    var metricsSummary = requireObject(result.metricsSummary, "metricsSummary");
    metricsSummary.source = "unity_webgl";
    metricsSummary.gameRunId = gameRunId;
    metricsSummary.gameVersion = gameVersion;
    metricsSummary.protocolVersion = protocolVersion;
    metricsSummary.clientGeneratedAt = clientGeneratedAt;
    metricsSummary.rawPayloadHash = rawPayloadHash;
    var motionMetrics = result.motionMetrics;
    if (!Array.isArray(motionMetrics) || motionMetrics.length === 0) {
      throw new Error("motionMetrics must be a non-empty array.");
    }

    return {
      type: eventType,
      action: eventType,
      protocolVersion: protocolVersion,
      sessionId: sessionId,
      gameRunId: gameRunId,
      gameVersion: gameVersion,
      clientGeneratedAt: clientGeneratedAt,
      rawPayloadHash: rawPayloadHash,
      score: requireNumber(result.score, "score", 0, 100),
      completionRate: requireNumber(result.completionRate, "completionRate", 0, 1),
      durationSeconds: requirePositiveNumber(
        result.durationSeconds,
        "durationSeconds",
      ),
      reactionTimeMs: requirePositiveNumber(
        result.reactionTimeMs,
        "reactionTimeMs",
      ),
      motionAccuracy: requireNumber(result.motionAccuracy, "motionAccuracy", 0, 1),
      exerciseIntensity: requireIntensity(result.exerciseIntensity),
      metricsSummary: metricsSummary,
      motionMetrics: motionMetrics.map(normalizeMetric),
    };
  }

  function postTrainingResult(result, targetWindow) {
    var message = buildTrainingResultEvent(result);
    var destination = targetWindow || global.parent || global;
    destination.postMessage(message, global.location.origin);
    return message;
  }

  function postTrainingResultJson(json, targetWindow) {
    if (typeof json !== "string") {
      throw new Error("json must be a string.");
    }
    return postTrainingResult(JSON.parse(json), targetWindow);
  }

  function getRuntimeConfig() {
    var config = global.RehabTrainingRuntimeConfig;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("RehabTrainingRuntimeConfig is not available.");
    }
    return config;
  }

  global.RehabUnityBridge = {
    protocolVersion: protocolVersion,
    eventType: eventType,
    buildTrainingResultEvent: buildTrainingResultEvent,
    postTrainingResult: postTrainingResult,
    postTrainingResultJson: postTrainingResultJson,
    getRuntimeConfig: getRuntimeConfig,
  };
})(window);
