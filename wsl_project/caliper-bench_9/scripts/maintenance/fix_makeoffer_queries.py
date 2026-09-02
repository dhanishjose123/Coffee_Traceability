import os

# 1. FIX MAKEOFFER.JS
makeoffer_path = '/home/dhanish/fabric_2/caliper-bench_9/workload_9_cached/makeoffer.js'
with open(makeoffer_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the broken submitTransaction in makeoffer.js with the correct local-tracking one
correct_submit_tx = """    async submitTransaction() {

        /* ---------------------------------
           1️⃣ Pick random APPROVED lot
        ---------------------------------- */
        if (this.approvedLots.length === 0) return;

        const lot = this.approvedLots[
            Math.floor(Math.random() * this.approvedLots.length)
        ];

        if (!lot || !lot.lotId) return;

        const lotId = lot.lotId;

        /* ---------------------------------
           2️⃣ Get highest offer (locally tracked)
        ---------------------------------- */
        if (!this.localHighestOffers) {
            this.localHighestOffers = new Map();
        }

        let highestOffer = this.localHighestOffers.get(lotId) || 0;

        /* ---------------------------------
           3️⃣ Generate higher offer
        ---------------------------------- */
        const increment = Math.floor(Math.random() * 100 + 50);
        const offerPrice = highestOffer + increment;
        
        this.localHighestOffers.set(lotId, offerPrice);

        /* ---------------------------------
           4️⃣ Prepare transaction
        ---------------------------------- */
        const users = ['User1', 'User2', 'User3', 'User4', 'User5'];

        const randomUserId = users[Math.floor(Math.random() * users.length)];

        const args = [
            lotId,
            randomUserId,
            offerPrice.toString()
        ];

        const makeOfferTx = {
            contractId: this.contractId,
            contractFunction: 'makeOffer',
            invokerIdentity: this.invokerIdentity,
            contractArguments: args,
            readOnly: false
        };

        /* ---------------------------------
           📏 PAYLOAD SIZE MEASUREMENT
        ---------------------------------- */
        const payloadString = JSON.stringify(args);
        const payloadBytes = Buffer.byteLength(payloadString, 'utf8');
        const payloadKB = payloadBytes / 1024;

        // Log only first 50 transactions
        if (this.txIndex < 50) {
            const fs = require('fs');
            fs.appendFileSync(
                this.payloadFile,
                `makeOffer,${payloadBytes},${payloadKB.toFixed(4)}\\n`
            );
        }

        this.txIndex++;

        /* ---------------------------------
           🚀 Send transaction
        ---------------------------------- */
        this.txAttempted++;
        this.txSeq++;

        try {
            console.log(
                `🚀 [Worker ${this.workerIndex}] makeOffer -> Lot: ${lotId}, ` +
                `User: ${randomUserId}, Offer: ${offerPrice}`
            );
            await this.sutAdapter.sendRequests(makeOfferTx);
            this.txSucceeded++;
            console.log(`✅ makeOffer SUCCESS for Lot ${lotId}`);

        } catch (err) {

            const msg = err?.message || '';

            if (msg.includes('PHANTOM') || msg.includes('MVCC')) {
                this.txPhantomFailed++;
            } else {
                this.txOtherFailed++;
            }
        }

        /* ---------------------------------
           📊 Periodic stats
        ---------------------------------- */
        if (this.txAttempted % 10 === 0) {
            console.log(
                `📊 [Worker ${this.workerIndex}] Attempts=${this.txAttempted}, ` +
                `Success=${this.txSucceeded}, Phantom=${this.txPhantomFailed}, ` +
                `OtherFail=${this.txOtherFailed}`
            );
        }
    }
"""

# Find where submitTransaction starts and ends, or just replace everything after `async submitTransaction() {`
start_idx = content.find("    async submitTransaction() {")
if start_idx != -1:
    content = content[:start_idx] + correct_submit_tx + "}\n"
    with open(makeoffer_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed makeoffer.js")

# 2. FIX MAKEOFFERALL.JS
makeofferall_path = '/home/dhanish/fabric_2/caliper-bench_9/workload_9_cached/makeofferall.js'
with open(makeofferall_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_get_highest = """    async getHighestOffer(lotId) {
        try {
            const highestOfferTx = {
                contractId: this.contractId,
                contractFunction: 'getHighestOfferForLot',
                contractArguments: [lotId],
                readOnly: true
            };

            const res = await this.sutAdapter.sendRequests(highestOfferTx);
            const resultBuffer =
                res?.status?.result ||
                res?.status?.payload ||
                res?.[0]?.status?.result ||
                res?.[0]?.status?.payload;

            if (!resultBuffer) {
                return 0;
            }

            const parsed = JSON.parse(resultBuffer.toString());
            return Number(parsed.highestOffer?.offerPrice || parsed.offerPrice || 0);
        } catch {
            return 0;
        }
    }"""

new_get_highest = """    async getHighestOffer(lotId) {
        if (!this.localHighestOffers) {
            this.localHighestOffers = new Map();
        }
        return this.localHighestOffers.get(lotId) || 0;
    }"""

if old_get_highest in content:
    content = content.replace(old_get_highest, new_get_highest)
    # Also update submitTransaction to save the new highest offer
    content = content.replace(
        "const highestOffer = await this.getHighestOffer(lotId);\n        const increment = Math.floor(Math.random() * 100 + 50);\n        const workerFloor = 1000 + (this.workerIndex * 100) + this.txSeq;\n        const offerPrice = Math.max(highestOffer + increment, workerFloor);",
        "const highestOffer = await this.getHighestOffer(lotId);\n        const increment = Math.floor(Math.random() * 100 + 50);\n        const workerFloor = 1000 + (this.workerIndex * 100) + this.txSeq;\n        const offerPrice = Math.max(highestOffer + increment, workerFloor);\n        this.localHighestOffers.set(lotId, offerPrice);"
    )
    with open(makeofferall_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed makeofferall.js")
else:
    print("Could not find getHighestOffer block in makeofferall.js")
