'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const fs = require('fs');

class MakeOfferMatrixWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.contractId = '';
        this.lot = null;
        this.retailerCount = 1;
        this.retailerId = 'User1';
        this.txAttempted = 0;
        this.txSucceeded = 0;
        this.txFailed = 0;
        this.txMVCCFailed = 0;
        this.payloadFile = './payload_sizes.csv';

        if (!fs.existsSync(this.payloadFile)) {
            fs.writeFileSync(this.payloadFile, 'function,payload_bytes,payload_kb\n');
        }
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter) {
        this.workerIndex = workerIndex;
        this.roundIndex = roundIndex;
        this.sutAdapter = sutAdapter;
        this.contractId = roundArguments.contractId;
        this.retailerCount = Math.max(1, Number(roundArguments.retailerCount) || 1);
        const retailerIndex = (workerIndex % this.retailerCount) + 1;
        this.retailerId = `User${retailerIndex}`;
        this.lot = null;

        const queryTx = {
            contractId: this.contractId,
            contractFunction: 'getApprovedLotsWithoutOffers',
            contractArguments: ['', '1'],
            readOnly: true
        };

        try {
            const response = await this.sutAdapter.sendRequests(queryTx);
            const resultBuffer =
                response?.status?.result ||
                response?.status?.payload ||
                response?.[0]?.status?.result ||
                response?.[0]?.status?.payload;

            const lots = resultBuffer ? JSON.parse(resultBuffer.toString()) : [];
            this.lot = Array.isArray(lots) && lots.length > 0 ? lots[0] : null;

            console.log(
                `[MakeOfferMatrix][Worker ${workerIndex}] retailerCount=${this.retailerCount}, ` +
                `retailer=${this.retailerId}, ` +
                `loadedLot=${this.lot?.lotId || 'none'}`
            );
        } catch (err) {
            console.error(`[MakeOfferMatrix][Worker ${workerIndex}] failed to load lot: ${err.message}`);
            this.lot = null;
        }
    }

    async getHighestOffer(lotId) {
        try {
            const tx = {
                contractId: this.contractId,
                contractFunction: 'getHighestOfferForLot',
                contractArguments: [lotId],
                readOnly: true
            };

            const response = await this.sutAdapter.sendRequests(tx);
            const resultBuffer =
                response?.status?.result ||
                response?.status?.payload ||
                response?.[0]?.status?.result ||
                response?.[0]?.status?.payload;

            if (!resultBuffer) {
                return 0;
            }

            const parsed = JSON.parse(resultBuffer.toString());
            return Number(parsed.highestOffer?.offerPrice || parsed.offerPrice || 0);
        } catch {
            return 0;
        }
    }

    async submitTransaction() {
        if (!this.lot?.lotId) {
            return;
        }

        const retailerId = this.retailerId;
        const retailerNumber = Number(retailerId.replace('User', '')) || 1;
        const highestOffer = await this.getHighestOffer(this.lot.lotId);
        const offerPrice = Math.max(highestOffer + 50, 1000 + (retailerNumber * 100));
        const args = [this.lot.lotId, retailerId, offerPrice.toString()];

        const tx = {
            contractId: this.contractId,
            contractFunction: 'makeOffer',
            invokerIdentity: retailerId,
            contractArguments: args,
            readOnly: false
        };

        const payloadBytes = Buffer.byteLength(JSON.stringify(args), 'utf8');
        fs.appendFileSync(
            this.payloadFile,
            `makeoffer_r${this.retailerCount},${payloadBytes},${(payloadBytes / 1024).toFixed(4)}\n`
        );

        this.txAttempted++;

        try {
            await this.sutAdapter.sendRequests(tx);
            this.txSucceeded++;
            console.log(`[MakeOfferMatrix] ${retailerId} bid ${offerPrice} on ${this.lot.lotId}`);
        } catch (err) {
            this.txFailed++;
            const msg = err?.message || '';
            if (msg.includes('MVCC') || msg.includes('PHANTOM') || msg.includes('CONFLICT')) {
                this.txMVCCFailed++;
            }
            console.log(`[MakeOfferMatrix] ${retailerId} failed on ${this.lot.lotId}: ${msg}`);
        }
    }

    async cleanupWorkloadModule() {
        console.log(`
================ MakeOffer Matrix Summary ================
Worker          : ${this.workerIndex}
Lot             : ${this.lot?.lotId || 'none'}
Retailer Count  : ${this.retailerCount}
Retailer        : ${this.retailerId}
Attempted       : ${this.txAttempted}
Success         : ${this.txSucceeded}
Failed          : ${this.txFailed}
MVCC Failed     : ${this.txMVCCFailed}
Dummy TX        : 0
==========================================================
`);
    }
}

module.exports.createWorkloadModule = () => new MakeOfferMatrixWorkload();
