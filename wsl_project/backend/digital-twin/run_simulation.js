'use strict';

const { DefaultEventHandlerStrategies, Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { performance } = require('perf_hooks');
const { createScheduler } = require('./scheduler');

const CHANNEL_NAME = process.env.CHANNEL_NAME || 'agrochannel1707';
const CHAINCODE_NAME = process.env.CHAINCODE_NAME || process.env.CC_NAME || 'coffee_9';
const NUM_USERS = Number(process.env.NUM_USERS || process.env.SIM_USER_COUNT || 5);
const DURATION_SEC = Number(process.env.DURATION_SEC || 20);
const TARGET_TX_COUNT = Number(process.env.TARGET_TX_COUNT || process.env.NUM_TRANSACTIONS || 0);
const NO_WORK_TIMEOUT_SEC = Number(process.env.NO_WORK_TIMEOUT_SEC || 30);

const SUBMIT_TPS = Number(process.env.SUBMIT_TPS || 10);
const TEST_TPS = Number(process.env.TEST_TPS || 0);
const MAKE_OFFER_TPS = Number(process.env.MAKE_OFFER_TPS || 0);
const ACCEPT_TPS = Number(process.env.ACCEPT_TPS || 0);
const PURCHASE_TPS = Number(process.env.PURCHASE_TPS || 0);
const MAX_DRAIN_SEC = Number(process.env.MAX_DRAIN_SEC || 0);
const LEDGER_SETTLE_MS = Number(process.env.LEDGER_SETTLE_MS || 3000);
const FINAL_WALLET_WAIT_MS = Number(process.env.FINAL_WALLET_WAIT_MS || 5000);
const PACK_TPS = Number(process.env.PACK_TPS || 0);
const SCHEDULER_TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 100);
const TX_TIMEOUT_MS = Number(process.env.TX_TIMEOUT_MS || 8000);
const MAX_IN_FLIGHT = Number(process.env.MAX_IN_FLIGHT || 100);
const CAPACITY_WAIT_MS = Number(process.env.CAPACITY_WAIT_MS || 2000);
const PAIRWISE_DETECTION = /^(1|true|yes)$/i.test(process.env.PAIRWISE_DETECTION || '');
const FORCE_SHARED_CONFLICT_KEYS = /^(1|true|yes)$/i.test(process.env.FORCE_SHARED_CONFLICT_KEYS || '');
const DETECTION_SHARED_KEY = String(process.env.DETECTION_SHARED_KEY || process.env.FORCE_SHARED_KEY || 'participant').toLowerCase();
const COMMIT_TIMEOUT_SEC = Number(process.env.COMMIT_TIMEOUT_SEC || 30);
const COMMIT_VERIFY_TIMEOUT_MS = Number(process.env.COMMIT_VERIFY_TIMEOUT_MS || 20000);
const COMMIT_VERIFY_INTERVAL_MS = Number(process.env.COMMIT_VERIFY_INTERVAL_MS || 1000);
const FAILURE_STREAK_THRESHOLD = Number(process.env.FAILURE_STREAK_THRESHOLD || 2);
const MAKE_OFFER_PRICE_GAP = Number(process.env.MAKE_OFFER_PRICE_GAP || 100);
const MAKE_OFFER_SAME_LOT = /^(1|true|yes)$/i.test(process.env.MAKE_OFFER_SAME_LOT || '');
const STRICT_MVCC_LEARNING = /^(1|true|yes)$/i.test(process.env.STRICT_MVCC_LEARNING || '');
const ENABLE_LEARNED_MVCC_QUEUE = !/^(0|false|no)$/i.test(process.env.ENABLE_LEARNED_MVCC_QUEUE || 'true');
const COMMIT_STRATEGY = process.env.COMMIT_STRATEGY || 'NETWORK_SCOPE_ANYFORTX';
const WAIT_FOR_COMMIT = /^(1|true|yes)$/i.test(process.env.WAIT_FOR_COMMIT || '');
const VERIFY_COMMIT_BY_QUERY = !/^(0|false|no)$/i.test(process.env.VERIFY_COMMIT_BY_QUERY || 'true');
const ENABLE_SCHEDULER = /^(1|true|yes)$/i.test(process.env.ENABLE_SCHEDULER || '');
const ENABLE_RL_SCHEDULER = /^(1|true|yes)$/i.test(process.env.ENABLE_RL_SCHEDULER || '');
const ENABLE_WALLET_QUEUE = !/^(0|false|no)$/i.test(process.env.ENABLE_WALLET_QUEUE || 'true');
const USE_EXISTING_ASSETS = /^(1|true|yes)$/i.test(process.env.USE_EXISTING_ASSETS || '');
const EXISTING_PACKET_STATUSES = String(process.env.EXISTING_PACKET_STATUSES || 'AVAILABLE')
  .split(',')
  .map((status) => status.trim().toUpperCase())
  .filter(Boolean);
const EXISTING_PACKET_QUERY_LIMIT = String(Number(process.env.EXISTING_PACKET_QUERY_LIMIT || 1000));
const EXISTING_LOT_QUERY_LIMIT = String(Number(process.env.EXISTING_LOT_QUERY_LIMIT || 200));
const FIXED_PURCHASE_CONSUMER = process.env.FIXED_PURCHASE_CONSUMER || process.env.PURCHASE_CONSUMER_ID || '';
const LOAD_LEARNED_CONFLICT_KEYS = /^(1|true|yes)$/i.test(process.env.LOAD_LEARNED_CONFLICT_KEYS || '');
const ENABLE_CONFLICT_KEY_LEARNING = /^(1|true|yes)$/i.test(process.env.ENABLE_CONFLICT_KEY_LEARNING || '');
const ENABLE_BACKPRESSURE_SKIP = !/^(0|false|no)$/i.test(process.env.ENABLE_BACKPRESSURE_SKIP || 'true');
const FUNCTION_LEVEL_QUEUE_FUNCTIONS = new Set(
  (process.env.FUNCTION_LEVEL_QUEUE_FUNCTIONS || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
);
const SDK_LOG_FILE = process.env.SDK_LOG_FILE || path.join(__dirname, 'logs', 'fabric-sdk-errors.log');
const RUN_HISTORY_FILE = process.env.RUN_HISTORY_FILE || path.join(__dirname, 'logs', 'simulation-runs.jsonl');
const TRAINING_DATA_FILE = process.env.TRAINING_DATA_FILE || path.join(__dirname, 'logs', 'training-data.csv');
const CONFLICT_KEYS_FILE = process.env.CONFLICT_KEYS_FILE || path.join(__dirname, 'logs', 'conflict-keys.json');
const SHOW_SDK_LOGS = /^(1|true|yes)$/i.test(process.env.SHOW_SDK_LOGS || '');
const UPDATE_TABLES_AFTER_RUN = /^(1|true|yes)$/i.test(process.env.UPDATE_TABLES_AFTER_RUN || '');
const TARGET_TPS = SUBMIT_TPS + TEST_TPS + MAKE_OFFER_TPS + ACCEPT_TPS + PACK_TPS + PURCHASE_TPS;

const backendRoot = path.resolve(__dirname, '..');
const walletRoot = path.join(backendRoot, 'wallet');
const connectionRoot = path.join(backendRoot, 'connections');

function redirectSdkLogs() {
  if (SHOW_SDK_LOGS) return;

  fs.mkdirSync(path.dirname(SDK_LOG_FILE), { recursive: true });
  const sdkLogStream = fs.createWriteStream(SDK_LOG_FILE, { flags: 'a' });
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const sdkLogPatterns = [
    '[DiscoveryHandler]',
    '[Endorser]',
    '[Transaction]',
    '[TransactionEventHandler]',
    '[ServiceEndpoint]',
    '[CommitHandler]'
  ];

  process.stderr.write = (chunk, encoding, callback) => {
    const message = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (sdkLogPatterns.some((pattern) => message.includes(pattern))) {
      sdkLogStream.write(message);
      if (typeof callback === 'function') callback();
      return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
  };
}

redirectSdkLogs();

const metrics = {
  startedAt: Date.now(),
  loadEndedAt: null,
  lastProgressAt: Date.now(),
  stopReason: '',
  phase: 'running',
  inFlight: 0,
  reservedTx: 0,
  startedTx: 0,
  skippedTx: 0,
  queuedTx: 0,
  totalTx: 0,
  successTx: 0,
  failureTx: 0,
  latencyMs: [],
  lastError: '',
  scheduler: {
    lastAction: 'none',
    lastPrediction: null,
    delayedTx: 0
  },
  rl: {
    actions: {},
    status: {},
    lastAction: 'none',
    lastStatus: 'none',
    activeConflictDecisions: 0,
    learnedConflictDecisions: 0
  },
  failureStreaks: {},
  repeatedFailureAlerts: {},
  onlineLearning: {
    lastByFunction: {},
    learnedConflictKeys: {},
    observations: [],
    recentIdentifiedKeys: []
  },
  perTxType: {
    submitProduce: { success: 0, failure: 0 },
    testCoffee: { success: 0, failure: 0 },
    makeOffer: { success: 0, failure: 0 },
    acceptOffer: { success: 0, failure: 0 },
    packLotIntoPackets: { success: 0, failure: 0 },
    purchasePacket: { success: 0, failure: 0 }
  },
  perStakeholder: {}
};

function availableUsers(org) {
  const dir = path.join(walletRoot, org);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => /^User\d+\.id$/.test(file))
    .map((file) => file.replace(/\.id$/, ''))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
    .slice(0, NUM_USERS);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function scopedConflictKey(functionName, key) {
  return `${functionName}:${key}`;
}

function isTransientConflictKey(key = '') {
  return key.startsWith('lot-') || key.startsWith('packet-');
}

function generalizeConflictKey(key = '') {
  if (key.startsWith('lot-')) return 'lot';
  if (key.startsWith('packet-')) return 'packet';
  const participant = key.match(/^participant:([^/]+)\/User\d+$/i);
  if (participant) return `participant:${participant[1]}`;
  return key;
}

function persistentConflictKeys(conflictKeys = []) {
  return conflictKeys
    .filter((key) => !isTransientConflictKey(key))
    .map(generalizeConflictKey);
}

function isPersistableConflictKey(functionName, key = '') {
  return true;
}

function transientScopedQueueKeys(functionName, conflictKeys = []) {
  return scopedQueueKeys(functionName, conflictKeys.filter(isTransientConflictKey));
}

function learnConflictKey(functionName, key, evidence) {
  const learnedKey = generalizeConflictKey(key);
  if (!isPersistableConflictKey(functionName, learnedKey)) return;
  const scopedKey = scopedConflictKey(functionName, learnedKey);
  metrics.onlineLearning.learnedConflictKeys[scopedKey] ||= {
    key: scopedKey,
    functionName,
    conflictKey: learnedKey,
    learnedAt: new Date().toISOString(),
    failures: 0,
    evidence: []
  };
  const learned = metrics.onlineLearning.learnedConflictKeys[scopedKey];
  learned.failures++;
  learned.lastSeenAt = new Date().toISOString();
  learned.evidence.push(evidence);
  if (learned.evidence.length > 5) learned.evidence.shift();
}

function isMvccConflictError(error) {
  const message = String(error?.message || error || '');
  return /MVCC|READ_CONFLICT|read conflict|version conflict/i.test(message);
}

function rememberIdentifiedConflictKeys(functionName, details, conflictKeys) {
  if (!ENABLE_CONFLICT_KEY_LEARNING) return;
  metrics.onlineLearning.recentIdentifiedKeys.push({
    functionName,
    details,
    conflictKeys,
    identifiedAt: new Date().toISOString()
  });
  if (metrics.onlineLearning.recentIdentifiedKeys.length > 12) {
    metrics.onlineLearning.recentIdentifiedKeys.shift();
  }
}

function participantKey(org, userId) {
  return `participant:${org}/${userId}`;
}

function maybeParticipantKey(org, userId) {
  const normalized = normalizeUserId(userId);
  return normalized ? participantKey(org, normalized) : '';
}

function compactConflictKeys(keys = []) {
  return [...new Set(keys.filter(Boolean))];
}

function matchesDetectionSharedKey(role, key = '') {
  const normalized = role.toLowerCase();
  if (['lot', 'asset'].includes(normalized)) return key.startsWith('lot-');
  if (normalized === 'packet') return key.startsWith('packet-');
  if (normalized === 'farmer') return key.startsWith('participant:farmers/');
  if (normalized === 'aggregator') return key.startsWith('participant:aggregators/');
  if (normalized === 'retailer') return key.startsWith('participant:retailers/');
  if (normalized === 'consumer') return key.startsWith('participant:consumers/');
  return true;
}

function detectionConflictKeys(functionName, keys) {
  if (!FORCE_SHARED_CONFLICT_KEYS) return keys;
  if (['participant', 'auto', 'all'].includes(DETECTION_SHARED_KEY)) return keys;
  const selected = keys.filter((key) => matchesDetectionSharedKey(DETECTION_SHARED_KEY, key));
  if (selected.length) return selected;
  console.log(`Detection shared key ${DETECTION_SHARED_KEY} did not match ${functionName}; using all keys.`);
  return keys;
}

function submitProduceConflictKeys(farmerId, aggregatorId) {
  return detectionConflictKeys('submitProduce', compactConflictKeys([
    maybeParticipantKey('farmers', farmerId),
    maybeParticipantKey('aggregators', aggregatorId)
  ]));
}

function learnedSubmitProduceQueueKeys(farmerId, aggregatorId) {
  const candidateKeys = submitProduceConflictKeys(farmerId, aggregatorId);
  if (!ENABLE_LEARNED_MVCC_QUEUE) return candidateKeys;
  return candidateKeys.filter((key) => metrics.onlineLearning.learnedConflictKeys[scopedConflictKey('submitProduce', generalizeConflictKey(key))]);
}

function hasLearnedConflictKey(functionName, conflictKeys = []) {
  return conflictKeys
    .map(generalizeConflictKey)
    .filter((key) => isPersistableConflictKey(functionName, key))
    .some((key) => metrics.onlineLearning.learnedConflictKeys[scopedConflictKey(functionName, key)]);
}

function scopedQueueKeys(functionName, conflictKeys = []) {
  return conflictKeys.map((key) => scopedConflictKey(functionName, key));
}

function functionLevelQueueKey(functionName) {
  return `${functionName}:function`;
}

function learnedScopedQueueKeys(functionName, conflictKeys = []) {
  const keys = [];
  for (const key of conflictKeys) {
    const learnedKey = generalizeConflictKey(key);
    if (!isPersistableConflictKey(functionName, learnedKey)) continue;
    if (!metrics.onlineLearning.learnedConflictKeys[scopedConflictKey(functionName, learnedKey)]) continue;
    keys.push(key);
  }
  return [...new Set(keys)];
}

function normalizeLearnedConflictKey(propertyName, item) {
  const knownFunctions = new Set(Object.keys(metrics.perTxType));
  if (item && item.functionName && item.conflictKey) {
    const conflictKey = generalizeConflictKey(item.conflictKey);
    return {
      scopedKey: scopedConflictKey(item.functionName, conflictKey),
      functionName: item.functionName,
      conflictKey
    };
  }

  const key = item?.key || propertyName;
  const firstColon = key.indexOf(':');
  const maybeFunction = firstColon > 0 ? key.slice(0, firstColon) : '';
    if (knownFunctions.has(maybeFunction)) {
      const conflictKey = generalizeConflictKey(key.slice(firstColon + 1));
      return {
        scopedKey: scopedConflictKey(maybeFunction, conflictKey),
        functionName: maybeFunction,
        conflictKey
      };
    }

  const conflictKey = generalizeConflictKey(key);
  return {
    scopedKey: scopedConflictKey('submitProduce', conflictKey),
    functionName: 'submitProduce',
    conflictKey
  };
}

function loadLearnedConflictKeysFromHistory() {
  if (!LOAD_LEARNED_CONFLICT_KEYS) return 0;

  if (fs.existsSync(CONFLICT_KEYS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFLICT_KEYS_FILE, 'utf8'));
      const learned = data.learnedConflictKeys || {};
      let loaded = 0;
      for (const [propertyName, item] of Object.entries(learned)) {
        const normalized = normalizeLearnedConflictKey(propertyName, item);
        if (!isPersistableConflictKey(normalized.functionName, normalized.conflictKey)) continue;
        metrics.onlineLearning.learnedConflictKeys[normalized.scopedKey] = {
          key: normalized.scopedKey,
          functionName: normalized.functionName,
          conflictKey: normalized.conflictKey,
          learnedAt: item.learnedAt || data.generatedAt || new Date().toISOString(),
          lastSeenAt: item.lastSeenAt || data.generatedAt || new Date().toISOString(),
          failures: Number(item.failures || 1),
          evidence: item.evidence || []
        };
        loaded++;
      }
      if (loaded > 0) return loaded;
    } catch (error) {
      console.error(`Could not load conflict keys file ${CONFLICT_KEYS_FILE}: ${error.message}`);
    }
  }

  if (!fs.existsSync(RUN_HISTORY_FILE)) return 0;

  const lines = fs.readFileSync(RUN_HISTORY_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (_) {
      continue;
    }

    const learned = record.observation?.onlineLearning?.learnedConflictKeys;
    if (!learned || !Object.keys(learned).length) continue;

    let loaded = 0;
    for (const [propertyName, item] of Object.entries(learned)) {
      const normalized = normalizeLearnedConflictKey(propertyName, item);
      if (!isPersistableConflictKey(normalized.functionName, normalized.conflictKey)) continue;
      metrics.onlineLearning.learnedConflictKeys[normalized.scopedKey] = {
        key: normalized.scopedKey,
        functionName: normalized.functionName,
        conflictKey: normalized.conflictKey,
        learnedAt: item.learnedAt || record.timestamp || new Date().toISOString(),
        lastSeenAt: item.lastSeenAt || record.timestamp || new Date().toISOString(),
        failures: Number(item.failures || 1),
        evidence: item.evidence || []
      };
      loaded++;
    }
    return loaded;
  }

  return 0;
}

function learnConflictKeysFromResult(stakeholder, type, ok, error, context = {}) {
  if (!ENABLE_CONFLICT_KEY_LEARNING) return;
  const conflictKeys = context.conflictKeys || [];
  if (!conflictKeys.length) return;
  const current = {
    functionName: type,
    stakeholder: `${stakeholder.org}/${stakeholder.userId}`,
    conflictKeys,
    details: context,
    lotId: context.lotId || '',
    ok,
    error: error ? (error.message || String(error)) : '',
    timestamp: new Date().toISOString()
  };

  const previous = metrics.onlineLearning.lastByFunction[type];
  if (!ok && previous && (!STRICT_MVCC_LEARNING || isMvccConflictError(error))) {
    const evidence = {
      previous: {
        stakeholder: previous.stakeholder,
        details: previous.details
      },
      current: {
        stakeholder: current.stakeholder,
        details: current.details
      },
      lastError: current.error,
      detectedAt: current.timestamp
    };
      const previousKeys = new Set(previous.conflictKeys || []);
      const sharedKeys = [...new Set(current.conflictKeys)]
        .filter((key) => previousKeys.has(key));
    sharedKeys.forEach((key) => learnConflictKey(type, key, {
      ...evidence,
      functionName: type,
      reason: `${STRICT_MVCC_LEARNING ? 'MVCC' : 'failure'} ${type} conflict with shared key ${key}`
    }));
  }

  metrics.onlineLearning.observations.push(current);
  if (metrics.onlineLearning.observations.length > 25) {
    metrics.onlineLearning.observations.shift();
  }
  metrics.onlineLearning.lastByFunction[type] = current;
}

function record(stakeholder, type, ok, error, learningContext = {}, latencyMs = null) {
  metrics.totalTx++;
  metrics[ok ? 'successTx' : 'failureTx']++;
  metrics.perTxType[type][ok ? 'success' : 'failure']++;
  if (Number.isFinite(latencyMs)) {
    metrics.latencyMs.push(latencyMs);
    metrics.perTxType[type].latencyMs ||= [];
    metrics.perTxType[type].latencyMs.push(latencyMs);
  }

  const key = `${stakeholder.org}/${stakeholder.userId}`;
  metrics.perStakeholder[key] ||= { success: 0, failure: 0 };
  metrics.perStakeholder[key][ok ? 'success' : 'failure']++;

  const streakKey = `${type}:${key}`;
  if (ok) {
    metrics.failureStreaks[streakKey] = 0;
  } else {
    metrics.failureStreaks[streakKey] = (metrics.failureStreaks[streakKey] || 0) + 1;
    if (type === 'submitProduce' && metrics.failureStreaks[streakKey] >= FAILURE_STREAK_THRESHOLD) {
      metrics.repeatedFailureAlerts[streakKey] = {
        functionName: type,
        stakeholder: key,
        consecutiveFailures: metrics.failureStreaks[streakKey],
        lastError: error ? (error.message || String(error)) : '',
        detectedAt: new Date().toISOString()
      };
    }
  }

  if (error) {
    metrics.lastError = `${type} ${key}: ${error.message || error}`;
  }

  learnConflictKeysFromResult(stakeholder, type, ok, error, learningContext);
}

function printLiveStats() {
  const now = Date.now();
  const loadElapsedMs = Math.max((metrics.loadEndedAt || now) - metrics.startedAt, 100);
  const loadElapsed = loadElapsedMs / 1000;
  const wallElapsed = Math.max((now - metrics.startedAt) / 1000, 0.1);
  const attemptedTps = (metrics.startedTx / loadElapsed).toFixed(2);
  const completedTps = (metrics.totalTx / loadElapsed).toFixed(2);
  const endToEndTps = (metrics.totalTx / wallElapsed).toFixed(2);
  const successRate = metrics.totalTx
    ? ((metrics.successTx / metrics.totalTx) * 100).toFixed(1)
    : '0.0';

  console.clear();
  console.log('=== Live Digital Twin Simulator ===');
  console.log(`Channel: ${CHANNEL_NAME} | Chaincode: ${CHAINCODE_NAME}`);
  console.log(`Phase: ${metrics.phase} | Wall elapsed: ${wallElapsed.toFixed(1)}s | Load window: ${loadElapsed.toFixed(1)}s`);
  console.log(`Target load: ${TARGET_TPS} tx/s | Submitted load: ${attemptedTps} tx/s | Completed load: ${completedTps} tx/s | In flight: ${metrics.inFlight}`);
  console.log(`End-to-end TPS: ${endToEndTps} tx/s`);
  if (metrics.stopReason) console.log(`Stop reason: ${metrics.stopReason}`);
  const completionText = hasTargetTxCount() ? ` | Completed target: ${metrics.totalTx}/${TARGET_TX_COUNT}` : '';
  console.log(`Started: ${metrics.startedTx} | Queued: ${metrics.queuedTx} | Skipped: ${metrics.skippedTx} | Success: ${metrics.successTx} | Failed: ${metrics.failureTx}${completionText} | Success rate: ${successRate}%`);
  console.log('');
  console.log('Per transaction type');
  for (const [type, data] of Object.entries(metrics.perTxType)) {
    console.log(`  ${type.padEnd(20)} ${String(data.success).padStart(5)} ok / ${String(data.failure).padStart(5)} failed`);
  }
  console.log('');
  console.log('Stakeholder status');
  const stakeholders = Object.entries(metrics.perStakeholder)
    .sort((a, b) => (b[1].failure - a[1].failure) || (b[1].success - a[1].success))
    .slice(0, 8);
  for (const [name, stats] of stakeholders) {
    console.log(`  ${name.padEnd(20)} ${String(stats.success).padStart(5)} ok / ${String(stats.failure).padStart(5)} failed`);
  }
  if (metrics.lastError) {
    console.log('');
    console.log(`Last error: ${metrics.lastError}`);
  }
  if (ENABLE_SCHEDULER && metrics.scheduler.lastPrediction) {
    const prediction = metrics.scheduler.lastPrediction;
    console.log('');
    console.log(`Scheduler: ${metrics.scheduler.lastAction} | delayed=${metrics.scheduler.delayedTx}`);
    console.log(`Predicted failure=${(prediction.predictedFailureRate * 100).toFixed(1)}% | predicted throughput=${prediction.predictedThroughput.toFixed(2)} | status=${prediction.status}`);
  }
  if (ENABLE_RL_SCHEDULER && rlScheduler.lastDecision) {
    console.log('');
    console.log(`RL scheduler: action=${rlScheduler.lastDecision.action} | delay=${rlScheduler.lastDecision.delayMs || 0}ms | status=${rlScheduler.lastDecision.status || rlScheduler.lastDecision.mode || 'ok'}`);
    const actionSummary = Object.entries(metrics.rl.actions)
      .sort((a, b) => b[1] - a[1])
      .map(([action, count]) => `${action}=${count}`)
      .join(' | ');
    if (actionSummary) {
      console.log(`RL actions: ${actionSummary}`);
      console.log(`RL learned-key decisions=${metrics.rl.learnedConflictDecisions} | active-key decisions=${metrics.rl.activeConflictDecisions}`);
    }
  }
  if (ENABLE_WALLET_QUEUE) {
    console.log('');
    console.log('State keys in use');
    const activeKeys = Array.from(activeWalletKeys).sort();
    if (!activeKeys.length) {
      console.log('  none');
    } else {
      activeKeys.slice(0, 12).forEach((key) => console.log(`  ${key}`));
      if (activeKeys.length > 12) {
        console.log(`  ... ${activeKeys.length - 12} more`);
      }
    }
    const activeTxs = Array.from(activeTransactions.values());
    if (activeTxs.length) {
      console.log('');
      console.log('Active transactions');
      activeTxs.slice(0, 6).forEach((tx) => {
        const ageSec = ((Date.now() - tx.startedAt) / 1000).toFixed(1);
        console.log(`  ${tx.label} | active ${ageSec}s`);
        tx.keys.forEach((key) => console.log(`    - ${key}`));
      });
      if (activeTxs.length > 6) {
        console.log(`  ... ${activeTxs.length - 6} more active transactions`);
      }
    }
  }
  const identifiedKeys = metrics.onlineLearning.recentIdentifiedKeys.slice(-6).reverse();
  if (identifiedKeys.length) {
    console.log('');
    console.log('Recently identified conflict keys');
    identifiedKeys.forEach((item) => {
      const detailText = Object.entries(item.details || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      console.log(`  ${item.functionName}${detailText ? ` (${detailText})` : ''}`);
      item.conflictKeys.forEach((key) => console.log(`    - ${item.functionName}:${key}`));
    });
  }
  const repeatedFailures = Object.values(metrics.repeatedFailureAlerts)
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)
    .slice(0, 8);
  if (repeatedFailures.length) {
    console.log('');
    console.log(`Repeated submitProduce failures (threshold=${FAILURE_STREAK_THRESHOLD})`);
    repeatedFailures.forEach((alert) => {
      console.log(`  ${alert.stakeholder.padEnd(20)} ${alert.consecutiveFailures} consecutive failures`);
    });
  }
  const learnedKeys = Object.values(metrics.onlineLearning.learnedConflictKeys)
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 8);
  if (learnedKeys.length) {
    console.log('');
    console.log('Learned MVCC-prone conflict keys');
    learnedKeys.forEach((item) => {
      const latest = item.evidence[item.evidence.length - 1];
      const label = `${item.functionName}:${item.conflictKey}`;
      console.log(`  ${label.padEnd(42)} failures=${item.failures} | ${latest.reason}`);
    });
  }
  console.log('');
  console.log('Press Ctrl+C to stop.');
}

function randomId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

function randomFrom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function takeRandom(items) {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items.splice(index, 1)[0];
}

const sharedPickCounters = new Map();

function pickSharedBy(items, label, keyFn, idFn = (item) => item?.lotId || item?.packetId || '') {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeUserId(keyFn(item));
    if (!key) continue;
    groups.set(key, groups.get(key) || []);
    const group = groups.get(key);
    if (!group.some((candidate) => idFn(candidate) === idFn(item))) group.push(item);
  }

  const group = Array.from(groups.values()).find((candidates) => candidates.length >= 2);
  if (!group) return null;
  const next = sharedPickCounters.get(label) || 0;
  sharedPickCounters.set(label, next + 1);
  return group[next % group.length];
}

function pickForcedLot(items, functionName, role) {
  if (!FORCE_SHARED_CONFLICT_KEYS) return takeRandom(items);
  if (!items.length) return null;
  if (['lot', 'asset', 'same'].includes(role)) return items[0];

  const rolePickers = {
    farmer: () => pickSharedBy(items, `${functionName}:farmer`, (lot) => lot.farmerId),
    aggregator: () => pickSharedBy(items, `${functionName}:aggregator`, (lot) => lot.aggregatorId),
    retailer: () => pickSharedBy(items, `${functionName}:retailer`, (lot) => lot.retailerId)
  };

  if (rolePickers[role]) return rolePickers[role]() || items[0];
  return rolePickers.farmer?.() || rolePickers.aggregator?.() || rolePickers.retailer?.() || items[0];
}

let fixedMakeOfferLotId = '';

function pickMakeOfferLot(items) {
  if (!items.length) return null;
  if (FORCE_SHARED_CONFLICT_KEYS) return pickForcedLot(items, 'makeOffer', DETECTION_SHARED_KEY);
  if (!MAKE_OFFER_SAME_LOT) return randomFrom(items);

  const existing = fixedMakeOfferLotId
    ? items.find((lot) => lot.lotId === fixedMakeOfferLotId)
    : null;
  if (existing) return existing;

  fixedMakeOfferLotId = items[0].lotId;
  return items[0];
}

function pickForcedPacket(items, role) {
  if (!FORCE_SHARED_CONFLICT_KEYS) return takeRandom(items);
  if (!items.length) return null;
  if (['packet', 'asset', 'same'].includes(role)) return items[0];
  if (role === 'retailer') return pickSharedBy(items, 'purchasePacket:retailer', (packet) => packet.retailerId, (packet) => packet.packetId) || items[0];
  return items[0];
}

function pickPurchaseConsumer(consumers, role) {
  if (FIXED_PURCHASE_CONSUMER) return findByNormalizedUserId(consumers, FIXED_PURCHASE_CONSUMER);
  if (!FORCE_SHARED_CONFLICT_KEYS) return randomFrom(consumers);
  if (role === 'consumer') return consumers[0];
  return randomFrom(consumers);
}

function findByUserId(items, userId) {
  return items.find((item) => item.userId === userId) || null;
}

function findByNormalizedUserId(items, userId) {
  return findByUserId(items, normalizeUserId(userId));
}

function normalizeUserId(value) {
  const text = String(value || '');
  const match = text.match(/User\d+/i);
  return match ? match[0].replace(/^user/i, 'User') : text;
}

function normalizeLot(item) {
  const highestOffer = latestOffer(item);
  return {
    ...item,
    lotId: item.lotId || item.id || item.key || '',
    farmerId: normalizeUserId(item.farmerId || item.owner || item.producerId || ''),
    aggregatorId: normalizeUserId(item.aggregatorId || item.testerId || ''),
    retailerId: normalizeUserId(item.retailerId || item.acceptedOffer?.retailerId || highestOffer?.retailerId || item.owner || ''),
    highestOffer,
    weightKg: Number(item.weightKg || item.weight || 10),
    status: String(item.status || '').toUpperCase()
  };
}

function normalizePacket(item) {
  return {
    ...item,
    packetId: item.packetId || item.id || item.key || '',
    retailerId: normalizeUserId(item.retailerId || item.ownerRetailerId || item.trace?.retailerId || item.trace?.packedBy || item.owner || ''),
    consumerId: normalizeUserId(item.consumerId || item.customerId || item.buyerId || item.trace?.purchasedBy || ''),
    status: String(item.status || '').toUpperCase()
  };
}

function lotKey(lotId) {
  return `lot-${lotId}`;
}

function packetKey(packetId) {
  return `packet-${packetId}`;
}

function latestOffer(lot = {}) {
  if (lot.highestOffer) return lot.highestOffer;
  const offers = Array.isArray(lot.offers) ? lot.offers : [];
  if (!offers.length) return null;
  return offers.reduce((best, offer) => {
    const bestPrice = Number(best?.price || best?.offerPrice || best?.amount || 0);
    const offerPrice = Number(offer?.price || offer?.offerPrice || offer?.amount || 0);
    return offerPrice >= bestPrice ? offer : best;
  }, offers[0]);
}

function hasVisibleOffer(lot) {
  return Boolean(latestOffer(lot));
}

function offerPrice(lot) {
  const offer = latestOffer(lot);
  return Number(offer?.price || offer?.offerPrice || offer?.amount || 50);
}

function uniqueById(items, idField) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item[idField];
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function asArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of ['results', 'items', 'data', 'records', 'lots', 'packets']) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.lotId || payload.packetId || payload.id || payload.key) return [payload];
  return [];
}

function parseArrayResult(result) {
  const parsed = JSON.parse(result || '[]');
  return asArrayPayload(parsed);
}

function countByStatus(items) {
  const counts = {};
  for (const item of items) {
    const status = String(item.status || 'NO_STATUS').toUpperCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function removeByLot(items, lotId) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].lotId === lotId) items.splice(i, 1);
  }
}

function removeByPacket(items, packetId) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].packetId === packetId) items.splice(i, 1);
  }
}

function packetIdsForLot(lotId, weightKg = 10) {
  const totalWeight = Number(weightKg) * 1000;
  const breakdown = {
    '1000g': Math.floor((totalWeight * 0.10) / 1000),
    '500g': Math.floor((totalWeight * 0.20) / 500),
    '250g': Math.floor((totalWeight * 0.30) / 250),
    '100g': Math.floor((totalWeight * 0.40) / 100)
  };
  const count = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return Array.from({ length: count }, (_, index) => `${lotId}-PKT-${index + 1}`);
}

function poolUserIds(pool) {
  return pool.map((stakeholder) => stakeholder.userId).join(', ');
}

function addAfterSettle(items, value) {
  setTimeout(() => items.push(value), LEDGER_SETTLE_MS);
}

function applySdkTimeouts(ccp) {
  ccp.client ||= {};
  ccp.client.connection ||= {};
  ccp.client.connection.timeout ||= {};
  ccp.client.connection.timeout.peer ||= {};
  ccp.client.connection.timeout.peer.endorser = String(TX_TIMEOUT_MS);

  for (const peer of Object.values(ccp.peers || {})) {
    peer.grpcOptions ||= {};
    peer.grpcOptions['request-timeout'] = TX_TIMEOUT_MS;
  }
  return ccp;
}

function commitStrategy() {
  const strategies = {
    NETWORK_SCOPE_ANYFORTX: DefaultEventHandlerStrategies.NETWORK_SCOPE_ANYFORTX,
    NETWORK_SCOPE_ALLFORTX: DefaultEventHandlerStrategies.NETWORK_SCOPE_ALLFORTX,
    MSPID_SCOPE_ANYFORTX: DefaultEventHandlerStrategies.MSPID_SCOPE_ANYFORTX,
    MSPID_SCOPE_ALLFORTX: DefaultEventHandlerStrategies.MSPID_SCOPE_ALLFORTX,
    PREFER_MSPID_SCOPE_ANYFORTX: DefaultEventHandlerStrategies.PREFER_MSPID_SCOPE_ANYFORTX,
    PREFER_MSPID_SCOPE_ALLFORTX: DefaultEventHandlerStrategies.PREFER_MSPID_SCOPE_ALLFORTX
  };
  return strategies[COMMIT_STRATEGY] || DefaultEventHandlerStrategies.NETWORK_SCOPE_ANYFORTX;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTargetTxCount() {
  return Number.isFinite(TARGET_TX_COUNT) && TARGET_TX_COUNT > 0;
}

function txTargetReached() {
  return hasTargetTxCount() && metrics.startedTx + metrics.reservedTx >= TARGET_TX_COUNT;
}

function reserveTxStart() {
  if (!hasTargetTxCount()) return true;
  if (txTargetReached()) return false;
  metrics.reservedTx++;
  return true;
}

function releaseTxStart() {
  if (metrics.reservedTx > 0) metrics.reservedTx--;
}

function noteProgress() {
  metrics.lastProgressAt = Date.now();
}

async function waitForCapacity() {
  if (PAIRWISE_DETECTION) return reservePairwiseSlot();
  if (metrics.inFlight < MAX_IN_FLIGHT) return true;
  const deadline = Date.now() + CAPACITY_WAIT_MS;
  while (metrics.inFlight >= MAX_IN_FLIGHT && Date.now() < deadline) {
    await sleep(50);
  }
  return metrics.inFlight < MAX_IN_FLIGHT;
}

let pairwiseReserved = 0;
let pairwiseBatchClosed = false;

async function reservePairwiseSlot() {
  const deadline = Date.now() + CAPACITY_WAIT_MS;
  while (Date.now() < deadline) {
    if (pairwiseBatchClosed && metrics.inFlight + pairwiseReserved === 0) {
      pairwiseBatchClosed = false;
    }
    if (!pairwiseBatchClosed && metrics.inFlight + pairwiseReserved < 2) {
      pairwiseReserved++;
      if (metrics.inFlight + pairwiseReserved >= 2) pairwiseBatchClosed = true;
      return true;
    }
    await sleep(50);
  }
  return false;
}

function releasePairwiseReservation() {
  if (!PAIRWISE_DETECTION) return;
  pairwiseReserved = Math.max(0, pairwiseReserved - 1);
}

const activeWalletKeys = new Set();
const activeTransactions = new Map();
let activeTransactionSeq = 0;

function activeTransactionLabel(tx) {
  if (!tx) return 'unknown transaction';
  const stakeholder = tx.stakeholder ? `${tx.stakeholder.org}/${tx.stakeholder.userId}` : 'unknown stakeholder';
  return `${tx.functionName || tx.type || 'transaction'} ${stakeholder}${tx.assetId ? ` asset=${tx.assetId}` : ''}`;
}

async function withWalletQueue(walletKeys, task, tx = null) {
  if (!ENABLE_WALLET_QUEUE) {
    return task();
  }

  const keys = [...new Set(walletKeys)].sort();
  let countedQueued = false;
  while (keys.some((key) => activeWalletKeys.has(key))) {
    if (!countedQueued) {
      metrics.queuedTx++;
      countedQueued = true;
    }
    await sleep(100);
  }

  const activeId = ++activeTransactionSeq;
  keys.forEach((key) => activeWalletKeys.add(key));
  activeTransactions.set(activeId, {
    label: activeTransactionLabel(tx),
    keys,
    startedAt: Date.now()
  });
  try {
    return await task();
  } finally {
    activeTransactions.delete(activeId);
    keys.forEach((key) => activeWalletKeys.delete(key));
  }
}

async function withActiveConflictKeys(keys, task, tx = null) {
  if (!keys.length) return task();
  const activeId = ++activeTransactionSeq;
  keys.forEach((key) => activeWalletKeys.add(key));
  activeTransactions.set(activeId, {
    label: activeTransactionLabel(tx),
    keys,
    startedAt: Date.now()
  });
  try {
    return await task();
  } finally {
    activeTransactions.delete(activeId);
    keys.forEach((key) => activeWalletKeys.delete(key));
  }
}

async function waitForLot(contract, lotId, predicate, description) {
  const deadline = Date.now() + COMMIT_VERIFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await contract.evaluateTransaction('getAllProduce');
      const lots = JSON.parse(result.toString() || '[]');
      const lot = lots.find((item) => item && item.lotId === lotId);
      if (lot && predicate(lot)) {
        return true;
      }
    } catch (_) {
      // Peer query may fail briefly while blocks are committing. Retry until timeout.
    }
    await sleep(COMMIT_VERIFY_INTERVAL_MS);
  }
  throw new Error(`Ledger commit not visible for lot ${lotId} (${description}) after ${COMMIT_VERIFY_TIMEOUT_MS}ms`);
}

async function waitForPacket(contract, packetId, predicate, description) {
  const deadline = Date.now() + COMMIT_VERIFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await contract.evaluateTransaction('getAllPackets', 'PURCHASED', EXISTING_PACKET_QUERY_LIMIT);
      const packets = JSON.parse(result.toString() || '[]');
      const packet = packets.find((item) => item && item.packetId === packetId);
      if (packet && predicate(packet)) {
        return true;
      }
    } catch (_) {
      // Peer query may fail briefly while blocks are committing. Retry until timeout.
    }
    await sleep(COMMIT_VERIFY_INTERVAL_MS);
  }
  throw new Error(`Ledger commit not visible for packet ${packetId} (${description}) after ${COMMIT_VERIFY_TIMEOUT_MS}ms`);
}

async function verifyCommitted(contract, type, args) {
  if (!VERIFY_COMMIT_BY_QUERY) return;

  if (type === 'submitProduce') {
    await waitForLot(contract, args[0], () => true, 'submitted');
  } else if (type === 'testCoffee') {
    await waitForLot(contract, args[0], (lot) => lot.status === 'APPROVED' || lot.status === 'REJECTED', 'tested');
  } else if (type === 'makeOffer') {
    const [lotId, retailerId] = args;
    await waitForLot(contract, lotId, (lot) => {
      const offers = Array.isArray(lot.offers) ? lot.offers : [];
      return lot.highestOffer?.retailerId === retailerId || offers.some((offer) => offer.retailerId === retailerId);
    }, 'offer visible');
  } else if (type === 'acceptOffer') {
    const [lotId, retailerId] = args;
    await waitForLot(contract, lotId, (lot) => lot.status === 'SOLD' && lot.owner === retailerId, 'offer accepted');
  } else if (type === 'packLotIntoPackets') {
    await waitForLot(contract, args[0], (lot) => lot.status === 'PACKED', 'packed');
  } else if (type === 'purchasePacket') {
    const [packetId, consumerId] = args;
    await waitForPacket(contract, packetId, (packet) => packet.status === 'PURCHASED' && packet.owner === consumerId, 'purchased');
  }
}

const scheduler = createScheduler({
  enabled: ENABLE_SCHEDULER,
  getMetrics: () => metrics,
  onDecision: ({ prediction, decision }) => {
    metrics.scheduler.lastAction = decision.action;
    metrics.scheduler.lastPrediction = prediction;
    if (decision.action === 'delay') metrics.scheduler.delayedTx++;
  }
});

const rlScheduler = ENABLE_RL_SCHEDULER
  ? new (require('../digital_twin_RL/rl_scheduler').RlScheduler)({
    getMetrics: () => metrics
  })
  : null;

async function scheduleTransaction(tx, submitFn) {
  const functionName = tx.functionName || tx.type;
  const conflictKeys = tx.conflictKeys || [];
  const learnedQueueKeys = learnedScopedQueueKeys(functionName, conflictKeys);
  const queueKeys = tx.queueKeys || (
    ENABLE_LEARNED_MVCC_QUEUE
      ? learnedQueueKeys
      : scopedQueueKeys(functionName, conflictKeys)
  );
  if (FUNCTION_LEVEL_QUEUE_FUNCTIONS.has(functionName)) {
    queueKeys.push(functionLevelQueueKey(functionName));
  }
  tx.hasActiveConflictKey = queueKeys.some((key) => activeWalletKeys.has(key));
  tx.hasLearnedConflictKey = learnedQueueKeys.length > 0;

  if (ENABLE_RL_SCHEDULER) {
    if (tx.hasLearnedConflictKey && tx.hasActiveConflictKey && queueKeys.length) {
      metrics.rl.actions.force_queue_conflict_key = (metrics.rl.actions.force_queue_conflict_key || 0) + 1;
      metrics.rl.status.safety_override = (metrics.rl.status.safety_override || 0) + 1;
      metrics.rl.lastAction = 'force_queue_conflict_key';
      metrics.rl.lastStatus = 'safety_override';
      metrics.rl.learnedConflictDecisions++;
      metrics.rl.activeConflictDecisions++;
      return withWalletQueue(queueKeys, submitFn, tx);
    }

    const activeSubmit = () => withActiveConflictKeys(queueKeys, submitFn, tx);
    const queueFn = queueKeys.length
      ? () => withWalletQueue(queueKeys, submitFn, tx)
      : null;
    const result = await rlScheduler.schedule(tx, activeSubmit, queueFn);
    const action = result.action || 'unknown';
    const status = result.decisionStatus || 'unknown';
    metrics.rl.actions[action] = (metrics.rl.actions[action] || 0) + 1;
    metrics.rl.status[status] = (metrics.rl.status[status] || 0) + 1;
    metrics.rl.lastAction = action;
    metrics.rl.lastStatus = status;
    if (result.hadLearnedConflictKey) metrics.rl.learnedConflictDecisions++;
    if (result.hadActiveConflictKey) metrics.rl.activeConflictDecisions++;
    return result;
  }

  const runSubmit = () => withWalletQueue(queueKeys, () => scheduler.schedule(tx, submitFn), tx);
  const result = await runSubmit();
  return typeof result === 'object' ? result : { ok: Boolean(result) };
}

class Stakeholder {
  constructor(org, userId) {
    this.org = org;
    this.userId = userId;
    this.gateway = null;
    this.contract = null;
    this.connecting = null;
  }

  async connect() {
    if (this.contract && this.gateway) {
      return { gateway: this.gateway, contract: this.contract };
    }
    if (this.connecting) {
      return this.connecting;
    }

    const ccpPath = path.join(connectionRoot, `connection-${this.org}.json`);
    const walletPath = path.join(walletRoot, this.org);
    requireFile(ccpPath, `${this.org} connection profile`);
    requireFile(path.join(walletPath, `${this.userId}.id`), `${this.org}/${this.userId} identity`);

    this.connecting = (async () => {
      const ccp = applySdkTimeouts(JSON.parse(fs.readFileSync(ccpPath, 'utf8')));
      const wallet = await Wallets.newFileSystemWallet(walletPath);
      const gateway = new Gateway();
      await gateway.connect(ccp, {
        wallet,
        identity: this.userId,
        discovery: { enabled: true, asLocalhost: true },
        eventHandlerOptions: {
          commitTimeout: COMMIT_TIMEOUT_SEC,
          strategy: WAIT_FOR_COMMIT ? commitStrategy() : DefaultEventHandlerStrategies.NONE
        }
      });
      const network = await gateway.getNetwork(CHANNEL_NAME);
      this.gateway = gateway;
      this.contract = network.getContract(CHAINCODE_NAME);
      return { gateway: this.gateway, contract: this.contract };
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  close() {
    if (this.gateway) {
      this.gateway.disconnect();
      this.gateway = null;
      this.contract = null;
    }
  }

  async submit(type, args, learningContext = {}) {
    const response = await this.submitResult(type, args, type, learningContext);
    return response.ok;
  }

  async submitResult(type, args, metricType = type, learningContext = {}) {
    releaseTxStart();
    metrics.startedTx++;
    metrics.inFlight++;
    noteProgress();
    const startedAt = performance.now();
    releasePairwiseReservation();
    try {
      const session = await this.connect();
      const result = await session.contract.submitTransaction(type, ...args);
      await verifyCommitted(session.contract, type, args);
      record(this, metricType, true, null, learningContext, Math.max(0, performance.now() - startedAt));
      return { ok: true, result: result.toString() };
    } catch (error) {
      record(this, metricType, false, error, learningContext, Math.max(0, performance.now() - startedAt));
      return { ok: false, error };
    } finally {
      metrics.inFlight--;
    }
  }

  async evaluate(type, args) {
    const session = await this.connect();
    const result = await session.contract.evaluateTransaction(type, ...args);
    return result.toString();
  }
}

async function readWalletBalances(stakeholders) {
  const balances = {};
  for (const stakeholder of stakeholders) {
    const key = `${stakeholder.org}/${stakeholder.userId}`;
    try {
      const result = await stakeholder.evaluate('getWalletBalance', [stakeholder.org, stakeholder.userId]);
      balances[key] = JSON.parse(result);
    } catch (error) {
      balances[key] = { error: error.message || String(error) };
    }
  }
  return balances;
}

async function readTestingFees(aggregators) {
  const fees = {};
  for (const aggregator of aggregators) {
    const key = `${aggregator.org}/${aggregator.userId}`;
    try {
      const result = await aggregator.evaluate('getTestingFee', [aggregator.userId]);
      fees[key] = JSON.parse(result);
    } catch (error) {
      fees[key] = { error: error.message || String(error) };
    }
  }
  return fees;
}

async function queryExistingLots(pools) {
  const lotsById = new Map();

    async function query(stakeholder, type, args, label) {
      if (!stakeholder) return;
      try {
        const result = await stakeholder.evaluate(type, args);
        const lots = parseArrayResult(result).map(normalizeLot);
        console.log(`Existing lot query ${label} returned ${lots.length}`);
        for (const lot of lots) {
          if (lot.lotId) lotsById.set(lot.lotId, lot);
      }
    } catch (error) {
      console.log(`Existing lot query ${label} failed: ${error.message || error}`);
    }
  }

  if (TEST_TPS > 0) {
    for (const farmer of pools.farmers) {
      await query(farmer, 'getProduceByStatusAndOwner', ['SUBMITTED', farmer.userId, EXISTING_LOT_QUERY_LIMIT], `SUBMITTED owner=${farmer.userId}`);
    }
  }

  if (MAKE_OFFER_TPS > 0) {
    for (const farmer of pools.farmers) {
      await query(farmer, 'getProduceByStatusAndOwner', ['APPROVED', farmer.userId, EXISTING_LOT_QUERY_LIMIT], `APPROVED owner=${farmer.userId}`);
    }
  }

  if (ACCEPT_TPS > 0) {
    for (const farmer of pools.farmers) {
      await query(farmer, 'getLotsWithOffersByOwner', [farmer.userId, EXISTING_LOT_QUERY_LIMIT], `APPROVED-with-offer owner=${farmer.userId}`);
    }
  }

  if (PACK_TPS > 0) {
    for (const retailer of pools.retailers) {
      await query(retailer, 'getProduceByStatusAndOwner', ['SOLD', retailer.userId, EXISTING_LOT_QUERY_LIMIT], `SOLD owner=${retailer.userId}`);
      await query(retailer, 'getProduceByStatusAndOwner', ['ACCEPTED', retailer.userId, EXISTING_LOT_QUERY_LIMIT], `ACCEPTED owner=${retailer.userId}`);
    }
  }

  return uniqueById(Array.from(lotsById.values()), 'lotId');
}

async function queryExistingPackets(pools) {
  const packetsById = new Map();
  const fallbackReader = pools.retailers[0] || pools.consumers[0] || pools.farmers[0];

  async function addPackets(result, label, ownerId = '') {
    const packets = parseArrayResult(result).map((packet) => normalizePacket({
      ...packet,
      retailerId: packet.retailerId || packet.ownerRetailerId || packet.trace?.retailerId || packet.trace?.packedBy || ownerId
    }));
    console.log(`Existing packet query ${label} returned ${packets.length}`);
    for (const packet of packets) {
      if (packet.packetId) packetsById.set(packet.packetId, packet);
    }
  }

  async function queryByRetailer(retailer, status) {
    try {
      const result = await retailer.evaluate('getAllPacketsByRetailer', [retailer.userId, status, EXISTING_PACKET_QUERY_LIMIT]);
      await addPackets(result, `retailer=${retailer.userId} status=${status}`, retailer.userId);
    } catch (error) {
      console.log(`Existing packet query retailer=${retailer.userId} status=${status} failed: ${error.message || error}`);
    }
  }

  async function queryAll(args, label) {
    if (!fallbackReader) return;
    try {
      const result = await fallbackReader.evaluate('getAllPackets', args);
      await addPackets(result, label);
    } catch (error) {
      console.log(`Existing packet query ${label} failed: ${error.message || error}`);
    }
  }

  for (const status of EXISTING_PACKET_STATUSES) {
    for (const retailer of pools.retailers) {
      await queryByRetailer(retailer, status);
    }
  }

  if (packetsById.size === 0) {
    for (const status of EXISTING_PACKET_STATUSES) {
      await queryAll([status, EXISTING_PACKET_QUERY_LIMIT], `status=${status}`);
    }
  }

  if (packetsById.size === 0) {
    await queryAll([], 'all');
  }

  return uniqueById(Array.from(packetsById.values()), 'packetId');
}

function putMany(target, items) {
  const existing = new Set(target.map((item) => item.lotId || item.packetId));
  for (const item of items) {
    const id = item.lotId || item.packetId;
    if (!id || existing.has(id)) continue;
    target.push(item);
    existing.add(id);
  }
}

async function preloadExistingLedgerAssets(pools, state) {
  const needsLots = TEST_TPS > 0 || MAKE_OFFER_TPS > 0 || ACCEPT_TPS > 0 || PACK_TPS > 0;
  const needsPackets = PURCHASE_TPS > 0;
  const lots = needsLots ? await queryExistingLots(pools) : [];
  const packets = needsPackets ? await queryExistingPackets(pools) : [];
  const selected = {
    farmers: new Set(pools.farmers.map((stakeholder) => stakeholder.userId)),
    aggregators: new Set(pools.aggregators.map((stakeholder) => stakeholder.userId)),
    retailers: new Set(pools.retailers.map((stakeholder) => stakeholder.userId)),
    consumers: new Set(pools.consumers.map((stakeholder) => stakeholder.userId))
  };
  const selectedUser = (role, userId) => {
    const normalized = normalizeUserId(userId);
    return Boolean(normalized && selected[role].has(normalized));
  };

  const submitted = lots.filter((lot) =>
    (lot.status === 'SUBMITTED' || lot.status === 'PENDING') &&
    selectedUser('farmers', lot.farmerId) &&
    (!lot.aggregatorId || selectedUser('aggregators', lot.aggregatorId))
  );
  const approved = lots.filter((lot) =>
    lot.status === 'APPROVED' &&
    selectedUser('farmers', lot.farmerId) &&
    (!lot.aggregatorId || selectedUser('aggregators', lot.aggregatorId))
  );
  const offered = approved
    .filter(hasVisibleOffer)
    .map((lot) => ({ ...lot, retailerId: normalizeUserId(latestOffer(lot)?.retailerId || lot.retailerId) }))
    .filter((lot) => selectedUser('retailers', lot.retailerId));
  const accepted = lots
    .filter((lot) => ['SOLD', 'ACCEPTED'].includes(lot.status) && lot.retailerId)
    .map((lot) => ({ ...lot, retailerId: normalizeUserId(lot.retailerId) }))
    .filter((lot) =>
      selectedUser('retailers', lot.retailerId) &&
      (!lot.farmerId || selectedUser('farmers', lot.farmerId))
    );
  const availablePackets = packets.filter((packet) => {
    const status = packet.status || '';
    return (!status || EXISTING_PACKET_STATUSES.includes(status)) &&
      (!packet.retailerId || selectedUser('retailers', packet.retailerId)) &&
      (!packet.consumerId || selectedUser('consumers', packet.consumerId));
  });

  putMany(state.submittedLots, submitted);
  putMany(state.approvedLots, approved);
  putMany(state.offeredLots, offered);
  putMany(state.acceptedLots, accepted);
  putMany(state.knownPackets, availablePackets);

  for (const lot of [...approved, ...offered]) {
    offerPricesForPreload(state.offerPrices, lot);
  }

  console.log('');
  console.log('Existing ledger assets loaded');
  console.log(`  Submitted lots: ${submitted.length}`);
  console.log(`  Approved lots:  ${approved.length}`);
  console.log(`  Lots with offer:${offered.length}`);
  console.log(`  Sold lots:      ${accepted.length}`);
  console.log(`  Packets:        ${availablePackets.length}`);
  console.log(`  Packet statuses:${JSON.stringify(countByStatus(packets))}`);
}

function offerPricesForPreload(offerPrices, lot) {
  offerPrices.set(lot.lotId, Math.max(offerPrices.get(lot.lotId) || 50, offerPrice(lot)));
}

function printMissingPreloadWarnings(state) {
  const warnings = [
    [TEST_TPS > 0 && state.submittedLots.length === 0, 'testCoffee needs existing SUBMITTED lots. None were preloaded.'],
    [MAKE_OFFER_TPS > 0 && state.approvedLots.length === 0, 'makeOffer needs existing APPROVED lots. None were preloaded.'],
    [ACCEPT_TPS > 0 && state.offeredLots.length === 0, 'acceptOffer needs APPROVED lots with an offer. None were preloaded.'],
    [PACK_TPS > 0 && state.acceptedLots.length === 0, 'packLotIntoPackets needs SOLD or ACCEPTED lots. None were preloaded.'],
    [PURCHASE_TPS > 0 && state.knownPackets.length === 0, 'purchasePacket needs existing AVAILABLE packets. None were preloaded.']
  ].filter(([condition]) => condition);

  if (!warnings.length) return;
  console.log('');
  console.log('No runnable existing assets for selected function.');
  for (const [, message] of warnings) {
    console.log(`  ${message}`);
  }
  console.log('Create the required ledger assets first, increase NUM_USERS/EXISTING_LOT_QUERY_LIMIT, or run with USE_EXISTING_ASSETS=false SETUP_TPS=5.');
}

function walletAmount(wallet) {
  if (!wallet || wallet.error) return null;
  const candidates = ['balance', 'amount', 'walletBalance', 'value'];
  for (const field of candidates) {
    if (wallet[field] !== undefined) return Number(wallet[field]);
  }
  if (typeof wallet === 'number') return wallet;
  return null;
}

function printTestingFees(title, fees) {
  console.log('');
  console.log(title);
  for (const [stakeholder, fee] of Object.entries(fees)) {
    if (fee.error) {
      console.log(`  ${stakeholder.padEnd(22)} error: ${fee.error}`);
      continue;
    }
    const amount = fee.feeAmount !== undefined ? Number(fee.feeAmount).toFixed(2) : JSON.stringify(fee);
    console.log(`  ${stakeholder.padEnd(22)} ${amount}`);
  }
}

function printWalletSnapshot(title, balances, initialBalances = null) {
  console.log('');
  console.log(title);
  for (const [stakeholder, wallet] of Object.entries(balances)) {
    if (wallet.error) {
      console.log(`  ${stakeholder.padEnd(22)} error: ${wallet.error}`);
      continue;
    }
    const amount = walletAmount(wallet);
    const initialAmount = initialBalances ? walletAmount(initialBalances[stakeholder]) : null;
    const delta = amount !== null && initialAmount !== null
      ? ` | delta=${(amount - initialAmount).toFixed(2)}`
      : '';
    const display = amount !== null ? amount.toFixed(2) : JSON.stringify(wallet);
    console.log(`  ${stakeholder.padEnd(22)} ${display}${delta}`);
  }
}

function printRlSummary() {
  if (!ENABLE_RL_SCHEDULER) return;
  console.log('');
  console.log('RL action summary');
  const actions = Object.entries(metrics.rl.actions).sort((a, b) => b[1] - a[1]);
  if (!actions.length) {
    console.log('  no RL actions recorded');
  } else {
    actions.forEach(([action, count]) => console.log(`  ${action.padEnd(20)} ${count}`));
  }
  const statuses = Object.entries(metrics.rl.status).sort((a, b) => b[1] - a[1]);
  if (statuses.length) {
    console.log('RL decision status');
    statuses.forEach(([status, count]) => console.log(`  ${status.padEnd(20)} ${count}`));
  }
  console.log(`RL learned-key decisions: ${metrics.rl.learnedConflictDecisions}`);
  console.log(`RL active-key decisions: ${metrics.rl.activeConflictDecisions}`);
}

function walletDeltas(initialBalances, finalBalances) {
  const deltas = {};
  for (const [stakeholder, finalWallet] of Object.entries(finalBalances)) {
    const initialAmount = walletAmount(initialBalances[stakeholder]);
    const finalAmount = walletAmount(finalWallet);
    if (initialAmount !== null && finalAmount !== null) {
      deltas[stakeholder] = finalAmount - initialAmount;
    }
  }
  return deltas;
}

function latencySummary(values = []) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) {
    return {
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p95Ms: 0
    };
  }

  const sum = numbers.reduce((total, value) => total + value, 0);
  const p95Index = Math.min(numbers.length - 1, Math.ceil(numbers.length * 0.95) - 1);
  return {
    avgMs: sum / numbers.length,
    minMs: numbers[0],
    maxMs: numbers[numbers.length - 1],
    p95Ms: numbers[p95Index]
  };
}

function perTxTypeMetrics() {
  return Object.fromEntries(Object.entries(metrics.perTxType).map(([functionName, stats]) => [
    functionName,
    {
      ...stats,
      latency: latencySummary(stats.latencyMs || [])
    }
  ]));
}

function runElapsedSeconds() {
  const loadEndedAt = metrics.loadEndedAt || Date.now();
  return Math.max((loadEndedAt - metrics.startedAt) / 1000, 0.1);
}

function wallElapsedSeconds() {
  return Math.max((Date.now() - metrics.startedAt) / 1000, 0.1);
}

function buildLearningRecord(initialWalletBalances, finalWalletBalances, testingFees) {
  const loadElapsed = runElapsedSeconds();
  const wallElapsed = wallElapsedSeconds();
  const successRate = metrics.totalTx ? metrics.successTx / metrics.totalTx : 0;
  const submittedTps = metrics.startedTx / loadElapsed;
  const completedTps = metrics.totalTx / loadElapsed;
  const endToEndSubmittedTps = metrics.startedTx / wallElapsed;
  const endToEndCompletedTps = metrics.totalTx / wallElapsed;
  const failureRate = metrics.totalTx ? metrics.failureTx / metrics.totalTx : 0;
  const skippedRate = (metrics.startedTx + metrics.skippedTx)
    ? metrics.skippedTx / (metrics.startedTx + metrics.skippedTx)
    : 0;
  const timeoutFailures = metrics.lastError && /timed out|not visible|timeout/i.test(metrics.lastError) ? metrics.failureTx : 0;
  const latency = latencySummary(metrics.latencyMs);

  return {
    timestamp: new Date().toISOString(),
    channel: CHANNEL_NAME,
    chaincode: CHAINCODE_NAME,
    config: {
      simulationMode: process.env.SIMULATION_MODE || 'default',
      numUsers: NUM_USERS,
      durationSec: DURATION_SEC,
      targetTxCount: TARGET_TX_COUNT,
      noWorkTimeoutSec: NO_WORK_TIMEOUT_SEC,
      targetTps: TARGET_TPS,
      submitTps: SUBMIT_TPS,
      testTps: TEST_TPS,
      makeOfferTps: MAKE_OFFER_TPS,
      acceptTps: ACCEPT_TPS,
      packTps: PACK_TPS,
      purchaseTps: PURCHASE_TPS,
      maxInFlight: MAX_IN_FLIGHT,
      pairwiseDetection: PAIRWISE_DETECTION,
      forceSharedConflictKeys: FORCE_SHARED_CONFLICT_KEYS,
      strictMvccLearning: STRICT_MVCC_LEARNING,
      enableRlScheduler: ENABLE_RL_SCHEDULER,
      enableWalletQueue: ENABLE_WALLET_QUEUE,
      enableLearnedMvccQueue: ENABLE_LEARNED_MVCC_QUEUE,
      enableConflictKeyLearning: ENABLE_CONFLICT_KEY_LEARNING,
      enableBackpressureSkip: ENABLE_BACKPRESSURE_SKIP,
      useExistingAssets: USE_EXISTING_ASSETS,
      fixedPurchaseConsumer: FIXED_PURCHASE_CONSUMER || null,
      functionLevelQueueFunctions: Array.from(FUNCTION_LEVEL_QUEUE_FUNCTIONS),
      verifyCommitByQuery: VERIFY_COMMIT_BY_QUERY,
      waitForCommit: WAIT_FOR_COMMIT,
      commitVerifyTimeoutMs: COMMIT_VERIFY_TIMEOUT_MS,
      makeOfferPriceGap: MAKE_OFFER_PRICE_GAP
    },
    observation: {
      loadElapsedSec: loadElapsed,
      wallElapsedSec: wallElapsed,
      drainElapsedSec: Math.max(wallElapsed - loadElapsed, 0),
      submittedTps,
      completedTps,
      loadWindowSubmittedTps: submittedTps,
      loadWindowCompletedTps: completedTps,
      endToEndSubmittedTps,
      endToEndCompletedTps,
      inFlightAtEnd: metrics.inFlight,
      reservedAtEnd: metrics.reservedTx,
      started: metrics.startedTx,
      queued: metrics.queuedTx,
      skipped: metrics.skippedTx,
      success: metrics.successTx,
      failure: metrics.failureTx,
      successRate,
      failureRate,
      skippedRate,
      timeoutFailures,
      latency,
      avgLatencyMs: latency.avgMs,
      minLatencyMs: latency.minMs,
      maxLatencyMs: latency.maxMs,
      p95LatencyMs: latency.p95Ms,
      perTxType: perTxTypeMetrics(),
      lastError: metrics.lastError,
      stopReason: metrics.stopReason,
      failureStreaks: metrics.failureStreaks,
      repeatedFailureAlerts: metrics.repeatedFailureAlerts,
      onlineLearning: metrics.onlineLearning,
      rl: metrics.rl
    },
    wallets: {
      initial: initialWalletBalances,
      final: finalWalletBalances,
      delta: walletDeltas(initialWalletBalances, finalWalletBalances)
    },
    testingFees,
    reward: (successRate * 100) + completedTps - (failureRate * 100) - (skippedRate * 25) - (timeoutFailures * 2)
  };
}

function appendLearningRecord(record) {
  fs.mkdirSync(path.dirname(RUN_HISTORY_FILE), { recursive: true });
  fs.appendFileSync(RUN_HISTORY_FILE, `${JSON.stringify(record)}\n`);
  console.log('');
  console.log(`Learning record saved: ${RUN_HISTORY_FILE}`);
  console.log(`Reward: ${record.reward.toFixed(2)} | successRate=${(record.observation.successRate * 100).toFixed(1)}% | completedTps=${record.observation.completedTps.toFixed(2)}`);
}

function appendTrainingRows() {
  const tpsByFunction = {
    submitProduce: SUBMIT_TPS,
    testCoffee: TEST_TPS,
    makeOffer: MAKE_OFFER_TPS,
    acceptOffer: ACCEPT_TPS,
    packLotIntoPackets: PACK_TPS,
    purchasePacket: PURCHASE_TPS
  };
  const fileExists = fs.existsSync(TRAINING_DATA_FILE);
  fs.mkdirSync(path.dirname(TRAINING_DATA_FILE), { recursive: true });
  const lines = [];
  if (!fileExists) {
    lines.push('timestamp,functionName,tps,success,failure');
  }
  const timestamp = new Date().toISOString();
  for (const [functionName, stats] of Object.entries(metrics.perTxType)) {
    if ((tpsByFunction[functionName] || 0) <= 0 && stats.success === 0 && stats.failure === 0) continue;
    lines.push([
      timestamp,
      functionName,
      tpsByFunction[functionName] || 0,
      stats.success,
      stats.failure
    ].join(','));
  }
  fs.appendFileSync(TRAINING_DATA_FILE, `${lines.join('\n')}\n`);
  console.log(`Training rows saved: ${TRAINING_DATA_FILE}`);
}

function updateResultTablesAfterRun() {
  if (!UPDATE_TABLES_AFTER_RUN) return;
  console.log('');
  console.log('Updating result tables...');
  const result = spawnSync(process.execPath, ['summarize_experiment_results.js'], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    console.warn(`Result table update failed with exit code ${result.status}`);
  }
}

async function main() {
  const pools = {
    farmers: availableUsers('farmers').map((id) => new Stakeholder('farmers', id)),
    retailers: availableUsers('retailers').map((id) => new Stakeholder('retailers', id)),
    aggregators: availableUsers('aggregators').map((id) => new Stakeholder('aggregators', id)),
    consumers: availableUsers('consumers').map((id) => new Stakeholder('consumers', id))
  };

  if (!pools.farmers.length || !pools.retailers.length || !pools.aggregators.length || !pools.consumers.length) {
    throw new Error('Simulator needs User identities in backend/wallet for farmers, retailers, aggregators, and consumers.');
  }

  const submittedLots = [];
  const approvedLots = [];
  const offeredLots = [];
  const acceptedLots = [];
  const knownPackets = [];
  const offerPrices = new Map();
  let endTime;
  let liveTimer;
  let stopLoadAndDrain;

  const noWorkTimedOut = () => hasTargetTxCount() &&
    NO_WORK_TIMEOUT_SEC > 0 &&
    metrics.inFlight === 0 &&
    metrics.reservedTx === 0 &&
    (Date.now() - metrics.lastProgressAt) >= NO_WORK_TIMEOUT_SEC * 1000;

  const schedule = (tps, task) => {
    if (tps <= 0) return null;
    let carry = 0;
    const timer = setInterval(() => {
      if (noWorkTimedOut()) {
        metrics.stopReason = `no runnable work for ${NO_WORK_TIMEOUT_SEC}s before reaching TARGET_TX_COUNT`;
        if (stopLoadAndDrain) stopLoadAndDrain();
        return;
      }
      if ((!hasTargetTxCount() && Date.now() >= endTime) || txTargetReached()) {
        if (hasTargetTxCount() && stopLoadAndDrain) stopLoadAndDrain();
        return;
      }
      carry += (tps * SCHEDULER_TICK_MS) / 1000;
      const due = Math.floor(carry);
      carry -= due;
      for (let i = 0; i < due; i++) {
        if (txTargetReached()) {
          if (hasTargetTxCount() && stopLoadAndDrain) stopLoadAndDrain();
          break;
        }
        task();
      }
    }, Math.max(1, SCHEDULER_TICK_MS));
    return timer;
  };

  const submitWhenReady = async (isReady, submit) => {
    if (!isReady()) return;
    if (!reserveTxStart()) return;
    if (!(await waitForCapacity())) {
      releaseTxStart();
      metrics.skippedTx++;
      return;
    }
    await submit();
  };

  const runLimitText = hasTargetTxCount()
    ? `${TARGET_TX_COUNT} transactions`
    : `${DURATION_SEC}s`;
  console.log(`Simulation started with up to ${NUM_USERS} users per stakeholder for ${runLimitText}.`);
  console.log(`Using channel ${CHANNEL_NAME} and chaincode ${CHAINCODE_NAME}.`);
  console.log(`Simulation mode: ${process.env.SIMULATION_MODE || 'default'}.`);
  console.log(`Target TPS=${TARGET_TPS}, target transactions=${hasTargetTxCount() ? TARGET_TX_COUNT : 'duration-based'}, max in-flight=${MAX_IN_FLIGHT}, capacity wait=${CAPACITY_WAIT_MS}ms, commit query timeout=${COMMIT_VERIFY_TIMEOUT_MS}ms.`);
  console.log(`Backpressure skip: ${ENABLE_BACKPRESSURE_SKIP ? 'enabled' : 'disabled'}.`);
  console.log(`Count success after commit: ${VERIFY_COMMIT_BY_QUERY ? 'yes, by ledger query' : WAIT_FOR_COMMIT ? 'yes, by SDK event' : 'no'}.`);
  console.log(`Force shared conflict keys: ${FORCE_SHARED_CONFLICT_KEYS ? 'enabled' : 'disabled'}.`);
  if (FORCE_SHARED_CONFLICT_KEYS) console.log(`Detection shared key under test: ${DETECTION_SHARED_KEY}.`);
  console.log(`Learned MVCC queue: ${ENABLE_LEARNED_MVCC_QUEUE ? 'enabled (learn first, then queue risky conflict keys)' : 'disabled (queue all submitProduce conflict keys)'}.`);
  console.log(`Function-level queue: ${FUNCTION_LEVEL_QUEUE_FUNCTIONS.size ? Array.from(FUNCTION_LEVEL_QUEUE_FUNCTIONS).join(', ') : 'disabled'}.`);
  console.log(`Conflict-key learning: ${ENABLE_CONFLICT_KEY_LEARNING ? 'enabled' : 'disabled (using loaded keys only)'}.`);
  console.log(`Existing ledger asset preload: ${USE_EXISTING_ASSETS ? 'enabled' : 'disabled'}.`);
  console.log(`Fixed purchase consumer: ${FIXED_PURCHASE_CONSUMER || 'disabled'}.`);
  const loadedConflictKeys = loadLearnedConflictKeysFromHistory();
  console.log(`Loaded learned conflict keys: ${loadedConflictKeys}`);
  console.log(`RL scheduler: ${ENABLE_RL_SCHEDULER ? 'enabled' : 'disabled'}.`);
  if (WAIT_FOR_COMMIT) {
    console.log(`SDK commit strategy ${COMMIT_STRATEGY}, timeout ${COMMIT_TIMEOUT_SEC}s.`);
  }
  console.log(`Selected farmers: ${poolUserIds(pools.farmers)}`);
  console.log(`Selected aggregators: ${poolUserIds(pools.aggregators)}`);
  console.log(`Selected retailers: ${poolUserIds(pools.retailers)}`);
  console.log(`Selected consumers: ${poolUserIds(pools.consumers)}`);

  const walletStakeholders = [
    ...pools.farmers,
    ...pools.aggregators,
    ...pools.retailers,
    ...pools.consumers
  ];
  const testingFees = await readTestingFees(pools.aggregators);
  printTestingFees('Aggregator testing fees', testingFees);
  const initialWalletBalances = await readWalletBalances(walletStakeholders);
  printWalletSnapshot('Initial stakeholder wallets', initialWalletBalances);
  if (USE_EXISTING_ASSETS) {
    await preloadExistingLedgerAssets(pools, {
      submittedLots,
      approvedLots,
      offeredLots,
      acceptedLots,
      knownPackets,
      offerPrices
    });
    printMissingPreloadWarnings({ submittedLots, approvedLots, offeredLots, acceptedLots, knownPackets });
  }

  metrics.startedAt = Date.now();
  metrics.loadEndedAt = null;
  metrics.phase = 'running';
  endTime = Date.now() + (DURATION_SEC * 1000);
  liveTimer = setInterval(printLiveStats, 1000);

  const timers = [
    schedule(SUBMIT_TPS, async () => {
      if (!reserveTxStart()) return;
      if (ENABLE_BACKPRESSURE_SKIP && !(await waitForCapacity())) {
        releaseTxStart();
        metrics.skippedTx++;
        return;
      }
      const farmer = FORCE_SHARED_CONFLICT_KEYS ? pools.farmers[0] : randomFrom(pools.farmers);
      const aggregator = FORCE_SHARED_CONFLICT_KEYS ? pools.aggregators[0] : randomFrom(pools.aggregators);
      if (!farmer || !aggregator) {
        releaseTxStart();
        return;
      }
      const lotId = randomId('LOT');
      const conflictKeys = submitProduceConflictKeys(farmer.userId, aggregator.userId);
      rememberIdentifiedConflictKeys('submitProduce', {
        farmer: farmer.userId,
        aggregator: aggregator.userId,
        lot: lotId
      }, conflictKeys);
      const response = await scheduleTransaction({
          type: 'submitProduce',
          functionName: 'submitProduce',
          stakeholder: farmer,
          assetId: lotId,
          targetTps: SUBMIT_TPS,
          farmers: pools.farmers.length,
          aggregators: pools.aggregators.length,
          conflictKeys
        }, () => farmer.submit(
          'submitProduce',
          [lotId, farmer.userId, '10', new Date().toISOString().slice(0, 10), '1', aggregator.userId],
          {
            functionName: 'submitProduce',
            lotId,
            farmerId: farmer.userId,
            aggregatorId: aggregator.userId,
            conflictKeys
          }
        ));
      if (response.ok) addAfterSettle(submittedLots, {
        lotId,
        farmerId: farmer.userId,
        aggregatorId: aggregator.userId,
        weightKg: 10
      });
    }),
    schedule(TEST_TPS, async () => {
      submitWhenReady(() => submittedLots.length, async () => {
        const lot = pickForcedLot(submittedLots, 'testCoffee', DETECTION_SHARED_KEY);
        if (!lot) return;
        const aggregator = FORCE_SHARED_CONFLICT_KEYS
          ? (findByUserId(pools.aggregators, lot.aggregatorId) || pools.aggregators[0])
          : (findByUserId(pools.aggregators, lot.aggregatorId) || randomFrom(pools.aggregators));
        if (!aggregator) {
          releaseTxStart();
          return;
        }
        const conflictKeys = detectionConflictKeys('testCoffee', compactConflictKeys([
          lotKey(lot.lotId)
        ]));
        rememberIdentifiedConflictKeys('testCoffee', {
          lot: lot.lotId,
          aggregator: aggregator.userId
        }, conflictKeys);
        const response = await scheduleTransaction({
          type: 'testCoffee',
          functionName: 'testCoffee',
          stakeholder: aggregator,
          assetId: lot.lotId,
          targetTps: TEST_TPS,
          farmers: pools.farmers.length,
          aggregators: pools.aggregators.length,
          conflictKeys
        }, () => aggregator.submit(
          'testCoffee',
          [lot.lotId, 'pass', '', ''],
          {
            functionName: 'testCoffee',
            lotId: lot.lotId,
            aggregatorId: aggregator.userId,
            conflictKeys
          }
        ));
        if (response.ok) {
          removeByLot(submittedLots, lot.lotId);
          addAfterSettle(approvedLots, lot);
        } else {
          if (!FORCE_SHARED_CONFLICT_KEYS) addAfterSettle(submittedLots, lot);
        }
      });
    }),
    schedule(MAKE_OFFER_TPS, () => submitWhenReady(() => approvedLots.length, async () => {
      const retailer = randomFrom(pools.retailers);
      const lot = pickMakeOfferLot(approvedLots);
      if (!retailer || !lot) {
        releaseTxStart();
        return;
      }
      const conflictKeys = detectionConflictKeys('makeOffer', compactConflictKeys([
        lotKey(lot.lotId),
        maybeParticipantKey('retailers', retailer.userId)
      ]));
      const learningContext = {
        functionName: 'makeOffer',
        lotId: lot.lotId,
        retailerId: retailer.userId,
        bid: '',
        conflictKeys
      };
      rememberIdentifiedConflictKeys('makeOffer', {
        lot: lot.lotId,
        retailer: retailer.userId,
        bid: 'calculated-after-queue-lock'
      }, conflictKeys);
      const response = await scheduleTransaction({
        type: 'makeOffer',
        functionName: 'makeOffer',
        stakeholder: retailer,
        assetId: lot.lotId,
        targetTps: MAKE_OFFER_TPS,
        farmers: pools.farmers.length,
        aggregators: pools.aggregators.length,
        conflictKeys
      }, () => {
        const nextPrice = (offerPrices.get(lot.lotId) || 50) + MAKE_OFFER_PRICE_GAP + Math.random();
        const bid = nextPrice.toFixed(2);
        offerPrices.set(lot.lotId, nextPrice);
        learningContext.bid = bid;
        return retailer.submit(
          'makeOffer',
          [lot.lotId, retailer.userId, bid],
          learningContext
        );
      });
      if (response.ok) {
        addAfterSettle(offeredLots, { ...lot, retailerId: retailer.userId });
      }
    })),
    schedule(ACCEPT_TPS, () => submitWhenReady(() => offeredLots.length, async () => {
      const offer = pickForcedLot(offeredLots, 'acceptOffer', DETECTION_SHARED_KEY);
      if (!offer) {
        releaseTxStart();
        return;
      }
      const farmer = findByUserId(pools.farmers, offer.farmerId) || randomFrom(pools.farmers);
      if (!farmer) {
        releaseTxStart();
        return;
      }
      const conflictKeys = detectionConflictKeys('acceptOffer', compactConflictKeys([
        lotKey(offer.lotId),
        maybeParticipantKey('retailers', offer.retailerId),
        maybeParticipantKey('farmers', offer.farmerId)
      ]));
      rememberIdentifiedConflictKeys('acceptOffer', {
        lot: offer.lotId,
        farmer: offer.farmerId,
        retailer: offer.retailerId
      }, conflictKeys);
      const response = await scheduleTransaction({
        type: 'acceptOffer',
        functionName: 'acceptOffer',
        stakeholder: farmer,
        assetId: offer.lotId,
        targetTps: ACCEPT_TPS,
        farmers: pools.farmers.length,
        aggregators: pools.aggregators.length,
        conflictKeys
      }, () => farmer.submit(
        'acceptOffer',
        [offer.lotId, offer.retailerId],
        {
          functionName: 'acceptOffer',
          lotId: offer.lotId,
          farmerId: offer.farmerId,
          retailerId: offer.retailerId,
          conflictKeys
        }
      ));
      if (response.ok) {
        removeByLot(approvedLots, offer.lotId);
        removeByLot(offeredLots, offer.lotId);
        addAfterSettle(acceptedLots, offer);
      } else {
        if (!FORCE_SHARED_CONFLICT_KEYS) addAfterSettle(offeredLots, offer);
      }
    })),
    schedule(PACK_TPS, () => submitWhenReady(() => acceptedLots.length, async () => {
      const lot = pickForcedLot(acceptedLots, 'packLotIntoPackets', DETECTION_SHARED_KEY);
      if (!lot) {
        releaseTxStart();
        return;
      }
      const retailer = findByUserId(pools.retailers, lot.retailerId) || randomFrom(pools.retailers);
      if (!retailer) {
        releaseTxStart();
        return;
      }
      const conflictKeys = detectionConflictKeys('packLotIntoPackets', compactConflictKeys([
        lotKey(lot.lotId)
      ]));
      rememberIdentifiedConflictKeys('packLotIntoPackets', {
        lot: lot.lotId,
        retailer: lot.retailerId
      }, conflictKeys);
      const response = await scheduleTransaction({
        type: 'packLotIntoPackets',
        functionName: 'packLotIntoPackets',
        stakeholder: retailer,
        assetId: lot.lotId,
        targetTps: PACK_TPS,
        farmers: pools.farmers.length,
        aggregators: pools.aggregators.length,
        conflictKeys
      }, () => retailer.submit(
        'packLotIntoPackets',
        [lot.lotId, '120', '70', '40', '20', ''],
        {
          functionName: 'packLotIntoPackets',
          lotId: lot.lotId,
          retailerId: lot.retailerId,
          conflictKeys
        }
      ));
      if (response.ok) {
        removeByLot(acceptedLots, lot.lotId);
        const packets = packetIdsForLot(lot.lotId, lot.weightKg).map((packetId) => ({
          packetId,
          retailerId: lot.retailerId
        }));
        setTimeout(() => knownPackets.push(...packets), LEDGER_SETTLE_MS);
      } else {
        if (!FORCE_SHARED_CONFLICT_KEYS) addAfterSettle(acceptedLots, lot);
      }
    })),
    schedule(PURCHASE_TPS, () => submitWhenReady(() => knownPackets.length, async () => {
      const packet = pickForcedPacket(knownPackets, DETECTION_SHARED_KEY);
      const consumer = pickPurchaseConsumer(pools.consumers, DETECTION_SHARED_KEY);
      if (!consumer || !packet) {
        releaseTxStart();
        return;
      }
      const conflictKeys = detectionConflictKeys('purchasePacket', compactConflictKeys([
        packetKey(packet.packetId),
        maybeParticipantKey('consumers', consumer.userId),
        maybeParticipantKey('retailers', packet.retailerId)
      ]));
      rememberIdentifiedConflictKeys('purchasePacket', {
        packet: packet.packetId,
        consumer: consumer.userId,
        retailer: packet.retailerId
      }, conflictKeys);
      const response = await scheduleTransaction({
        type: 'purchasePacket',
        functionName: 'purchasePacket',
        stakeholder: consumer,
        assetId: packet.packetId,
        targetTps: PURCHASE_TPS,
        farmers: pools.farmers.length,
        aggregators: pools.aggregators.length,
        conflictKeys
      }, () => consumer.submit(
        'purchasePacket',
        [packet.packetId, consumer.userId],
        {
          functionName: 'purchasePacket',
          packetId: packet.packetId,
          consumerId: consumer.userId,
          retailerId: packet.retailerId,
          conflictKeys
        }
      ));
      if (response.ok) {
        removeByPacket(knownPackets, packet.packetId);
      } else if (!FORCE_SHARED_CONFLICT_KEYS) {
        addAfterSettle(knownPackets, packet);
      }
    }))
  ].filter(Boolean);

  let finalizing = false;
  stopLoadAndDrain = async () => {
    if (finalizing) return;
    finalizing = true;
    metrics.phase = 'draining';
    metrics.loadEndedAt = Date.now();
    timers.forEach(clearInterval);
    const drainUntil = MAX_DRAIN_SEC > 0 ? Date.now() + (MAX_DRAIN_SEC * 1000) : Infinity;
    while ((metrics.inFlight > 0 || metrics.reservedTx > 0) && Date.now() < drainUntil) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (metrics.inFlight > 0 || metrics.reservedTx > 0) {
      console.log('');
      console.log(`Drain stopped with ${metrics.inFlight} transactions still in flight and ${metrics.reservedTx} reserved. Increase MAX_DRAIN_SEC or set MAX_DRAIN_SEC=0 to wait forever.`);
    }
    clearInterval(liveTimer);
    printLiveStats();
    printRlSummary();
    if (!WAIT_FOR_COMMIT && FINAL_WALLET_WAIT_MS > 0) {
      console.log('');
      console.log(`Waiting ${(FINAL_WALLET_WAIT_MS / 1000).toFixed(1)}s before final wallet read...`);
      await new Promise((resolve) => setTimeout(resolve, FINAL_WALLET_WAIT_MS));
    }
    const finalWalletBalances = await readWalletBalances(walletStakeholders);
    printWalletSnapshot('Initial stakeholder wallets', initialWalletBalances);
    printWalletSnapshot('Final stakeholder wallets', finalWalletBalances, initialWalletBalances);
    const learningRecord = buildLearningRecord(initialWalletBalances, finalWalletBalances, testingFees);
    appendLearningRecord(learningRecord);
    appendTrainingRows();
    updateResultTablesAfterRun();
    console.log(`Load-window achieved TPS: ${learningRecord.observation.completedTps.toFixed(2)} tx/s`);
    console.log(`Load-window submitted TPS: ${learningRecord.observation.submittedTps.toFixed(2)} tx/s`);
    console.log(`End-to-end achieved TPS: ${learningRecord.observation.endToEndCompletedTps.toFixed(2)} tx/s`);
    console.log(`End-to-end submitted TPS: ${learningRecord.observation.endToEndSubmittedTps.toFixed(2)} tx/s`);
    console.log(`Final success rate: ${(learningRecord.observation.successRate * 100).toFixed(1)}%`);
    Object.values(pools).flat().forEach((stakeholder) => stakeholder.close());
    console.log('Simulation completed.');
    process.exit(0);
  };

  if (hasTargetTxCount()) {
    const targetWatch = setInterval(() => {
      if (txTargetReached()) {
        clearInterval(targetWatch);
        stopLoadAndDrain();
      }
    }, 100);
  } else {
    setTimeout(stopLoadAndDrain, DURATION_SEC * 1000);
  }
}

main().catch((error) => {
  console.error(`Simulator failed to start: ${error.message}`);
  process.exit(1);
});
