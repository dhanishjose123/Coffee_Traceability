import os

# 1. REVERT MAKEOFFER_MATRIX.JS
makeoffer_matrix_path = '/home/dhanish/fabric_2/caliper-bench_9/workload_9_cached/makeoffer_matrix.js'
with open(makeoffer_matrix_path, 'r', encoding='utf-8') as f:
    content = f.read()

local_get_highest = """    async getHighestOffer(lotId) {
        if (!this.localHighestOffers) {
            this.localHighestOffers = new Map();
        }
        return this.localHighestOffers.get(lotId) || 0;
    }"""

original_get_highest = """    async getHighestOffer(lotId) {
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
    }"""

if local_get_highest in content:
    content = content.replace(local_get_highest, original_get_highest)
    content = content.replace("this.localHighestOffers.set(currentLot.lotId, offerPrice);\n        const args", "const args")
    with open(makeoffer_matrix_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Reverted makeoffer_matrix.js")


# 2. REVERT MAKEOFFERALL.JS
makeofferall_path = '/home/dhanish/fabric_2/caliper-bench_9/workload_9_cached/makeofferall.js'
with open(makeofferall_path, 'r', encoding='utf-8') as f:
    content = f.read()

if local_get_highest in content:
    content = content.replace(local_get_highest, original_get_highest.replace("const tx =", "const highestOfferTx =").replace("this.sutAdapter.sendRequests(tx)", "this.sutAdapter.sendRequests(highestOfferTx)").replace("const response =", "const res =").replace("response?", "res?"))
    content = content.replace("const offerPrice = Math.max(highestOffer + increment, workerFloor);\n        this.localHighestOffers.set(lotId, offerPrice);", "const offerPrice = Math.max(highestOffer + increment, workerFloor);")
    with open(makeofferall_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Reverted makeofferall.js")


# 3. REVERT MAKEOFFER.JS
makeoffer_path = '/home/dhanish/fabric_2/caliper-bench_9/workload_9_cached/makeoffer.js'
with open(makeoffer_path, 'r', encoding='utf-8') as f:
    content = f.read()

local_block = """        /* ---------------------------------
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
        
        this.localHighestOffers.set(lotId, offerPrice);"""

original_block = """        /* ---------------------------------
           2️⃣ Get highest offer
        ---------------------------------- */
        let highestOffer = 0;

        try {
            const highestOfferTx = {
                contractId: this.contractId,
                contractFunction: 'getHighestOfferForLot',
                contractArguments: [lotId],
                readOnly: true
            };

            const res = await this.sutAdapter.sendRequests(highestOfferTx);

            if (res?.status?.result) {
                const parsed = JSON.parse(res.status.result.toString());
                highestOffer = Number(parsed.offerPrice || 0);
            }

        } catch {
            highestOffer = 0;
        }

        /* ---------------------------------
           3️⃣ Generate higher offer
        ---------------------------------- */
        const increment = Math.floor(Math.random() * 100 + 50);
        const offerPrice = highestOffer + increment;"""

if local_block in content:
    content = content.replace(local_block, original_block)
    with open(makeoffer_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Reverted makeoffer.js")
