'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function staggerInitialLoad(workerIndex, label) {
    const staggerMs = Number(process.env.LOAD_STAGGER_MS || process.env.INIT_LOAD_STAGGER_MS || 250);
    const delayMs = Math.max(0, workerIndex * staggerMs);

    if (delayMs > 0) {
        console.log(`[INIT][Worker ${workerIndex}] ${label} load stagger ${delayMs}ms`);
        await sleep(delayMs);
    }

    return delayMs;
}

class PurchasePacketWorkload extends WorkloadModuleBase {

    constructor() {
        super();

        // 📦 Cached AVAILABLE packets
        this.availablePackets = [];
        this.packetsLoaded = 0;
        this.partitionExhausted = false;

        // 🔒 Prevent repeat attempts. Claims prevent different workers from
        // competing for the same packet.
        this.usedPacketIds = new Set();
        this.claimDir = path.resolve(__dirname, '../tmp/purchase-claims');

        // 📊 Counters
        this.txAttempted = 0;
        this.txSucceeded = 0;
        this.txMVCCFailed = 0;
        this.txOtherFailed = 0;

        this._lastRoundIndex = -1;

        // 📏 Payload tracking
        this.txIndex = 0;
        this.payloadFile = './payload_sizes.csv';

        if (!fs.existsSync(this.payloadFile)) {
            fs.writeFileSync(this.payloadFile, 'function,payload_bytes,payload_kb\n');
        }

        if (!fs.existsSync(this.claimDir)) {
            fs.mkdirSync(this.claimDir, { recursive: true });
        }
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter) {

        this.workerIndex = workerIndex;
        this.totalWorkers = totalWorkers;
        this.roundIndex = roundIndex;
        this.roundArguments = roundArguments;
        this.sutAdapter = sutAdapter;
        this.contractId = roundArguments.contractId;
        this.partitionExhausted = false;
        this.consumerCount = Math.max(1, Number(roundArguments.consumerCount) || totalWorkers || 1);
        this.retailerCount = Math.max(0, Number(roundArguments.retailerCount) || 0);
        const requestedLimit = Number(roundArguments.packetQueryLimit || roundArguments.limit);
        this.packetQueryLimit = String(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20);

        const consumerIndex = (workerIndex % this.consumerCount) + 1;
        this.userId = `User${consumerIndex}`;

        console.log(
            `✅ Worker ${this.workerIndex}: Initialized consumer ${this.userId}, consumerCount=${this.consumerCount}, retailerOwnerRange=${this.retailerCount > 0 ? `User1..User${this.retailerCount}` : 'all'}`
        );
        const loadStartedAt = Date.now();
        const staggerDelayMs = await staggerInitialLoad(workerIndex, 'purchase');
        const queryStartedAt = Date.now();

        /* ---------------------------------
           🔹 INITIAL QUERY
        ---------------------------------- */
        const queryTx = this.createAvailablePacketQuery();

        try {

            const res = 
        const scheduler = require('./twin-scheduler.js');
        const features = { load: 50, numCaliperWorkers: 10, hotParticipants: 1, ledgerWrites: 2, reads: 1, payloadBytes: 200, latency: 0.5 };
        const conflictKey = 	x:; // Generic conflict key for now
        await scheduler.submit(conflictKey, features, () => this.sutAdapter.sendRequests(
queryTx);

            if (!res?.status?.result) {
                console.log(
                    `[INIT][Worker ${this.workerIndex}] ❌ No packets returned`
                );
                return;
            }

            const allPackets = JSON.parse(res.status.result.toString());

            this.availablePackets = this.partitionPackets(
                (Array.isArray(allPackets) ? allPackets : (allPackets.data || []))
                    .filter(p => p.status === 'AVAILABLE')
                    .filter(p => this.isAllowedRetailerOwner(p.owner))
            );
            this.packetsLoaded = this.availablePackets.length;

            console.log(
                `[INIT][Worker ${this.workerIndex}] 📦 Cached ${this.availablePackets.length} AVAILABLE packets`
            );
            console.log(`[LOAD_TIME][purchase][Worker ${this.workerIndex}] staggerMs=${staggerDelayMs} queryMs=${Date.now() - queryStartedAt} totalMs=${Date.now() - loadStartedAt} packets=${this.availablePackets.length}`);

        } catch (err) {
            console.error(
                `[INIT][Worker ${this.workerIndex}] ❌ Failed to load packets`,
                err.message || err
            );
            console.log(`[LOAD_TIME][purchase][Worker ${this.workerIndex}] staggerMs=${staggerDelayMs} queryMs=${Date.now() - queryStartedAt} totalMs=${Date.now() - loadStartedAt} packets=0 failed=true`);
        }
    }

    async submitTransaction() {

        /* ---------------------------------
           📊 Round logging
        ---------------------------------- */
        if (this.roundIndex !== this._lastRoundIndex) {
            this._lastRoundIndex = this.roundIndex;

            console.log(
                `📊 [PurchasePacket][Worker ${this.workerIndex}] ` +
                `Attempts=${this.txAttempted}, Success=${this.txSucceeded}, ` +
                `MVCC=${this.txMVCCFailed}, OtherFail=${this.txOtherFailed}`
            );
        }

        /* ---------------------------------
           1️⃣ Pick from cached batch, then verify availability
        ---------------------------------- */
        const packet = await this.pickPacketFromBatch();

        if (!packet || !packet.packetId) {
            return;
        }

        const packetId = packet.packetId;

        this.usedPacketIds.add(packetId);
        this.availablePackets = this.availablePackets.filter(candidate => candidate.packetId !== packetId);

        /* ---------------------------------
           2️⃣ Prepare transaction
        ---------------------------------- */
        const args = [
            packetId,
            this.userId
        ];

        const purchaseTx = {
            contractId: this.contractId,
            contractFunction: 'purchasePacket',
            invokerIdentity: this.userId,
            contractArguments: args,
            readOnly: false
        };

        /* ---------------------------------
           📏 PAYLOAD MEASUREMENT
        ---------------------------------- */
        const payloadString = JSON.stringify(args);
        const payloadBytes = Buffer.byteLength(payloadString, 'utf8');
        const payloadKB = payloadBytes / 1024;

        if (this.txIndex < 50) {
            fs.appendFileSync(
                this.payloadFile,
                `purchasePacket,${payloadBytes},${payloadKB.toFixed(4)}\n`
            );
        }

        this.txIndex++;

        /* ---------------------------------
           🚀 Execute transaction
        ---------------------------------- */
        this.txAttempted++;

        try {

            
        const scheduler = require('./twin-scheduler.js');
        const features = { load: 50, numCaliperWorkers: 10, hotParticipants: 1, ledgerWrites: 2, reads: 1, payloadBytes: 200, latency: 0.5 };
        const conflictKey = 	x:; // Generic conflict key for now
        await scheduler.submit(conflictKey, features, () => this.sutAdapter.sendRequests(
purchaseTx);

            this.txSucceeded++;

        } catch (err) {

            const msg = err?.message || '';

            if (
                msg.includes('MVCC') ||
                msg.includes('PHANTOM') ||
                msg.includes('CONFLICT')
            ) {
                this.txMVCCFailed++;
            } else {
                this.txOtherFailed++;
            }
        }

        /* ---------------------------------
           📊 Periodic stats
        ---------------------------------- */
        if (this.txAttempted % 10 === 0) {

            console.log(
                `📊 [PurchasePacket][Worker ${this.workerIndex}] ` +
                `Attempts=${this.txAttempted}, Success=${this.txSucceeded}, ` +
                `MVCC=${this.txMVCCFailed}, OtherFail=${this.txOtherFailed}`
            );
        }
    }

    async pickPacketFromBatch() {
        while (this.availablePackets.length > 0) {
            const candidate = this.availablePackets.shift();

            if (
                candidate?.status === 'AVAILABLE' &&
                candidate.packetId &&
                !this.usedPacketIds.has(candidate.packetId) &&
                this.claimPacket(candidate.packetId)
            ) {
                return candidate;
            }
        }

        this.partitionExhausted = true;
        return null;
    }

    partitionPackets(packets) {
        return packets.filter((packet, index) =>
            packet?.packetId &&
            packet.status === 'AVAILABLE' &&
            this.isAllowedRetailerOwner(packet.owner) &&
            !this.usedPacketIds.has(packet.packetId) &&
            (index % this.totalWorkers) === this.workerIndex
        );
    }

    isAllowedRetailerOwner(ownerId) {
        if (this.retailerCount <= 0) {
            return true;
        }

        const match = String(ownerId || '').match(/^User(\d+)$/i);
        return Boolean(match) && Number(match[1]) >= 1 && Number(match[1]) <= this.retailerCount;
    }

    claimPacket(packetId) {
        const safePacketId = String(packetId).replace(/[^a-zA-Z0-9_.-]/g, '_');
        const claimPath = path.join(this.claimDir, `round-${this.roundIndex}-${safePacketId}.claim`);

        try {
            const fd = fs.openSync(claimPath, 'wx');
            fs.writeFileSync(fd, `worker=${this.workerIndex}\ntime=${new Date().toISOString()}\npacketId=${packetId}\n`);
            fs.closeSync(fd);
            return true;
        } catch (error) {
            if (error.code === 'EEXIST') {
                return false;
            }
            throw error;
        }
    }

    async refreshAvailablePackets() {
        const queryTx = this.createAvailablePacketQuery();

        try {
            const res = 
        const scheduler = require('./twin-scheduler.js');
        const features = { load: 50, numCaliperWorkers: 10, hotParticipants: 1, ledgerWrites: 2, reads: 1, payloadBytes: 200, latency: 0.5 };
        const conflictKey = 	x:; // Generic conflict key for now
        await scheduler.submit(conflictKey, features, () => this.sutAdapter.sendRequests(
queryTx);
            if (!res?.status?.result) {
                this.availablePackets = [];
                return;
            }

            const packets = JSON.parse(res.status.result.toString());
            this.availablePackets = this.partitionPackets(
                (Array.isArray(packets) ? packets : (packets.data || []))
                    .filter(packet => packet.status === 'AVAILABLE')
            );
            this.partitionExhausted = this.availablePackets.length === 0;

        } catch (err) {
            console.error(`[QUERY][Worker ${this.workerIndex}] Failed to refresh available packets`, err.message || err);
            this.availablePackets = [];
            this.partitionExhausted = true;
        }
    }

    async isPacketStillAvailable(packetId) {
        const queryTx = this.createAvailablePacketQuery();

        try {
            const res = 
        const scheduler = require('./twin-scheduler.js');
        const features = { load: 50, numCaliperWorkers: 10, hotParticipants: 1, ledgerWrites: 2, reads: 1, payloadBytes: 200, latency: 0.5 };
        const conflictKey = 	x:; // Generic conflict key for now
        await scheduler.submit(conflictKey, features, () => this.sutAdapter.sendRequests(
queryTx);
            if (!res?.status?.result) {
                return false;
            }

            const packets = JSON.parse(res.status.result.toString());
            const availablePackets = Array.isArray(packets) ? packets : (packets.data || []);
            return availablePackets.some(packet => packet.packetId === packetId && packet.status === 'AVAILABLE');
        } catch (err) {
            console.error(`[CHECK][Worker ${this.workerIndex}] Failed to check packet ${packetId}`, err.message || err);
            return false;
        }
    }

    createAvailablePacketQuery() {
        if (this.retailerCount > 0) {
            return {
                contractId: this.contractId,
                contractFunction: 'getAllPacketsByRetailerRange',
                contractArguments: ['User1', `User${this.retailerCount}`, 'AVAILABLE', this.packetQueryLimit],
                readOnly: true
            };
        }

        return {
            contractId: this.contractId,
            contractFunction: 'getAllPackets',
            contractArguments: ['AVAILABLE', this.packetQueryLimit],
            readOnly: true
        };
    }

    async cleanupWorkloadModule() {
        const dummy = this.dummyTxCount || 0;
        const total = this.txAttempted || this.txCounter || this.txIndex || this.txSucceeded || 0;
        const dummyRatio = total > 0 ? ((dummy / total) * 100).toFixed(2) : '0.00';

        console.log(`
==============================
📊 Worker ${this.workerIndex} Dummy Summary
------------------------------
Dummy TX           : ${dummy}
Dummy Ratio        : ${dummyRatio}%
Packets Loaded     : ${this.packetsLoaded}
==============================
`);
    }

}

module.exports.createWorkloadModule = () => new PurchasePacketWorkload();
