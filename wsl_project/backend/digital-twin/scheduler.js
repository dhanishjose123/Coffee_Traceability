'use strict';

const fs = require('fs');
const path = require('path');
const { buildFeatures } = require('./features');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class DigitalTwinScheduler {
  constructor({ getMetrics, onDecision, enabled = true, config = loadConfig() }) {
    this.getMetrics = getMetrics;
    this.onDecision = onDecision || (() => {});
    this.enabled = enabled;
    this.config = config;
    this.hotAssets = new Map();
  }

  rememberAsset(assetId) {
    if (!assetId) return;
    this.hotAssets.set(assetId, Date.now());
  }

  isHotAsset(assetId) {
    if (!assetId) return false;
    const touchedAt = this.hotAssets.get(assetId);
    if (!touchedAt) return false;
    return Date.now() - touchedAt < this.config.hotAssetWindowMs;
  }

  async predict(features) {
    if (!this.enabled) {
      return { status: 'disabled', predictedFailureRate: 0, predictedThroughput: features.load };
    }

    if (typeof fetch !== 'function') {
      return { status: 'fetch_unavailable', predictedFailureRate: 0, predictedThroughput: features.load };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.predictorTimeoutMs);

    try {
      const response = await fetch(this.config.predictorUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(features),
        signal: controller.signal
      });

      if (!response.ok) {
        return { status: `predictor_http_${response.status}`, predictedFailureRate: 0, predictedThroughput: features.load };
      }

      const data = await response.json();
      return {
        status: data.status || 'success',
        predictedFailureRate: clamp(Number(data.predictedFailureRate ?? data.failureRate ?? data.risk_score ?? 0), 0, 1),
        predictedThroughput: Math.max(0, Number(data.predictedThroughput ?? data.throughput ?? features.load)),
        raw: data
      };
    } catch (error) {
      return {
        status: `predictor_unavailable:${error.name || error.message}`,
        predictedFailureRate: 0,
        predictedThroughput: features.load
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  decide(tx, prediction) {
    let delayMs = 0;
    const reasons = [];

    if (prediction.predictedFailureRate >= this.config.criticalFailureRateThreshold) {
      delayMs = Math.max(delayMs, this.config.highRiskDelayMs);
      reasons.push('critical predicted failure risk');
    } else if (prediction.predictedFailureRate >= this.config.failureRateThreshold) {
      delayMs = Math.max(delayMs, this.config.baseDelayMs);
      reasons.push('elevated predicted failure risk');
    }

    if (prediction.predictedThroughput < this.config.minPredictedThroughput) {
      delayMs = Math.max(delayMs, this.config.baseDelayMs);
      reasons.push('low predicted throughput');
    }

    if (this.isHotAsset(tx.assetId)) {
      delayMs = Math.max(delayMs, this.config.hotAssetDelayMs);
      reasons.push('hot asset conflict window');
    }

    return {
      action: delayMs > 0 ? 'delay' : 'submit',
      delayMs,
      reasons
    };
  }

  async schedule(tx, submitFn) {
    if (!this.enabled) {
      return submitFn();
    }

    const metrics = this.getMetrics();
    const features = buildFeatures(tx, metrics, this.config);
    const prediction = await this.predict(features);
    const decision = this.decide(tx, prediction);

    this.onDecision({ tx, features, prediction, decision, at: new Date().toISOString() });

    if (decision.delayMs > 0) {
      await sleep(decision.delayMs);
    }

    const ok = await submitFn();
    const success = typeof ok === 'object' ? Boolean(ok.ok) : Boolean(ok);
    if (success) {
      this.rememberAsset(tx.assetId);
    }
    return ok;
  }
}

function createScheduler(options) {
  return new DigitalTwinScheduler(options);
}

module.exports = {
  DigitalTwinScheduler,
  createScheduler
};
