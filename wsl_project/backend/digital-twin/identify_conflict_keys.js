'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RUN_HISTORY_FILE = process.env.RUN_HISTORY_FILE || path.join(__dirname, 'logs', 'simulation-runs.jsonl');
const CONFLICT_KEYS_FILE = process.env.CONFLICT_KEYS_FILE || path.join(__dirname, 'logs', 'conflict-keys.json');
const TABLES_DIR = process.env.RESULTS_DIR || path.join(__dirname, 'logs', 'tables');
const MIN_FAILURES = Number(process.env.MIN_CONFLICT_FAILURES || 1);

// Edit this array when you want to run this file directly with:
// node identify_conflict_keys.js
// Leave it empty to export conflict keys for all functions.
const DEFAULT_TARGET_FUNCTIONS = [
  'submitProduce',
  'testCoffee',
  'makeOffer',
  'acceptOffer',
  'packLotIntoPackets',
  'purchasePacket'
];

const RUN_SUMMARY_TABLES = !/^(0|false|no)$/i.test(process.env.RUN_SUMMARY_TABLES || 'true');
const RUN_EXCEL_EXPORT = /^(1|true|yes)$/i.test(process.env.RUN_EXCEL_EXPORT || '');
const RUN_CONFLICT_EXPERIMENTS = !/^(0|false|no)$/i.test(process.env.RUN_CONFLICT_EXPERIMENTS || 'true');
const CONTINUE_ON_EXPERIMENT_ERROR = !/^(0|false|no)$/i.test(process.env.CONTINUE_ON_EXPERIMENT_ERROR || 'true');
const INCLUDE_PREVIOUS_RUNS = /^(1|true|yes)$/i.test(process.env.INCLUDE_PREVIOUS_RUNS || '');
const REPLACE_FUNCTION_KEYS = !/^(0|false|no)$/i.test(process.env.REPLACE_FUNCTION_KEYS || 'true');
const DETECTION_TARGET_TPS = String(Number(process.env.DETECTION_TARGET_TPS || process.env.TARGET_TPS || 20));
const DETECTION_DURATION_SEC = String(Number(process.env.DETECTION_DURATION_SEC || process.env.DURATION_SEC || 20));
const DETECTION_WAIT_FOR_COMMIT = process.env.DETECTION_WAIT_FOR_COMMIT || process.env.WAIT_FOR_COMMIT || 'true';
const DETECTION_COMMIT_STRATEGY = process.env.DETECTION_COMMIT_STRATEGY || process.env.COMMIT_STRATEGY || 'MSPID_SCOPE_ANYFORTX';
const DETECTION_SHARED_KEY = process.env.DETECTION_SHARED_KEY || process.env.FORCE_SHARED_KEY || 'participant';
const DETECTION_SHARED_KEYS = parseFunctionList(process.env.DETECTION_SHARED_KEYS || '');

const DEFAULT_SHARED_KEYS_BY_FUNCTION = {
  submitProduce: ['farmer', 'aggregator'],
  testCoffee: ['lot'],
  makeOffer: ['lot', 'retailer'],
  acceptOffer: ['lot', 'retailer', 'farmer'],
  packLotIntoPackets: ['lot'],
  purchasePacket: ['packet', 'consumer', 'retailer']
};

const KNOWN_FUNCTIONS = new Set([
  'submitProduce',
  'testCoffee',
  'makeOffer',
  'acceptOffer',
  'packLotIntoPackets',
  'purchasePacket'
]);
const aliases = {
  submit: 'submitProduce',
  submitproduce: 'submitProduce',
  test: 'testCoffee',
  testcoffee: 'testCoffee',
  make: 'makeOffer',
  makeoffer: 'makeOffer',
  offer: 'makeOffer',
  accept: 'acceptOffer',
  acceptoffer: 'acceptOffer',
  pack: 'packLotIntoPackets',
  packlotintopackets: 'packLotIntoPackets',
  purchase: 'purchasePacket',
  purchasepacket: 'purchasePacket'
};

function normalizeFunctionName(value) {
  if (!value) return '';
  const key = String(value).replace(/[^a-zA-Z]/g, '').toLowerCase();
  return aliases[key] || (KNOWN_FUNCTIONS.has(value) ? value : '');
}

function parseFunctionList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFunctionList(values) {
  const functions = parseFunctionList(values)
    .map(normalizeFunctionName)
    .filter(Boolean);
  return [...new Set(functions)];
}

const rawFunctionFilter =
  process.env.TARGET_FUNCTIONS ||
  process.env.TARGET_FUNCTION ||
  process.env.FUNCTION_NAMES ||
  process.env.FUNCTION_NAME ||
  process.argv.slice(2).join(',') ||
  DEFAULT_TARGET_FUNCTIONS;

const FUNCTION_FILTERS = normalizeFunctionList(rawFunctionFilter);

if (parseFunctionList(rawFunctionFilter).length > 0 && FUNCTION_FILTERS.length === 0) {
  console.error('Unknown function filter.');
  console.error('Use one of: submitProduce, testCoffee, makeOffer, acceptOffer, packLotIntoPackets, purchasePacket');
  process.exit(1);
}

function scopedConflictKey(functionName, conflictKey) {
  return `${functionName}:${conflictKey}`;
}

function generalizeConflictKey(key = '') {
  if (key.startsWith('lot-')) return 'lot';
  if (key.startsWith('packet-')) return 'packet';
  const participant = key.match(/^participant:([^/]+)\/User\d+$/i);
  if (participant) return `participant:${participant[1]}`;
  return key;
}

function isTransientConflictKey(key = '') {
  return key.startsWith('lot-') || key.startsWith('packet-');
}

function isPersistableConflictKey(functionName, key = '') {
  return true;
}

function normalizeKey(propertyName, item) {
  if (item && item.functionName && item.conflictKey) {
    const conflictKey = generalizeConflictKey(item.conflictKey);
    return {
      scopedKey: scopedConflictKey(item.functionName, conflictKey),
      functionName: item.functionName,
      conflictKey
    };
  }

  const rawKey = item?.key || propertyName;
  const firstColon = rawKey.indexOf(':');
  const maybeFunction = firstColon > 0 ? rawKey.slice(0, firstColon) : '';
  if (KNOWN_FUNCTIONS.has(maybeFunction)) {
    const conflictKey = generalizeConflictKey(rawKey.slice(firstColon + 1));
    return {
      scopedKey: scopedConflictKey(maybeFunction, conflictKey),
      functionName: maybeFunction,
      conflictKey
    };
  }

  const conflictKey = generalizeConflictKey(rawKey);
  return {
    scopedKey: scopedConflictKey('submitProduce', conflictKey),
    functionName: 'submitProduce',
    conflictKey
  };
}

function addEvidence(target, evidence) {
  if (!evidence) return;
  target.evidence.push(evidence);
  if (target.evidence.length > 10) target.evidence.shift();
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeConflictKeyTables(keys) {
  fs.mkdirSync(TABLES_DIR, { recursive: true });
  const rows = Object.values(keys);
  const csvHeaders = ['functionName', 'conflictKey', 'key', 'failures', 'firstSeenAt', 'lastSeenAt'];
  const csvLines = [
    csvHeaders.join(','),
    ...rows.map((row) => csvHeaders.map((header) => csvEscape(row[header])).join(','))
  ];
  const csvPath = path.join(TABLES_DIR, 'conflict-keys-table.csv');
  fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`);

  const mdLines = [
    '# Learned Conflict Keys',
    '',
    '| Function | Conflict Key | Full Key | Failures |',
    '|---|---|---|---:|',
    ...rows.map((row) => `| ${row.functionName} | ${row.conflictKey} | ${row.key} | ${row.failures} |`)
  ];
  const mdPath = path.join(TABLES_DIR, 'conflict-keys-table.md');
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`);

  console.log(`Conflict key table saved: ${csvPath}`);
  console.log(`Conflict key markdown saved: ${mdPath}`);
}

function loadExistingConflictKeys() {
  if (!REPLACE_FUNCTION_KEYS || !fs.existsSync(CONFLICT_KEYS_FILE)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(CONFLICT_KEYS_FILE, 'utf8'));
    return data.learnedConflictKeys || {};
  } catch (_) {
    return {};
  }
}

function runFollowUpScript(label, scriptName, required = true) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    const message = `${label} script not found: ${scriptPath}`;
    if (required) throw new Error(message);
    console.warn(message);
    return false;
  }

  console.log('');
  console.log(`=== ${label} ===`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    const message = `${label} failed with exit code ${result.status}`;
    if (required) throw new Error(message);
    console.warn(message);
    return false;
  }

  return true;
}

function runConflictDetectionExperiments(functionNames) {
  if (!RUN_CONFLICT_EXPERIMENTS) return;

  console.log('');
  console.log('=== Running conflict-identification experiments ===');
  console.log(`Functions: ${functionNames.join(', ')}`);
  console.log(`Target TPS per function: ${DETECTION_TARGET_TPS}`);
  console.log(`Duration per function: ${DETECTION_DURATION_SEC}s`);
  console.log(`Wait for commit events: ${DETECTION_WAIT_FOR_COMMIT}`);
  console.log(`Shared key sweep: ${DETECTION_SHARED_KEYS.length ? DETECTION_SHARED_KEYS.join(', ') : 'default per function'}`);

  for (const functionName of functionNames) {
    const sharedKeys = DETECTION_SHARED_KEYS.length
      ? DETECTION_SHARED_KEYS
      : (DEFAULT_SHARED_KEYS_BY_FUNCTION[functionName] || [DETECTION_SHARED_KEY]);

    for (const sharedKey of sharedKeys) {
      console.log('');
      console.log(`--- Detecting conflicts for ${functionName} with shared ${sharedKey} ---`);
      const result = spawnSync(process.execPath, ['run_function_experiment.js'], {
        cwd: __dirname,
        env: {
          ...process.env,
          TARGET_FUNCTION: functionName,
          EXPERIMENT_MODE: 'detect',
          TARGET_TPS: DETECTION_TARGET_TPS,
          DURATION_SEC: DETECTION_DURATION_SEC,
          DETECTION_SHARED_KEY: sharedKey,
          WAIT_FOR_COMMIT: DETECTION_WAIT_FOR_COMMIT,
          COMMIT_STRATEGY: DETECTION_COMMIT_STRATEGY,
          VERIFY_COMMIT_BY_QUERY: process.env.VERIFY_COMMIT_BY_QUERY || 'false'
        },
        stdio: 'inherit',
        shell: false
      });

      if (result.status !== 0) {
        const message = `${functionName}/${sharedKey} detection failed with exit code ${result.status}`;
        if (!CONTINUE_ON_EXPERIMENT_ERROR) throw new Error(message);
        console.warn(`${message}; continuing to next experiment`);
      }
    }
  }
}

function main() {
  const currentRunStartedAt = new Date().toISOString();
  runConflictDetectionExperiments(FUNCTION_FILTERS.length ? FUNCTION_FILTERS : Array.from(KNOWN_FUNCTIONS));

  if (!fs.existsSync(RUN_HISTORY_FILE)) {
    throw new Error(`Run history not found: ${RUN_HISTORY_FILE}`);
  }

  const aggregated = {};
  const lines = fs.readFileSync(RUN_HISTORY_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (_) {
      continue;
      }

      if (RUN_CONFLICT_EXPERIMENTS && !INCLUDE_PREVIOUS_RUNS && record.timestamp && record.timestamp < currentRunStartedAt) {
        continue;
      }

    const learned = record.observation?.onlineLearning?.learnedConflictKeys || {};
    for (const [propertyName, item] of Object.entries(learned)) {
      const normalized = normalizeKey(propertyName, item);
      if (FUNCTION_FILTERS.length && !FUNCTION_FILTERS.includes(normalized.functionName)) continue;
      if (!isPersistableConflictKey(normalized.functionName, normalized.conflictKey)) continue;

      aggregated[normalized.scopedKey] ||= {
        key: normalized.scopedKey,
        functionName: normalized.functionName,
        conflictKey: normalized.conflictKey,
        failures: 0,
        firstSeenAt: item.learnedAt || record.timestamp,
        lastSeenAt: item.lastSeenAt || record.timestamp,
        evidence: []
      };

      const target = aggregated[normalized.scopedKey];
      target.failures += Number(item.failures || 0);
      target.lastSeenAt = item.lastSeenAt || record.timestamp || target.lastSeenAt;
      (item.evidence || []).forEach((evidence) => addEvidence(target, evidence));
    }
  }

  const newlyFiltered = Object.fromEntries(
    Object.entries(aggregated)
      .filter(([, item]) => item.failures >= MIN_FAILURES)
      .sort((a, b) => b[1].failures - a[1].failures)
  );

  const selectedFunctions = new Set(FUNCTION_FILTERS.length ? FUNCTION_FILTERS : Array.from(KNOWN_FUNCTIONS));
  const existing = loadExistingConflictKeys();
  const merged = {};
  for (const [key, item] of Object.entries(existing)) {
    const normalized = normalizeKey(key, item);
    if (selectedFunctions.has(normalized.functionName)) continue;
    merged[normalized.scopedKey] = {
      ...item,
      key: normalized.scopedKey,
      functionName: normalized.functionName,
      conflictKey: normalized.conflictKey
    };
  }
  const filtered = {
    ...merged,
    ...newlyFiltered
  };

  const output = {
    generatedAt: new Date().toISOString(),
    source: RUN_HISTORY_FILE,
    minFailures: MIN_FAILURES,
    functionFilters: FUNCTION_FILTERS.length ? FUNCTION_FILTERS : null,
    replaceFunctionKeys: REPLACE_FUNCTION_KEYS,
    learnedConflictKeys: filtered
  };

  fs.mkdirSync(path.dirname(CONFLICT_KEYS_FILE), { recursive: true });
  fs.writeFileSync(CONFLICT_KEYS_FILE, JSON.stringify(output, null, 2));
  writeConflictKeyTables(filtered);

  console.log(`Conflict keys saved: ${CONFLICT_KEYS_FILE}`);
  console.log(`Function filters: ${FUNCTION_FILTERS.length ? FUNCTION_FILTERS.join(', ') : 'all'}`);
  console.log(`History scope: ${RUN_CONFLICT_EXPERIMENTS && !INCLUDE_PREVIOUS_RUNS ? 'current identify_conflict_keys.js run only' : 'all history'}`);
  console.log(`Keys: ${Object.keys(filtered).length}`);
  for (const item of Object.values(filtered).slice(0, 20)) {
    console.log(`  ${item.key.padEnd(45)} failures=${item.failures}`);
  }

  if (RUN_SUMMARY_TABLES) {
    runFollowUpScript('Updating result tables', 'summarize_experiment_results.js', true);
  }

  if (RUN_EXCEL_EXPORT) {
    runFollowUpScript('Updating Excel workbook', 'export_results_excel.mjs', false);
  }
}

main();
