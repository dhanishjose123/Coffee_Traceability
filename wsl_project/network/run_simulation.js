// run_simulation.js – generic supply‑chain transaction simulator
// Usage (inside the WSL workspace):
//   NUM_USERS=8 DURATION_SEC=60 \
//   SUBMIT_TPS=20 MAKE_OFFER_TPS=30 ACCEPT_TPS=15 PURCHASE_TPS=25 PACK_TPS=10 \
//   node run_simulation.js

'use strict';
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs   = require('fs');

// ────── CONFIG ────────────────────────────────────────────────────────
const CHANNEL_NAME       = 'agrichannel';
const CHAINCODE_NAME     = 'supplychain';
const CONNECTION_PROFILE = path.resolve(__dirname, 'fabric-samples/test-network/organizations/peerOrganizations/farmers.example.com/connection-farmers.json');

const NUM_USERS      = Number(process.env.NUM_USERS      || 6);   // total virtual participants (farmers + retailers)
const DURATION_SEC   = Number(process.env.DURATION_SEC   || 30);

// target TPS per transaction type – you can override via env vars
const SUBMIT_TPS      = Number(process.env.SUBMIT_TPS      || 20);
const MAKE_OFFER_TPS  = Number(process.env.MAKE_OFFER_TPS  || 30);
const ACCEPT_TPS      = Number(process.env.ACCEPT_TPS      || 15);
const PURCHASE_TPS    = Number(process.env.PURCHASE_TPS    || 25);
const PACK_TPS        = Number(process.env.PACK_TPS        || 10);

// ────── METRICS (live) ───────────────────────────────────────────────
const metrics = {
    startedAt: Date.now(),
    totalTx:   0,
    successTx: 0,
    failureTx: 0,
    perTxType: {
        submitProduce: {success:0, failure:0},
        makeOffer:     {success:0, failure:0},
        acceptOffer:   {success:0, failure:0},
        purchasePacket:{success:0, failure:0},
        packLot:       {success:0, failure:0},
    },
    perUser:   {}
};

function incSuccess(user, type) {
    metrics.totalTx++; metrics.successTx++; metrics.perTxType[type].success++;
    metrics.perUser[user] = (metrics.perUser[user] || {success:0, failure:0});
    metrics.perUser[user].success++;
}
function incFailure(user, type) {
    metrics.totalTx++; metrics.failureTx++; metrics.perTxType[type].failure++;
    metrics.perUser[user] = (metrics.perUser[user] || {success:0, failure:0});
    metrics.perUser[user].failure++;
}

function printLiveStats() {
    const elapsed = ((Date.now() - metrics.startedAt) / 1000).toFixed(1);
    const tps = (metrics.totalTx / elapsed).toFixed(2);
    console.clear();
    console.log('=== Live Supply‑Chain Simulator ===');
    console.log(`🕒 Elapsed: ${elapsed}s | 📈 Overall TPS: ${tps}`);
    console.log('✅ Successful Tx :', metrics.successTx);
    console.log('❌ Failed Tx     :', metrics.failureTx);
    console.log('--- Per‑type breakdown ---');
    for (const [type, data] of Object.entries(metrics.perTxType)) {
        console.log(`  ${type}: ${data.success} ✓ / ${data.failure} ✗`);
    }
    console.log('--- Top failure users ---');
    const sorted = Object.entries(metrics.perUser)
        .sort((a,b)=> (b[1].failure||0) - (a[1].failure||0))
        .slice(0,3);
    for (const [usr,st] of sorted) {
        console.log(`  ${usr}: ${st.failure} failures / ${st.success} successes`);
    }
    console.log('\nPress Ctrl+C to stop the simulator.');
}

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
        const cp = JSON.parse(fs.readFileSync(CONNECTION_PROFILE, 'utf8'));
        await this.gateway.connect(cp, { wallet, identity: this.name, discovery: { enabled:true, asLocalhost:true }});
        this.network  = await this.gateway.getNetwork(CHANNEL_NAME);
        this.contract = this.network.getContract(CHAINCODE_NAME);
    }
    async shutdown() { await this.gateway.disconnect(); }

    // ---- Individual transaction helpers ----
    async submitProduce() {
        try {
            const lotId = `LOT${Date.now()}${randomInt(1000)}`;
            const args = [lotId, this.name, '10', '2025-12-31', '1', 'Aggregator1'];
            await this.contract.submitTransaction('submitProduce', ...args);
            incSuccess(this.name, 'submitProduce');
        } catch (e) { incFailure(this.name, 'submitProduce'); }
    }
    async makeOffer() {
        try {
            const lotId = `LOT${randomInt(500)}`; // assume an existing lot
            const price = (Math.random()*100 + 50).toFixed(2);
            const args = [lotId, this.name, price];
            await this.contract.submitTransaction('makeOffer', ...args);
            incSuccess(this.name, 'makeOffer');
        } catch (e) { incFailure(this.name, 'makeOffer'); }
    }
    async acceptOffer() {
        try {
            const lotId = `LOT${randomInt(500)}`;
            const retailer = `User${randomInt(NUM_USERS)}`;
            const args = [lotId, retailer];
            await this.contract.submitTransaction('acceptOffer', ...args);
            incSuccess(this.name, 'acceptOffer');
        } catch (e) { incFailure(this.name, 'acceptOffer'); }
    }
    async purchasePacket() {
        try {
            const pktId = `PKT${Date.now()}${randomInt(1000)}`;
            const args = [pktId, this.name];
            await this.contract.submitTransaction('purchasePacket', ...args);
            incSuccess(this.name, 'purchasePacket');
        } catch (e) { incFailure(this.name, 'purchasePacket'); }
    }
    async packLot() {
        try {
            const lotId = `LOT${randomInt(500)}`;
            const args = [lotId, this.name];
            await this.contract.submitTransaction('packLot', ...args);
            incSuccess(this.name, 'packLot');
        } catch (e) { incFailure(this.name, 'packLot'); }
    }
}

// ────── MAIN DRIVER ───────────────────────────────────────────────────
(async () => {
    // Build user pool – split evenly between farmers and retailers if possible
    const users = [];
    const half = Math.ceil(NUM_USERS/2);
    for (let i=1; i<=half; i++) {
        const u = new SimUser(`farmer${i}`, path.resolve(__dirname, `sim-wallet/farmer${i}`));
        await u.init();
        users.push(u);
    }
    for (let i=1; i<=NUM_USERS-half; i++) {
        const u = new SimUser(`retailer${i}`, path.resolve(__dirname, `sim-wallet/retailer${i}`));
        await u.init();
        users.push(u);
    }

    console.log(`🚀 Simulation started – ${users.length} users, duration ${DURATION_SEC}s`);
    const endTime = Date.now() + DURATION_SEC*1000;

    // Helper to schedule an interval that stops when time is up
    const schedule = (tps, fn) => {
        if (tps <= 0) return null;
        const intervalMs = 1000 / tps;
        const timer = setInterval(() => {
            if (Date.now() >= endTime) { clearInterval(timer); return; }
            const user = users[Math.floor(Math.random()*users.length)];
            fn.call(user);
        }, intervalMs);
        return timer;
    };

    const timers = [];
    timers.push(schedule(SUBMIT_TPS, SimUser.prototype.submitProduce));
    timers.push(schedule(MAKE_OFFER_TPS, SimUser.prototype.makeOffer));
    timers.push(schedule(ACCEPT_TPS, SimUser.prototype.acceptOffer));
    timers.push(schedule(PURCHASE_TPS, SimUser.prototype.purchasePacket));
    timers.push(schedule(PACK_TPS, SimUser.prototype.packLot));

    // Final cleanup after duration
    setTimeout(async () => {
        timers.forEach(t=> clearInterval(t));
        clearInterval(liveTimer);
        await Promise.all(users.map(u=>u.shutdown()));
        printLiveStats();
        console.log('🛑 Simulation completed');
        process.exit(0);
    }, DURATION_SEC*1000);
})();
