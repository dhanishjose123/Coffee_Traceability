'use strict';

const { spawnSync } = require('child_process');

function setDefault(name, value) {
  if (process.env[name] === undefined) process.env[name] = value;
}

function forceSetting(name, value) {
  process.env[name] = value;
}

// Edit this list when running this file directly with:
// node run_queued_simulation.js
const DEFAULT_TARGET_FUNCTIONS = [
  // 'submitProduce',
  // 'testCoffee',
  // 'makeOffer',
  // 'acceptOffer',
  // 'packLotIntoPackets',
  'purchasePacket'
];

// Edit this list to run the same queued simulation at multiple target TPS values.
// You can also override it from the shell:
// TPS_VALUES=50,100,200 node run_queued_simulation.js
const DEFAULT_TPS_VALUES = [200];

// Edit this value to run a fixed number of transactions for each TPS value.
// Set to 0 to use DURATION_SEC instead.
// You can also override it from the shell:
// TARGET_TX_COUNT=100 node run_queued_simulation.js
const DEFAULT_TARGET_TX_COUNT = 500;

const tpsVars = {
  submitProduce: 'SUBMIT_TPS',
  testCoffee: 'TEST_TPS',
  makeOffer: 'MAKE_OFFER_TPS',
  acceptOffer: 'ACCEPT_TPS',
  packLotIntoPackets: 'PACK_TPS',
  purchasePacket: 'PURCHASE_TPS'
};

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
  const key = String(value || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  return aliases[key] || (tpsVars[value] ? value : '');
}

function parseFunctionList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedFunctions() {
  const raw = process.env.TARGET_FUNCTIONS || process.env.TARGET_FUNCTION || process.argv.slice(2).join(',') || DEFAULT_TARGET_FUNCTIONS;
  const selected = parseFunctionList(raw)
    .map(normalizeFunctionName)
    .filter(Boolean);
  return [...new Set(selected)];
}

function selectedTpsValues() {
  const raw = process.env.TPS_VALUES || process.env.TARGET_TPS || DEFAULT_TPS_VALUES;
  const values = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((item) => Number(String(item).trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(values)];
}

function selectedTargetTxCount() {
  const value = Number(process.env.TARGET_TX_COUNT || process.env.NUM_TRANSACTIONS || DEFAULT_TARGET_TX_COUNT);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

if (process.env.RUN_QUEUED_SINGLE !== 'true') {
  const tpsValues = selectedTpsValues();
  const functions = selectedFunctions();
  const targetTxCount = selectedTargetTxCount();
  console.log('Starting queued function-by-function TPS sweep...');
  console.log(`Target functions: ${functions.join(', ') || 'none'}`);
  console.log(`TPS values: ${tpsValues.join(', ')}`);
  console.log(`Target transactions per TPS: ${targetTxCount || 'duration-based'}`);

  for (const functionName of functions) {
    console.log(`\n######## Function: ${functionName} ########`);
    for (const tps of tpsValues) {
      console.log(`\n=== Queued simulation for ${functionName} at ${tps} TPS ===`);
      const result = spawnSync(process.execPath, [__filename], {
        cwd: __dirname,
        env: {
          ...process.env,
          RUN_QUEUED_SINGLE: 'true',
          TARGET_TPS: String(tps),
          TARGET_FUNCTIONS: functionName,
          TARGET_TX_COUNT: String(targetTxCount)
        },
        stdio: 'inherit'
      });
      if (result.status !== 0) {
        process.exit(result.status || 1);
      }
    }
  }

  console.log('\nQueued function-by-function TPS sweep completed.');
  process.exit(0);
}

setDefault('SIMULATION_MODE', 'deterministic-conflict-key-queue');
forceSetting('ENABLE_RL_SCHEDULER', 'false');
forceSetting('ENABLE_WALLET_QUEUE', 'true');
forceSetting('LOAD_LEARNED_CONFLICT_KEYS', 'true');
forceSetting('ENABLE_LEARNED_MVCC_QUEUE', 'true');
forceSetting('ENABLE_CONFLICT_KEY_LEARNING', 'false');
forceSetting('UPDATE_TABLES_AFTER_RUN', 'true');
forceSetting('FUNCTION_LEVEL_QUEUE_FUNCTIONS', '');
forceSetting('ENABLE_BACKPRESSURE_SKIP', 'true');
forceSetting('MAKE_OFFER_SAME_LOT', 'true');
setDefault('USE_EXISTING_ASSETS', 'true');
const targetTps = String(Number(process.env.TARGET_TPS || 50));
const functions = selectedFunctions();
for (const envName of Object.values(tpsVars)) {
  forceSetting(envName, '0');
}
for (const functionName of functions) {
  forceSetting(tpsVars[functionName], targetTps);
}
setDefault('DURATION_SEC', '20');
setDefault('MAX_IN_FLIGHT', '100');
setDefault('MAX_DRAIN_SEC', '0');
setDefault('NO_WORK_TIMEOUT_SEC', '0');
setDefault('COMMIT_VERIFY_TIMEOUT_MS', '60000');
forceSetting('VERIFY_COMMIT_BY_QUERY', 'false');
forceSetting('WAIT_FOR_COMMIT', 'true');
setDefault('COMMIT_STRATEGY', 'MSPID_SCOPE_ANYFORTX');
setDefault('COMMIT_TIMEOUT_SEC', '60');

console.log('Starting deterministic conflict-key queued simulator...');
console.log(`Target functions: ${functions.join(', ') || 'none'}`);
console.log(`Target TPS per function: ${targetTps}`);
console.log(`Target transactions: ${process.env.TARGET_TX_COUNT || process.env.NUM_TRANSACTIONS || 'duration-based'}`);
console.log('Completion mode: strict fixed count, wait until all started transactions finish');
console.log('makeOffer lot selection: same approved lot');
console.log(`Existing ledger assets: ${process.env.USE_EXISTING_ASSETS}`);
require('./run_simulation');
