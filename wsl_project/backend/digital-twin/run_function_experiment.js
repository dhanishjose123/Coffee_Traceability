'use strict';

// Edit these two values when you want to run this file directly with:
// node run_function_experiment.js
const DEFAULT_TARGET_FUNCTION = 'makeOffer';
const DEFAULT_EXPERIMENT_MODE = 'detect';

function forceSetting(name, value) {
  process.env[name] = value;
}

function setDefault(name, value) {
  if (process.env[name] === undefined) process.env[name] = value;
}

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

const tpsVars = {
  submitProduce: 'SUBMIT_TPS',
  testCoffee: 'TEST_TPS',
  makeOffer: 'MAKE_OFFER_TPS',
  acceptOffer: 'ACCEPT_TPS',
  packLotIntoPackets: 'PACK_TPS',
  purchasePacket: 'PURCHASE_TPS'
};

const setupChains = {
  submitProduce: [],
  testCoffee: ['submitProduce'],
  makeOffer: ['submitProduce', 'testCoffee'],
  acceptOffer: ['submitProduce', 'testCoffee', 'makeOffer'],
  packLotIntoPackets: ['submitProduce', 'testCoffee', 'makeOffer', 'acceptOffer'],
  purchasePacket: ['submitProduce', 'testCoffee', 'makeOffer', 'acceptOffer', 'packLotIntoPackets']
};

function normalizeFunctionName(value) {
  const key = String(value || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  return aliases[key] || null;
}

const targetFunction = normalizeFunctionName(process.env.TARGET_FUNCTION || process.argv[2] || DEFAULT_TARGET_FUNCTION);
if (!targetFunction) {
  console.error('Unknown TARGET_FUNCTION.');
  console.error('Use one of: submitProduce, testCoffee, makeOffer, acceptOffer, packLotIntoPackets, purchasePacket');
  process.exit(1);
}

const mode = String(process.env.EXPERIMENT_MODE || process.argv[3] || DEFAULT_EXPERIMENT_MODE).toLowerCase();
if (!['detect', 'queue', 'baseline', 'noqueue', 'normal'].includes(mode)) {
  console.error('Unknown EXPERIMENT_MODE. Use detect, queue, baseline, noqueue, or normal.');
  process.exit(1);
}
const isQueueMode = mode === 'queue';
const isDetectMode = mode === 'detect';
const normalizedMode = ['noqueue', 'normal'].includes(mode) ? 'baseline' : mode;

const setupTps = String(Number(process.env.SETUP_TPS || 5));
const targetTps = String(Number(process.env.TARGET_TPS || 20));
const defaultUseExistingAssets = isDetectMode;
const useExistingAssets = /^(1|true|yes)$/i.test(
  process.env.USE_EXISTING_ASSETS === undefined
    ? (defaultUseExistingAssets ? 'true' : 'false')
    : process.env.USE_EXISTING_ASSETS
);

for (const envName of Object.values(tpsVars)) {
  forceSetting(envName, '0');
}

for (const setupFunction of useExistingAssets ? [] : setupChains[targetFunction]) {
  forceSetting(tpsVars[setupFunction], setupTps);
}
forceSetting(tpsVars[targetFunction], targetTps);

forceSetting('ENABLE_RL_SCHEDULER', 'false');
forceSetting('ENABLE_WALLET_QUEUE', isQueueMode ? 'true' : 'false');
forceSetting('LOAD_LEARNED_CONFLICT_KEYS', isQueueMode ? 'true' : 'false');
forceSetting('ENABLE_CONFLICT_KEY_LEARNING', isDetectMode ? 'true' : 'false');
forceSetting('PAIRWISE_DETECTION', isDetectMode ? 'true' : 'false');
forceSetting('FORCE_SHARED_CONFLICT_KEYS', isDetectMode ? 'true' : 'false');
forceSetting('USE_EXISTING_ASSETS', useExistingAssets ? 'true' : 'false');
setDefault('ENABLE_LEARNED_MVCC_QUEUE', 'true');
setDefault('DURATION_SEC', '20');
setDefault('MAX_IN_FLIGHT', isDetectMode ? '2' : '100');
setDefault('CAPACITY_WAIT_MS', isDetectMode ? '120000' : '2000');
setDefault('MAX_DRAIN_SEC', '90');
setDefault('COMMIT_VERIFY_TIMEOUT_MS', '60000');
setDefault('VERIFY_COMMIT_BY_QUERY', 'false');
forceSetting('SIMULATION_MODE', `${targetFunction}-${normalizedMode}`);

console.log(`Starting ${normalizedMode} experiment for ${targetFunction}.`);
console.log(`Target TPS: ${targetTps}`);
console.log(`Existing assets: ${useExistingAssets ? 'enabled' : 'disabled'}`);
console.log(`Setup TPS per prerequisite function: ${useExistingAssets ? '0 (existing ledger assets are used)' : setupTps}`);
console.log(`Queue mode: ${isQueueMode ? 'enabled' : 'disabled'}`);
console.log(`Pairwise detection: ${isDetectMode ? 'enabled, two transactions per batch' : 'disabled'}`);
console.log(`Force shared conflict keys: ${isDetectMode ? 'enabled' : 'disabled'}`);

require('./run_simulation');
