'use strict';

const http = require('http');
const https = require('https');

function setDefault(name, value) {
  if (process.env[name] === undefined) process.env[name] = value;
}

setDefault('SIMULATION_MODE', 'rl-scheduler');
setDefault('ENABLE_RL_SCHEDULER', 'true');
setDefault('ENABLE_WALLET_QUEUE', 'true');
setDefault('LOAD_LEARNED_CONFLICT_KEYS', 'true');
setDefault('ENABLE_CONFLICT_KEY_LEARNING', 'false');
setDefault('SUBMIT_TPS', '10');
setDefault('TEST_TPS', '0');
setDefault('MAKE_OFFER_TPS', '0');
setDefault('ACCEPT_TPS', '0');
setDefault('PACK_TPS', '0');
setDefault('PURCHASE_TPS', '0');
setDefault('DURATION_SEC', '20');
setDefault('MAX_IN_FLIGHT', '100');
setDefault('MAX_DRAIN_SEC', '60');
setDefault('COMMIT_VERIFY_TIMEOUT_MS', '20000');
setDefault('RL_EPSILON', '0.35');
setDefault('RL_TIMEOUT_MS', '5000');

console.log('Starting RL scheduling simulator...');

function getJson(url) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      timeout: Number(process.env.RL_TIMEOUT_MS || 1500)
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('RL health check timed out'));
    });
    request.on('error', reject);
  });
}

async function requireRlServer() {
  const url = process.env.RL_AGENT_URL || 'http://127.0.0.1:5060';
  try {
    const health = await getJson(`${url}/health`);
    console.log(`RL server ready: ${url} | states=${health.states} | epsilon=${health.epsilon}`);
  } catch (error) {
    console.error(`RL server is not available at ${url}.`);
    console.error('Start it first: cd ~/fabric_2/backend/digital_twin_RL && python3 rl_environment.py');
    console.error(`Details: ${error.message}`);
    process.exit(1);
  }
}

requireRlServer().then(() => require('./run_simulation'));
