'use strict';

const fs = require('fs');
const path = require('path');

const RUN_HISTORY_FILE = process.env.RUN_HISTORY_FILE || path.join(__dirname, 'logs', 'simulation-runs.jsonl');
const OUT_DIR = process.env.RESULTS_DIR || path.join(__dirname, 'logs', 'tables');

const functionTpsFields = {
  submitProduce: 'submitTps',
  testCoffee: 'testTps',
  makeOffer: 'makeOfferTps',
  acceptOffer: 'acceptTps',
  packLotIntoPackets: 'packTps',
  purchasePacket: 'purchaseTps'
};

function readRecords() {
  if (!fs.existsSync(RUN_HISTORY_FILE)) return [];
  return fs.readFileSync(RUN_HISTORY_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function functionFromMode(mode) {
  const match = String(mode || '').match(/^(submitProduce|testCoffee|makeOffer|acceptOffer|packLotIntoPackets|purchasePacket)-(detect|queue|baseline)$/);
  return match ? match[1] : '';
}

function modeFromRecord(record) {
  const mode = record.config?.simulationMode || '';
  if (mode.endsWith('-detect') || mode === 'conflict-key-detection') return 'conflict-identification';
  if (mode.endsWith('-queue') || mode === 'deterministic-conflict-key-queue') return 'queued-simulation';
  if (mode.endsWith('-baseline')) return 'baseline-simulation';
  if (record.config?.enableWalletQueue) return 'queued-simulation';
  if (record.config?.enableConflictKeyLearning) return 'conflict-identification';
  return 'other';
}

function functionFromRecord(record) {
  const fromMode = functionFromMode(record.config?.simulationMode);
  if (fromMode) return fromMode;

  let best = 'submitProduce';
  let bestTps = -1;
  for (const [functionName, field] of Object.entries(functionTpsFields)) {
    const value = Number(record.config?.[field] || 0);
    if (value > bestTps) {
      best = functionName;
      bestTps = value;
    }
  }
  return best;
}

function targetFunctionTps(record, functionName) {
  return Number(record.config?.[functionTpsFields[functionName]] || record.config?.targetTps || 0);
}

function isTransientConflictKey(key = '') {
  return key.startsWith('lot-') || key.startsWith('packet-');
}

function generalizeConflictKey(key = '') {
  if (key.startsWith('lot-')) return 'lot';
  if (key.startsWith('packet-')) return 'packet';
  return key;
}

function isPersistableConflictKey(functionName, key = '') {
  if (functionName === 'makeOffer' && key.startsWith('participant:')) return false;
  return true;
}

function learnedConflictKeys(record, functionName) {
  return [...new Set(Object.values(record.observation?.onlineLearning?.learnedConflictKeys || {})
    .filter((entry) => entry.functionName === functionName)
    .filter((entry) => isPersistableConflictKey(functionName, entry.conflictKey || ''))
    .map((entry) => `${functionName}:${generalizeConflictKey(entry.conflictKey || '')}`))]
    .sort();
}

function countLearnedKeys(record, functionName) {
  return learnedConflictKeys(record, functionName).length;
}

function rowFromRecord(record) {
  const functionName = functionFromRecord(record);
  const mode = modeFromRecord(record);
  const obs = record.observation || {};
  const conflictKeys = learnedConflictKeys(record, functionName);
  return {
    timestamp: record.timestamp || '',
    channel: record.channel || '',
    chaincode: record.chaincode || '',
    mode,
    functionName,
    targetFunctionTps: targetFunctionTps(record, functionName),
    totalTargetTps: Number(record.config?.targetTps || 0),
    achievedTps: Number(obs.completedTps || 0),
    submittedTps: Number(obs.submittedTps || 0),
    endToEndAchievedTps: Number(obs.endToEndCompletedTps || 0),
    endToEndSubmittedTps: Number(obs.endToEndSubmittedTps || 0),
    loadElapsedSec: Number(obs.loadElapsedSec || 0),
    wallElapsedSec: Number(obs.wallElapsedSec || 0),
    drainElapsedSec: Number(obs.drainElapsedSec || 0),
    avgLatencyMs: Number(obs.avgLatencyMs || obs.latency?.avgMs || 0),
    minLatencyMs: Number(obs.minLatencyMs || obs.latency?.minMs || 0),
    maxLatencyMs: Number(obs.maxLatencyMs || obs.latency?.maxMs || 0),
    p95LatencyMs: Number(obs.p95LatencyMs || obs.latency?.p95Ms || 0),
    successRatePct: Number(obs.successRate || 0) * 100,
    failureRatePct: Number(obs.failureRate || 0) * 100,
    success: Number(obs.success || 0),
    failure: Number(obs.failure || 0),
    queued: Number(obs.queued || 0),
    skipped: Number(obs.skipped || 0),
    learnedConflictKeys: conflictKeys.length,
    conflictKeys: conflictKeys.join('; '),
    reward: Number(record.reward || 0),
    lastError: obs.lastError || ''
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows) {
  const headers = [
    'timestamp',
    'channel',
    'chaincode',
    'mode',
    'functionName',
    'targetFunctionTps',
    'totalTargetTps',
    'achievedTps',
    'submittedTps',
    'endToEndAchievedTps',
    'endToEndSubmittedTps',
    'loadElapsedSec',
    'wallElapsedSec',
    'drainElapsedSec',
    'avgLatencyMs',
    'minLatencyMs',
    'maxLatencyMs',
    'p95LatencyMs',
    'successRatePct',
    'failureRatePct',
    'success',
    'failure',
    'queued',
    'skipped',
    'learnedConflictKeys',
    'conflictKeys',
    'reward',
    'lastError'
  ];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function mdNumber(value, digits = 2) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function writeMarkdown(filePath, title, rows) {
    const lines = [
      `# ${title}`,
      '',
    '| Function | Target TPS | Load TPS | End-to-End TPS | Load sec | Wall sec | Drain sec | Avg Latency ms | P95 Latency ms | Success % | Failure % | Success | Failure | Queued | Skipped | Learned Keys | Conflict Keys |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  ];
  for (const row of rows) {
    lines.push([
      row.functionName,
      mdNumber(row.targetFunctionTps),
      mdNumber(row.achievedTps),
      mdNumber(row.endToEndAchievedTps),
      mdNumber(row.loadElapsedSec),
      mdNumber(row.wallElapsedSec),
      mdNumber(row.drainElapsedSec),
      mdNumber(row.avgLatencyMs),
      mdNumber(row.p95LatencyMs),
      mdNumber(row.successRatePct, 1),
      mdNumber(row.failureRatePct, 1),
      row.success,
      row.failure,
      row.queued,
      row.skipped,
      row.learnedConflictKeys,
      row.conflictKeys || ''
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function latestByFunctionAndMode(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (!['conflict-identification', 'baseline-simulation', 'queued-simulation'].includes(row.mode)) continue;
    latest.set(`${row.mode}:${row.functionName}`, row);
  }
  return Array.from(latest.values())
    .sort((a, b) => a.mode.localeCompare(b.mode) || a.functionName.localeCompare(b.functionName));
}

function main() {
  const records = readRecords();
  const rows = records.map(rowFromRecord);
  const relevantRows = rows.filter((row) => ['conflict-identification', 'baseline-simulation', 'queued-simulation'].includes(row.mode));
  const latestRows = latestByFunctionAndMode(relevantRows);
  const detectionRows = latestRows.filter((row) => row.mode === 'conflict-identification');
  const baselineRows = latestRows.filter((row) => row.mode === 'baseline-simulation');
  const queuedRows = latestRows.filter((row) => row.mode === 'queued-simulation');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeCsv(path.join(OUT_DIR, 'all-experiment-results.csv'), relevantRows);
  writeCsv(path.join(OUT_DIR, 'latest-experiment-results.csv'), latestRows);
  writeMarkdown(path.join(OUT_DIR, 'conflict-identification-table.md'), 'Conflict Identification Results', detectionRows);
  writeMarkdown(path.join(OUT_DIR, 'baseline-simulation-table.md'), 'No-Queue Baseline Simulation Results', baselineRows);
  writeMarkdown(path.join(OUT_DIR, 'queued-simulation-table.md'), 'Queued Digital Twin Simulation Results', queuedRows);

  console.log(`Rows read: ${records.length}`);
  console.log(`Relevant experiment rows: ${relevantRows.length}`);
  console.log(`Tables written to: ${OUT_DIR}`);
  console.log(`- ${path.join(OUT_DIR, 'all-experiment-results.csv')}`);
  console.log(`- ${path.join(OUT_DIR, 'latest-experiment-results.csv')}`);
  console.log(`- ${path.join(OUT_DIR, 'conflict-identification-table.md')}`);
  console.log(`- ${path.join(OUT_DIR, 'baseline-simulation-table.md')}`);
  console.log(`- ${path.join(OUT_DIR, 'queued-simulation-table.md')}`);
}

main();
