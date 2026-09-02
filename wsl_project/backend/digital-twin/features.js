'use strict';

const FUNCTION_COMPLEXITY = {
  submitProduce: { ledgerWrites: 3, reads: 3, payloadBytes: 160 },
  testCoffee: { ledgerWrites: 1, reads: 1, payloadBytes: 260 },
  makeOffer: { ledgerWrites: 1, reads: 1, payloadBytes: 110 },
  acceptOffer: { ledgerWrites: 3, reads: 3, payloadBytes: 100 },
  packLotIntoPackets: { ledgerWrites: 10, reads: 1, payloadBytes: 160 },
  purchasePacket: { ledgerWrites: 3, reads: 3, payloadBytes: 90 }
};

function currentTps(metrics) {
  const elapsed = Math.max((Date.now() - metrics.startedAt) / 1000, 0.1);
  return metrics.totalTx / elapsed;
}

function stakeholderLoad(metrics, stakeholder) {
  if (!stakeholder) return 0;
  const key = `${stakeholder.org}/${stakeholder.userId}`;
  const stats = metrics.perStakeholder[key] || { success: 0, failure: 0 };
  return stats.success + stats.failure;
}

function buildFeatures(tx, metrics, config = {}) {
  const complexity = FUNCTION_COMPLEXITY[tx.type] || { ledgerWrites: 1, reads: 1, payloadBytes: 128 };
  const targetTps = Number(tx.targetTps || 0);
  const liveTps = currentTps(metrics);
  const latency = Number(tx.latencyMs ?? config.defaultLatencyMs ?? 0);

  return {
    functionName: tx.type,
    transactionType: tx.type,
    load: Number((targetTps || liveTps || 1).toFixed(4)),
    currentTps: Number(liveTps.toFixed(4)),
    numCaliperWorkers: Number(config.defaultCaliperWorkers || 1),
    hotParticipants: Number(tx.hotParticipants || stakeholderLoad(metrics, tx.stakeholder) || 1),
    latency,
    ledgerWrites: Number(tx.ledgerWrites || complexity.ledgerWrites),
    reads: Number(tx.reads || complexity.reads),
    payloadBytes: Number(tx.payloadBytes || complexity.payloadBytes),
    inFlight: Number(metrics.inFlight || 0),
    assetId: tx.assetId || ''
  };
}

module.exports = {
  FUNCTION_COMPLEXITY,
  buildFeatures,
  currentTps
};
