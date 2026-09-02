'use strict';

function setDefault(name, value) {
  if (process.env[name] === undefined) process.env[name] = value;
}

setDefault('SIMULATION_MODE', 'conflict-key-detection');
setDefault('ENABLE_RL_SCHEDULER', 'false');
setDefault('ENABLE_WALLET_QUEUE', 'false');
setDefault('LOAD_LEARNED_CONFLICT_KEYS', 'false');
setDefault('ENABLE_CONFLICT_KEY_LEARNING', 'true');
setDefault('PAIRWISE_DETECTION', 'true');
setDefault('SUBMIT_TPS', '100');
setDefault('TEST_TPS', '0');
setDefault('MAKE_OFFER_TPS', '0');
setDefault('ACCEPT_TPS', '0');
setDefault('PACK_TPS', '0');
setDefault('PURCHASE_TPS', '0');
setDefault('DURATION_SEC', '20');
setDefault('MAX_IN_FLIGHT', '2');
setDefault('CAPACITY_WAIT_MS', '120000');
setDefault('MAX_DRAIN_SEC', '30');
setDefault('COMMIT_VERIFY_TIMEOUT_MS', '20000');

console.log('Starting conflict-key detection simulator...');
require('./run_simulation');
