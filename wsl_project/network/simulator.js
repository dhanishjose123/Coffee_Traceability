// simulator.js – live‑monitor version
// Run with Node.js inside the WSL workspace (fabric_2)
//   NUM_CONSUMERS=5 NUM_RETAILERS=5 TX_PER_SECOND=20 DURATION_SEC=60 node simulator.js

'use strict';
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs   = require('fs');

// ────── CONFIG ────────────────────────────────────────────────────────
const CHANNEL_NAME       = 'agrichannel';
const CHAINCODE_NAME     = 'supplychain';
const CONNECTION_PROFILE = path.resolve(__dirname, 'fabric-samples/test-network/organizations/peerOrganizations/farmers.example.com/connection-farmers.json');

const NUM_CONSUMERS = Number(process.env.NUM_CONSUMERS || 5);
const NUM_RETAILERS = Number(process.env.NUM_RETAILERS || 5);
const TX_PER_SECOND = Number(process.env.TX_PER_SECOND || 20);
const DURATION_SEC  = Number(process.env.DURATION_SEC  || 30);

// ────── METRICS (live) ───────────────────────────────────────────────
const metrics = {
    startedAt: Date.now(),
    totalTx:   0,
    successTx: 0,
    failureTx: 0,
    // per‑user breakdown (optional, can grow large if many users)
    perUser:   {},
};

function incSuccess(user) {
    metrics.totalTx++; metrics.successTx++;
    metrics.perUser[user] = (metrics.perUser[user] || {success:0, failure:0});
    metrics.perUser[user].success++;
}
function incFailure(user) {
    metrics.totalTx++; metrics.failureTx++;
    metrics.perUser[user] = (metrics.perUser[user] || {success:0, failure:0});
    metrics.perUser[user].failure++;
}

function printLiveStats() {
    const elapsed = ((Date.now() - metrics.startedAt) / 1000).toFixed(1);
    const tps = (metrics.totalTx / elapsed).toFixed(2);
    console.clear();
    console.log('=== Live Supply‑Chain Simulator ===');
    console.log(`🕒 Elapsed: ${elapsed}s | 🎯 Target TPS: ${TX_PER_SECOND} | 📈 Current TPS: ${tps}`);
    console.log(`👥 Users: ${NUM_CONSUMERS + NUM_RETAILERS}`);
    console.log(`✅ Successful Tx: ${metrics.successTx}`);
    console.log(`❌ Failed Tx:     ${metrics.failureTx}`);
    console.log('---');
    // Show top‑3 users with most failures (helpful for debugging)
    const sorted = Object.entries(metrics.perUser)
        .sort((a,b)=> (b[1].failure||0) - (a[1].failure||0))
        .slice(0,3);
    if (sorted.length) {
        console.log('Top failure contributors:');
        for (const [usr,st] of sorted) {
            console.log(`  ${usr}: ${st.failure} failures / ${st.success} successes`);
        }
    }
    console.log('\nPress Ctrl+C to stop the simulator.');
}

// Refresh the live view every second
const liveTimer = setInterval(printLiveStats, 1000);

// ────── HELPERS ───────────────────────────────────────────────────────
function randomInt(max) { return Math.floor(Math.random() * max) + 1; }

function loadIdentity(walletPath) {
    const certFile = fs.readdirSync(path.join(walletPath, 'signcerts'))[0];
    const keyFile  = fs.readdirSync(path.join(walletPath, 'keystore'))[0];
    const identity = {
        credentials: {
            certificate: fs.readFileSync(path.join(walletPath, 'signcerts', certFile)).toString(),
            privateKey:   fs.readFileSync(path.join(walletPath, 'keystore', keyFile)).toString(),
        },
        mspId: path.basename(walletPath).startsWith('farmer') ? 'FarmersMSP' : 'RetailersMSP',
        type: 'X.509',
    };
    return identity;
}

// ────── USER CLASS ─────────────────────────────────────────────────────
class SimUser {
    constructor(name, walletPath) {
        this.name = name;
        this.walletPath = walletPath;
        this.gateway = new Gateway();
    }
    async init() {
        const wallet = await Wallets.newInMemoryWallet();
        await wallet.put(this.name, loadIdentity(this.walletPath));
        const connectionProfile = JSON.parse(fs.readFileSync(CONNECTION_PROFILE, 'utf8'));
        await this.gateway.connect(connectionProfile, {
            wallet,
            identity: this.name,
            discovery: { enabled: true, asLocalhost: true },
        });
        this.network  = await this.gateway.getNetwork(CHANNEL_NAME);
        this.contract = this.network.getContract(CHAINCODE_NAME);
    }
    async shutdown() { await this.gateway.disconnect(); }

    // Random transaction generator (customisable)
    async submitRandomTx() {
        const r = randomInt(100);
        try {
            if (r <= 40) { // submitProduce
                const lotId = `LOT${Date.now()}${randomInt(1000)}`;
                const args = [lotId, this.name, '10', '2025-12-31', '1', 'Aggregator1'];
                await this.contract.submitTransaction('submitProduce', ...args);
            } else if (r <= 70) { // makeOffer
                const lotId = `LOT${randomInt(500)}`; // assume exists
                const price = (Math.random() * 100 + 50).toFixed(2);
                const args = [lotId, this.name, price];
                await this.contract.submitTransaction('makeOffer', ...args);
            } else if (r <= 85) { // acceptOffer
                const lotId = `LOT${randomInt(500)}`;
                const retailer = `User${randomInt(NUM_RETAILERS)}`;
                const args = [lotId, retailer];
                await this.contract.submitTransaction('acceptOffer', ...args);
            } else { // purchasePacket
                const pktId = `PKT${randomInt(500)}`;
                const args = [pktId, this.name];
                await this.contract.submitTransaction('purchasePacket', ...args);
            }
            incSuccess(this.name);
        } catch (e) {
            incFailure(this.name);
            // Swallow the error – we only care about metrics here
        }
    }
}

// ────── MAIN DRIVER ───────────────────────────────────────────────────
(async () => {
    const users = [];
    for (let i = 1; i <= NUM_CONSUMERS; i++) {
        const u = new SimUser(`farmer${i}`, path.resolve(__dirname, `sim-wallet/farmer${i}`));
        await u.init();
        users.push(u);
    }
    for (let i = 1; i <= NUM_RETAILERS; i++) {
        const u = new SimUser(`retailer${i}`, path.resolve(__dirname, `sim-wallet/retailer${i}`));
        await u.init();
        users.push(u);
    }

    console.log(`🚀 Simulator started – ${users.length} users, target ${TX_PER_SECOND} TPS`);

    const intervalMs = 1000 / TX_PER_SECOND;
    const endTime    = Date.now() + DURATION_SEC * 1000;
    let   nextIdx    = 0;

    const schedule = setInterval(async () => {
        if (Date.now() >= endTime) {
            clearInterval(schedule);
            clearInterval(liveTimer);
            await Promise.all(users.map(u => u.shutdown()));
            printLiveStats(); // final snapshot
            console.log('🛑 Simulation completed');
            process.exit(0);
        }
        const user = users[nextIdx];
        nextIdx = (nextIdx + 1) % users.length;
        // fire‑and‑forget (errors are captured inside submitRandomTx)
        user.submitRandomTx();
    }, intervalMs);
})();
