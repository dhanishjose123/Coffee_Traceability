'use strict';

const { Contract } = require('fabric-contract-api');

class SupplyChainContract extends Contract {

   _logInvocation(fnName, args, ctx) {
    console.log(`\n📥 Invoked function: ${fnName}`);
    console.log(`🔗 Transaction ID: ${ctx.stub.getTxID()}`);
    console.log(`📡 Channel ID: ${ctx.stub.getChannelID()}`);
    if (args && args.length) {
      for (let i = 0; i < args.length; i++) {
        console.log(`   └─ arg[${i}]:`, args[i]);
      }
    }
  }
  async getMSPID(ctx) {
    this._logInvocation("getMSPID", arguments, ctx);
    console.log("🚀 Function `getMSPID` invoked");
    return ctx.clientIdentity.getMSPID();
  }

  _requireOrg(ctx, requiredMSP) {
    
    console.log("🚀 Function `_requireOrg` invoked");
    this._logInvocation("requireOrg", arguments, ctx);
    const callerMSP = ctx.clientIdentity.getMSPID();
    if (callerMSP !== requiredMSP) {
      throw new Error(`Access denied: Only members of ${requiredMSP} can perform this action. Caller MSP: ${callerMSP}`);
    }
  }

  async _getAllStatesByPartialCompositeKey(ctx, objectType, attributes) {
    const results = [];
    const pageSize = 10000;
    let bookmark = '';
    let hasMore = true;

    while (hasMore) {
      const response = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
        objectType,
        attributes,
        pageSize,
        bookmark
      );
      const iterator = response.iterator;
      const metadata = response.metadata;

      while (true) {
        const res = await iterator.next();
        if (res.value && res.value.value.toString()) {
          results.push(res.value);
        }
        if (res.done) break;
      }
      await iterator.close();

      if (metadata && metadata.bookmark && metadata.fetchedRecordsCount === pageSize) {
        bookmark = metadata.bookmark;
      } else {
        hasMore = false;
      }
    }
    return results;
  }

  async _collectStatesByPartialCompositeKey(ctx, objectType, attributes, limit, predicate, pageSize = 500) {
    const results = [];
    const parsedLimit = parseInt(limit, 10);
    const maxRecords = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.MAX_SAFE_INTEGER;
    let bookmark = '';
    let hasMore = true;

    while (hasMore && results.length < maxRecords) {
      const response = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
        objectType,
        attributes,
        pageSize,
        bookmark
      );
      const iterator = response.iterator;

      try {
        while (results.length < maxRecords) {
          const res = await iterator.next();

          if (res.value && res.value.value && res.value.value.toString()) {
            try {
              const record = JSON.parse(res.value.value.toString('utf8'));
              if (!predicate || predicate(record)) {
                results.push(record);
              }
            } catch (err) {
              console.error(`❌ Failed to parse ${objectType} record:`, err);
            }
          }

          if (res.done) break;
        }
      } finally {
        await iterator.close();
      }

      bookmark = response.metadata && response.metadata.bookmark ? response.metadata.bookmark : '';
      hasMore = Boolean(bookmark) &&
        response.metadata &&
        response.metadata.fetchedRecordsCount === pageSize;
    }

    return results;
  }

  async _findFirstStateByPartialCompositeKey(ctx, objectType, attributes, predicate) {
    return this._findStateByPartialCompositeKeyOffset(ctx, objectType, attributes, predicate, 0);
  }

  async _findStateByPartialCompositeKeyOffset(ctx, objectType, attributes, predicate, offset = 0) {
    const iterator = await ctx.stub.getStateByPartialCompositeKey(objectType, attributes);
    const targetOffset = Math.max(0, parseInt(offset, 10) || 0);
    let matched = 0;

    try {
      while (true) {
        const res = await iterator.next();

        if (res.value && res.value.value && res.value.value.toString()) {
          try {
            const record = JSON.parse(res.value.value.toString('utf8'));
            if (!predicate || predicate(record)) {
              if (matched >= targetOffset) {
                return record;
              }
              matched++;
            }
          } catch (err) {
            console.error(`❌ Failed to parse ${objectType} record:`, err);
          }
        }

        if (res.done) {
          break;
        }
      }
    } finally {
      await iterator.close();
    }

    return null;
  }

  _txOffset(ctx, modulo) {
    const safeModulo = Math.max(1, parseInt(modulo, 10) || 1);
    const txId = ctx.stub.getTxID() || '';
    let hash = 0;

    for (let i = 0; i < txId.length; i++) {
      hash = ((hash * 31) + txId.charCodeAt(i)) >>> 0;
    }

    return hash % safeModulo;
  }

  // ====================== WALLET ======================
  async createWallet(ctx, org, userId) {
    this._logInvocation("createWallet", arguments, ctx);
    console.log("🚀 Function `createWallet` invoked");
    this._requireOrg(ctx, 'BankMSP');
    const walletKey = `${org}-${userId}-wallet`;
    const existing = await ctx.stub.getState(walletKey);
    if (existing && existing.length > 0) throw new Error('Wallet already exists');

    const wallet = {
      balance: 0,
      owner: userId,
      org,
      createdAt: new Date().toISOString(),
      docType: 'wallet'
    };
    await ctx.stub.putState(walletKey, Buffer.from(JSON.stringify(wallet)));
    return `Wallet created for ${walletKey}`;
  }

  async depositMoney(ctx, org, userId, amount) {
    this._logInvocation("depositMoney", arguments, ctx);
    console.log("🚀 Function `depositMoney` invoked");
    this._requireOrg(ctx, 'BankMSP');
    const key = `${org}-${userId}-wallet`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error('Wallet not found');
    const wallet = JSON.parse(data.toString());
    wallet.balance += parseFloat(amount);
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(wallet)));
    return `Deposited ₹${amount} to ${key}`;
  }

  async getWalletBalance(ctx, org, userId) {
    this._logInvocation("getWalletBalance", arguments, ctx);
    console.log("🚀 Function `getWalletBalance` invoked");
    const key = `${org}-${userId}-wallet`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error('Wallet not found');
    return data.toString();
  }

  async _transfer(ctx, from, to, amount) {
    this._logInvocation("transfer", arguments, ctx);
    console.log("🚀 Function `transfer` invoked");
  console.log(`🔁 Initiating transfer from ${from} to ${to} of ₹${amount}`);

  const fromKey = from.replace('.', '-') + '-wallet';
  const toKey = to.replace('.', '-') + '-wallet';

  const fromData = await ctx.stub.getState(fromKey);
  const toData = await ctx.stub.getState(toKey);

  if (!fromData || !toData) throw new Error('Wallet not found');

  const fromWallet = JSON.parse(fromData.toString());
  const toWallet = JSON.parse(toData.toString());

  if (fromWallet.balance < amount) throw new Error('Insufficient balance');

  fromWallet.balance -= amount;
  toWallet.balance += amount;

  await ctx.stub.putState(fromKey, Buffer.from(JSON.stringify(fromWallet)));
  await ctx.stub.putState(toKey, Buffer.from(JSON.stringify(toWallet)));

  console.log(`✅ Transferred ₹${amount} from ${fromKey} to ${toKey}`);
  return `Transferred ₹${amount} from ${from} to ${to}`;
}


async transfer(ctx, from, to, amount) {
    this._logInvocation("transfer", arguments, ctx);
    console.log("🚀 Function `transfer` invoked");

    // 🔐 Access control (example)
    // this._requireOrg(ctx, 'BankMSP');

    // 🔢 Always validate input at entry point
    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('❌ Invalid transfer amount');
    }

    // 🔁 Delegate to internal helper
    await this._transfer(ctx, from, to, amount);

    return {
        status: 'SUCCESS',
        message: `Transferred ₹${amount} from ${from} to ${to}`
    };
}


  async transfermoney(ctx, from, to, amount) {
    this._logInvocation("transfermoney", arguments, ctx);
    console.log("🚀 Function `transfer` invoked");
    const fromKey = from.replace('.', '-') + '-wallet';
    const toKey = to.replace('.', '-') + '-wallet';

    const fromData = await ctx.stub.getState(fromKey);
    const toData = await ctx.stub.getState(toKey);
    if (!fromData || !toData) throw new Error('Wallet not found');
    const fromWallet = JSON.parse(fromData.toString());
    const toWallet = JSON.parse(toData.toString());
    if (fromWallet.balance < amount) throw new Error('Insufficient balance');
    fromWallet.balance -= amount;
    toWallet.balance += amount;
    await ctx.stub.putState(fromKey, Buffer.from(JSON.stringify(fromWallet)));
    await ctx.stub.putState(toKey, Buffer.from(JSON.stringify(toWallet)));
    return `Transferred ₹${amount} from ${from} to ${to}`;
  }

  // ====================== PRODUCE ======================
	  async submitProduce(ctx, lotId, farmerId, weightKg, lotDate, bags, aggregatorId) {
	    this._logInvocation("submitProduce", arguments, ctx);
	    console.log("🚀 Function `submitProduce` invoked");
    this._requireOrg(ctx, 'FarmersMSP');

    const feeKey = ctx.stub.createCompositeKey('testingFee', [aggregatorId]);
    const feeData = await ctx.stub.getState(feeKey);
    console.log("📦 Raw feeData buffer:", feeData);
    console.log("📦 Raw feeData string:", feeData.toString());

    if (!feeData || feeData.length === 0) {
      throw new Error(`❌ Aggregator fee not set for ID ${aggregatorId}`);
    }

    let fee;
    try {
      const feeObj = JSON.parse(feeData.toString());
      fee = feeObj.feeAmount;
      if (typeof fee !== 'number') throw new Error('feeAmount is not a number');
    } catch (err) {
      throw new Error(`❌ Failed to parse testing fee for ${aggregatorId}: ${err.message}`);
    }

    await this._transfer(ctx, `farmers.${farmerId}`, `aggregators.${aggregatorId}`, fee);

    const lot = {
      lotId,
      farmerId,
      owner: farmerId,
      weightKg: parseFloat(weightKg),
      lotDate,
      bags: parseInt(bags),
      aggregatorId,
      status: 'SUBMITTED',
      docType: 'lot',
      submittedAt: new Date().toISOString(),
      testingFee: fee,
      offers: []
    };

    const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
	    await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));
	    return `Lot ${lotId} submitted with aggregator ${aggregatorId}`;
	  }

	  async submitProduceNoMVCC(ctx, lotId, farmerId, weightKg, lotDate, bags, aggregatorId) {
	    this._logInvocation("submitProduceNoMVCC", arguments, ctx);
	    console.log("🚀 Function `submitProduceNoMVCC` invoked");
	    this._requireOrg(ctx, 'FarmersMSP');

	    const feeKey = ctx.stub.createCompositeKey('testingFee', [aggregatorId]);
	    const feeData = await ctx.stub.getState(feeKey);

	    if (!feeData || feeData.length === 0) {
	      throw new Error(`❌ Aggregator fee not set for ID ${aggregatorId}`);
	    }

	    let fee;
	    try {
	      const feeObj = JSON.parse(feeData.toString());
	      fee = feeObj.feeAmount;
	      if (typeof fee !== 'number') throw new Error('feeAmount is not a number');
	    } catch (err) {
	      throw new Error(`❌ Failed to parse testing fee for ${aggregatorId}: ${err.message}`);
	    }

	    const lot = {
	      lotId,
	      farmerId,
	      owner: farmerId,
	      weightKg: parseFloat(weightKg),
	      lotDate,
	      bags: parseInt(bags),
	      aggregatorId,
	      status: 'SUBMITTED',
	      docType: 'lot',
	      submittedAt: new Date().toISOString(),
	      testingFee: fee,
	      paymentSkipped: true,
	      paymentMode: 'NO_MVCC',
	      offers: []
	    };

	    const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
	    await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));
	    return `Lot ${lotId} submitted with aggregator ${aggregatorId} without wallet transfer`;
	  }

  async testCoffee(ctx, lotId, result, videoHash, gradingJson) {
    this._logInvocation("testCoffee", arguments, ctx);
    console.log("🚀 Function `testCoffee` invoked");
  this._requireOrg(ctx, 'AggregatorsMSP');

  const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
  const lotBytes = await ctx.stub.getState(lotKey);
  if (!lotBytes || lotBytes.length === 0) throw new Error('Lot not found');

  const lot = JSON.parse(lotBytes.toString());

  // Basic test info
  lot.status = result === 'pass' ? 'APPROVED' : 'REJECTED';
  lot.testResult = result;
  lot.testedAt = new Date().toISOString();
  lot.videoHash = videoHash;

  // Optional grading details
  if (gradingJson) {
    const grading = JSON.parse(gradingJson);

    // Validate sizeGrades
    if (!grading.sizeGrades || typeof grading.sizeGrades !== 'object') {
      throw new Error("Missing or invalid 'sizeGrades' field in grading data");
    }

    // Optionally validate size ranges and required fields
    for (const [size, breakdown] of Object.entries(grading.sizeGrades)) {
      const { clean, sick, split, total } = breakdown;
      if (
        clean === undefined ||
        sick === undefined ||
        split === undefined ||
        total === undefined
      ) {
        throw new Error(`Missing grading fields for size category: ${size}`);
      }
    }

    // Validate quality and metric fields
    const requiredQuality = ['greenPercent', 'averagePercent', 'fruitPercent', 'belowAveragePercent'];
    const requiredMetrics = ['literWeight', 'moisture', 'numberOfBags', 'netWeight'];

    for (const field of requiredQuality) {
      if (grading[field] === undefined) {
        throw new Error(`Missing quality field: ${field}`);
      }
    }

    for (const field of requiredMetrics) {
      if (grading[field] === undefined) {
        throw new Error(`Missing metric field: ${field}`);
      }
    }

    // Assign grading data to the lot
    lot.grading = {
      sizeGrades: grading.sizeGrades,
      quality: {
        greenPercent: grading.greenPercent,
        averagePercent: grading.averagePercent,
        fruitPercent: grading.fruitPercent,
        belowAveragePercent: grading.belowAveragePercent,
      },
      metrics: {
        literWeight: grading.literWeight,
        moisture: grading.moisture,
        numberOfBags: grading.numberOfBags,
        netWeight: grading.netWeight,
      }
    };
  }

  await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));
  return `Lot ${lotId} tested as ${lot.status}${gradingJson ? ' with grading details' : ''}`;
}

  // ====================== MARKET OFFERS ======================
 async makeOffer(ctx, lotId, retailerId, offerPrice) {

    this._logInvocation("makeOffer", arguments, ctx);
    console.log("🚀 Function `makeOffer` invoked");

    this._requireOrg(ctx, 'RetailersMSP');

    const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
    const lotBytes = await ctx.stub.getState(lotKey);

    if (!lotBytes || lotBytes.length === 0) {
        throw new Error('Lot not found');
    }

    const lot = JSON.parse(lotBytes.toString());

    if (lot.status !== 'APPROVED' && lot.status !== 'purchase-requested') {
        throw new Error('Offers can only be made on APPROVED lots');
    }

    /* -------------------------------
       🔹 VALIDATE PRICE
    ------------------------------- */
    const newPricePerKg = parseFloat(offerPrice);

    if (isNaN(newPricePerKg) || newPricePerKg <= 0) {
        throw new Error('Invalid offer price');
    }

    const totalOfferAmount = newPricePerKg * lot.weightKg;

    /* -------------------------------
       🔹 WALLET CHECK
    ------------------------------- */
    const walletKey = `retailers-${retailerId}-wallet`;
    const walletBytes = await ctx.stub.getState(walletKey);

    if (!walletBytes || walletBytes.length === 0) {
        throw new Error('Retailer wallet not found');
    }

    const wallet = JSON.parse(walletBytes.toString());

    if (wallet.balance < totalOfferAmount) {
        throw new Error(`Insufficient funds. Wallet balance: ₹${wallet.balance}, Required: ₹${totalOfferAmount}`);
    }

    /* -------------------------------
       ⚡ FAST HIGHEST OFFER CHECK
    ------------------------------- */
    const currentHighest = lot.highestOffer?.offerPrice || 0;

    if (newPricePerKg <= currentHighest) {
        throw new Error(`Offer must be higher than current highest ₹${currentHighest}`);
    }

    /* -------------------------------
       ✅ UPDATE HIGHEST OFFER
    ------------------------------- */
    const txTimestamp = ctx.stub.getTxTimestamp();
    const timestamp = new Date(txTimestamp.seconds.low * 1000).toISOString();

    const offer = {
        retailerId,
        offerPrice: newPricePerKg,
        totalAmount: totalOfferAmount,
        timestamp
    };

    lot.highestOffer = offer;
    lot.offers = Array.isArray(lot.offers)
        ? lot.offers.filter(existingOffer => existingOffer.retailerId !== retailerId)
        : [];
    lot.offers.push(offer);

    /* -------------------------------
       🔥 OPTIMIZATION FLAG
    ------------------------------- */
    lot.hasOffers = true;

    /* -------------------------------
       💾 SAVE LOT
    ------------------------------- */
    await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));

    return `✅ Highest offer updated: ₹${newPricePerKg}/kg for lot ${lotId}`;
}

async getHighestOfferForLot(ctx, lotId) {
    this._logInvocation("getHighestOfferForLot", arguments, ctx);

    if (!lotId) {
        throw new Error("lotId is required");
    }

    /* -------------------------------
       🔹 GET LOT
    ------------------------------- */
    const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
    const lotBytes = await ctx.stub.getState(lotKey);

    if (!lotBytes || lotBytes.length === 0) {
        throw new Error(`Lot ${lotId} not found`);
    }

    const lot = JSON.parse(lotBytes.toString());

    /* -------------------------------
       🔹 CHECK IF OFFER EXISTS
    ------------------------------- */
    if (!lot.hasOffers || !lot.highestOffer) {
        return JSON.stringify({
            lotId,
            hasOffers: false,
            highestOffer: {
                offerPrice: 0,
                retailerId: null
            }
        });
    }

    /* -------------------------------
       ✅ RETURN DIRECTLY
    ------------------------------- */
    return JSON.stringify({
        lotId,
        hasOffers: true,
        highestOffer: lot.highestOffer
    });
}

	  async acceptOffer(ctx, lotId, selectedRetailerId) {
	  this._logInvocation("acceptOffer", arguments, ctx);
	  console.log("🚀 Function `acceptOffer` invoked");
  this._requireOrg(ctx, 'FarmersMSP');

  const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
  const lotBytes = await ctx.stub.getState(lotKey);
  if (!lotBytes || lotBytes.length === 0) {
    throw new Error(`❌ Lot ${lotId} not found`);
  }

  const lot = JSON.parse(lotBytes.toString());

  // ❗ Ensure only APPROVED lots can be sold
  if (lot.status !== "APPROVED" && lot.status !== "purchase-requested") {
    throw new Error(`❌ Only APPROVED lots can be sold. Current status is '${lot.status}'`);
  }

  const offers = Array.isArray(lot.offers) && lot.offers.length > 0
    ? lot.offers
    : (lot.highestOffer ? [lot.highestOffer] : []);
  if (offers.length === 0) {
    throw new Error(`❌ No offers available for lot ${lotId}`);
  }

  // Sort offers by highest offer price
  offers.sort((a, b) => b.offerPrice - a.offerPrice);
  const highestOffer = offers[0];

  // Ensure the accepted offer is the highest
  if (highestOffer.retailerId !== selectedRetailerId) {
    throw new Error(`❌ Only the highest offer from '${highestOffer.retailerId}' (₹${highestOffer.offerPrice}) can be accepted`);
  }

  const totalAmount = parseFloat(highestOffer.offerPrice) * parseFloat(lot.weightKg);

  // Transfer money from retailer to farmer
  await this._transfer(ctx, `retailers.${selectedRetailerId}`, `farmers.${lot.farmerId}`, totalAmount);

  // Update lot status and metadata
  lot.owner = selectedRetailerId;
  lot.status = 'SOLD';
  lot.soldAt = new Date().toISOString();
  lot.totalPrice = totalAmount;
  lot.acceptedOffer = highestOffer;
  lot.offers = []; // Clear all offers after sale

  await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));

	  return `✅ Offer accepted. Lot ${lotId} sold to ${selectedRetailerId} for ₹${totalAmount}`;
	}

	async acceptOfferNoMVCC(ctx, lotId, selectedRetailerId) {
	  this._logInvocation("acceptOfferNoMVCC", arguments, ctx);
	  console.log("🚀 Function `acceptOfferNoMVCC` invoked");
	  this._requireOrg(ctx, 'FarmersMSP');

	  const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
	  const lotBytes = await ctx.stub.getState(lotKey);
	  if (!lotBytes || lotBytes.length === 0) {
	    throw new Error(`❌ Lot ${lotId} not found`);
	  }

	  const lot = JSON.parse(lotBytes.toString());

	  if (lot.status !== "APPROVED" && lot.status !== "purchase-requested") {
	    throw new Error(`❌ Only APPROVED lots can be sold. Current status is '${lot.status}'`);
	  }

	  const offers = Array.isArray(lot.offers) && lot.offers.length > 0
	    ? lot.offers
	    : (lot.highestOffer ? [lot.highestOffer] : []);
	  if (offers.length === 0) {
	    throw new Error(`❌ No offers available for lot ${lotId}`);
	  }

	  offers.sort((a, b) => b.offerPrice - a.offerPrice);
	  const highestOffer = offers[0];

	  if (highestOffer.retailerId !== selectedRetailerId) {
	    throw new Error(`❌ Only the highest offer from '${highestOffer.retailerId}' (₹${highestOffer.offerPrice}) can be accepted`);
	  }

	  const totalAmount = parseFloat(highestOffer.offerPrice) * parseFloat(lot.weightKg);

	  lot.owner = selectedRetailerId;
	  lot.status = 'SOLD';
	  lot.soldAt = new Date().toISOString();
	  lot.totalPrice = totalAmount;
	  lot.acceptedOffer = highestOffer;
	  lot.paymentSkipped = true;
	  lot.paymentMode = 'NO_MVCC';
	  lot.offers = [];

	  await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));

	  return `✅ Offer accepted without wallet transfer. Lot ${lotId} sold to ${selectedRetailerId} for ₹${totalAmount}`;
	}


async purchasePacket(ctx, packetId, customerId) {

this._logInvocation("purchasePacket", arguments, ctx);
console.log("🚀 Function `purchasePacket` invoked");
  this._requireOrg(ctx, 'ConsumersMSP');

  const packetKey = ctx.stub.createCompositeKey('packet', [packetId]);
  const packetBytes = await ctx.stub.getState(packetKey);
  if (!packetBytes || packetBytes.length === 0) {
    throw new Error(`Packet ${packetId} not found`);
  }

  const packet = JSON.parse(packetBytes.toString());

  if (packet.status !== 'AVAILABLE') {
    throw new Error(`Packet ${packetId} is not available for purchase`);
  }

  const fromWallet = `consumers.${customerId}`;
  const toWallet = `retailers.${packet.owner}`;
  const price = parseFloat(packet.price);

  // Transfer payment from customer to retailer
  await this._transfer(ctx, fromWallet, toWallet, price);

  // Update packet status and ownership
  packet.owner = customerId;
  packet.status = 'PURCHASED';
  packet.soldAt = new Date().toISOString();

  // Add to packet trace if applicable
  if (!packet.trace) {
    packet.trace = {};
  }
  packet.trace.purchasedBy = customerId;
  packet.trace.purchasedAt = packet.soldAt;

  await ctx.stub.putState(packetKey, Buffer.from(JSON.stringify(packet)));

  return `✅ Packet ${packetId} purchased by ${customerId} for ₹${price}`;
}


  // ====================== FEES ======================
  async setTestingFee(ctx, aggregatorId, feeAmount) {
    this._requireOrg(ctx, 'AggregatorsMSP');
    console.log("🚀 Function `setTestingFee` invoked");
    const key = ctx.stub.createCompositeKey('testingFee', [aggregatorId]);
    const fee = {
      aggregatorId,
      feeAmount: parseFloat(feeAmount),
      updatedAt: new Date().toISOString()
    };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(fee)));
    return `Testing fee for ${aggregatorId} set to ₹${feeAmount}`;
  }


  async packLotIntoPackets(ctx, lotId, price1kg, price500g, price250g, price100g, packingVideoHash) {
  this._logInvocation("packLotIntoPackets", arguments, ctx);
  console.log("🚀 Function `packLotIntoPackets` invoked");
  this._requireOrg(ctx, 'RetailersMSP');

  const lotKey = ctx.stub.createCompositeKey('lot', [lotId]);
  const lotBytes = await ctx.stub.getState(lotKey);
  if (!lotBytes || lotBytes.length === 0) throw new Error('Lot not found');

  const lot = JSON.parse(lotBytes.toString());

  if (lot.status !== 'APPROVED' && lot.status !== 'SOLD') {
    throw new Error('Lot must be APPROVED or SOLD to be packed');
  }

  const totalWeight = lot.weightKg * 1000; // convert to grams
  const breakdown = {
  "1000g": Math.floor(totalWeight * 0.10 / 1000),
  "500g": Math.floor(totalWeight * 0.20 / 500),
  "250g": Math.floor(totalWeight * 0.30 / 250),
  "100g": Math.floor(totalWeight * 0.40 / 100)
};

const prices = {
  "1000g": parseFloat(price1kg),
  "500g": parseFloat(price500g),
  "250g": parseFloat(price250g),
  "100g": parseFloat(price100g)
};


  let counter = 1;
  const packetCounts = {};

  for (const size in breakdown) {
    packetCounts[size] = 0;

    for (let i = 0; i < breakdown[size]; i++) {
      const packetId = `${lotId}-PKT-${counter}`;
      const now = new Date().toISOString();

      const packet = {
        packetId,
        weight: size,
        price: prices[size],
        qrCode: packetId,
        owner: lot.owner, // current retailer
        lotRef: lotId,
        status: 'AVAILABLE',
        packedAt: now,

        videoHash: {
          testing: lot.videoHash || null,
          packing: packingVideoHash
        },

        trace: {
          farmerId: lot.farmerId,
          submittedAt: lot.submittedAt || null,
          aggregatorId: lot.aggregatorId || null,
          testedBy: "aggregators." + lot.aggregatorId,
          testedAt: lot.testedAt || null,
          testingVideoHash: lot.videoHash || null,
          testResult: lot.testResult || null,
          packedBy: "retailers." + lot.owner,
          packedAt: now,
          packingVideoHash: packingVideoHash
        }
      };

      const packetKey = ctx.stub.createCompositeKey('packet', [packetId]);
      await ctx.stub.putState(packetKey, Buffer.from(JSON.stringify(packet)));

      counter++;
      packetCounts[size]++;
    }
  }

  lot.packetCounts = packetCounts;
  lot.status = 'PACKED';
  await ctx.stub.putState(lotKey, Buffer.from(JSON.stringify(lot)));

  return `✅ Packed ${lotId} into ${counter - 1} packets`;
}

async getPacketHistory(ctx, packetId) {
this._logInvocation("getPacketHistory", arguments, ctx);
console.log("🚀 Function `getPacketHistory` invoked");
  const packetKey = ctx.stub.createCompositeKey('packet', [packetId]);
  const iterator = await ctx.stub.getHistoryForKey(packetKey);

  const history = [];
  while (true) {
    const res = await iterator.next();
    if (res.value) {
      let parsedValue = null;

      try {
        parsedValue = JSON.parse(res.value.value.toString('utf8'));
      } catch (e) {
        parsedValue = { raw: res.value.value.toString('utf8') };
      }

      const tx = {
        txId: res.value.txId,
        timestamp: res.value.timestamp,
        isDelete: res.value.isDelete,
        action: res.value.isDelete ? "DELETED" : "UPDATED",
        packetId: packetId,
        weight: parsedValue?.weight || null,
        price: parsedValue?.price || null,
        owner: parsedValue?.owner || null,
        status: parsedValue?.status || null,
        packedAt: parsedValue?.packedAt || null,
        lotRef: parsedValue?.lotRef || null,
        videoHash: parsedValue?.videoHash || null,
        trace: parsedValue?.trace || {},
        fullRecord: parsedValue
      };

      history.push(tx);
    }

    if (res.done) break;
  }

  await iterator.close();
  return JSON.stringify(history);
}


async purchasePacket(ctx, packetId, customerId) {
this._logInvocation("purchasePacket", arguments, ctx);
console.log("🚀 Function `purchasePacket invoked");
  this._requireOrg(ctx, 'ConsumersMSP');

  const packetKey = ctx.stub.createCompositeKey('packet', [packetId]);
  const packetBytes = await ctx.stub.getState(packetKey);
  if (!packetBytes || packetBytes.length === 0) throw new Error(`Packet ${packetId} not found`);

  const packet = JSON.parse(packetBytes.toString());

  if (packet.status !== 'AVAILABLE') {
    throw new Error(`Packet ${packetId} is not available for purchase`);
  }

  const fromWallet = `retailers.${packet.owner}`;
  const toWallet = `consumers.${customerId}`;
  const price = packet.price;

  // Perform payment transfer
  await this._transfer(ctx, toWallet, fromWallet, price);

  // Update packet ownership and status
  packet.owner = customerId;
  packet.status = 'PURCHASED';
  packet.soldAt = new Date().toISOString();

  await ctx.stub.putState(packetKey, Buffer.from(JSON.stringify(packet)));

  return `✅ Packet ${packetId} purchased by ${customerId} for ₹${price}`;
}

async testNextSubmittedProduceByAggregator(ctx, aggregatorId, result, videoHash, gradingJson) {
  this._logInvocation("testNextSubmittedProduceByAggregator", arguments, ctx);
  this._requireOrg(ctx, 'AggregatorsMSP');

  if (!aggregatorId) {
    throw new Error('aggregatorId is required');
  }

  const lot = await this._findStateByPartialCompositeKeyOffset(
    ctx,
    'lot',
    [],
    lot => lot.status === 'SUBMITTED' && lot.aggregatorId === aggregatorId,
    this._txOffset(ctx, 3000)
  );

  if (!lot) {
    return JSON.stringify({
      ok: false,
      reason: 'NO_SUBMITTED_LOT',
      aggregatorId
    });
  }

  const message = await this.testCoffee(ctx, lot.lotId, result, videoHash, gradingJson);

  return JSON.stringify({
    ok: true,
    lotId: lot.lotId,
    aggregatorId,
    message
  });
}

async acceptNextOfferByFarmerAndRetailer(ctx, farmerId, retailerId) {
  this._logInvocation("acceptNextOfferByFarmerAndRetailer", arguments, ctx);
  this._requireOrg(ctx, 'FarmersMSP');

  if (!farmerId) {
    throw new Error('farmerId is required');
  }
  if (!retailerId) {
    throw new Error('retailerId is required');
  }

  const lot = await this._findStateByPartialCompositeKeyOffset(
    ctx,
    'lot',
    [],
    lot => {
      if (lot.status !== 'APPROVED' && lot.status !== 'purchase-requested') {
        return false;
      }
      if (lot.farmerId !== farmerId && lot.owner !== farmerId) {
        return false;
      }

      const offers = Array.isArray(lot.offers) && lot.offers.length > 0
        ? lot.offers
        : (lot.highestOffer ? [lot.highestOffer] : []);
      if (offers.length === 0) {
        return false;
      }

      offers.sort((a, b) => Number(b.offerPrice || 0) - Number(a.offerPrice || 0));
      return offers[0]?.retailerId === retailerId;
    },
    this._txOffset(ctx, 3000)
  );

  if (!lot) {
    return JSON.stringify({
      ok: false,
      reason: 'NO_ACCEPTABLE_LOT',
      farmerId,
      retailerId
    });
  }

  const message = await this.acceptOffer(ctx, lot.lotId, retailerId);

  return JSON.stringify({
    ok: true,
    lotId: lot.lotId,
    farmerId,
    retailerId,
    message
  });
}

async acceptNextOfferNoMVCCByFarmerAndRetailer(ctx, farmerId, retailerId) {
  this._logInvocation("acceptNextOfferNoMVCCByFarmerAndRetailer", arguments, ctx);
  this._requireOrg(ctx, 'FarmersMSP');

  if (!farmerId) {
    throw new Error('farmerId is required');
  }
  if (!retailerId) {
    throw new Error('retailerId is required');
  }

  const lot = await this._findStateByPartialCompositeKeyOffset(
    ctx,
    'lot',
    [],
    lot => {
      if (lot.status !== 'APPROVED' && lot.status !== 'purchase-requested') {
        return false;
      }
      if (lot.farmerId !== farmerId && lot.owner !== farmerId) {
        return false;
      }

      const offers = Array.isArray(lot.offers) && lot.offers.length > 0
        ? lot.offers
        : (lot.highestOffer ? [lot.highestOffer] : []);
      if (offers.length === 0) {
        return false;
      }

      offers.sort((a, b) => Number(b.offerPrice || 0) - Number(a.offerPrice || 0));
      return offers[0]?.retailerId === retailerId;
    },
    this._txOffset(ctx, 3000)
  );

  if (!lot) {
    return JSON.stringify({
      ok: false,
      reason: 'NO_ACCEPTABLE_LOT',
      farmerId,
      retailerId
    });
  }

  const message = await this.acceptOfferNoMVCC(ctx, lot.lotId, retailerId);

  return JSON.stringify({
    ok: true,
    lotId: lot.lotId,
    farmerId,
    retailerId,
    message
  });
}

async purchaseNextPacketByRetailer(ctx, retailerId, customerId) {
  this._logInvocation("purchaseNextPacketByRetailer", arguments, ctx);
  this._requireOrg(ctx, 'ConsumersMSP');

  if (!retailerId) {
    throw new Error('retailerId is required');
  }
  if (!customerId) {
    throw new Error('customerId is required');
  }

  const packet = await this._findStateByPartialCompositeKeyOffset(
    ctx,
    'packet',
    [],
    packet => packet.status === 'AVAILABLE' && packet.owner === retailerId,
    this._txOffset(ctx, 3000)
  );

  if (!packet) {
    return JSON.stringify({
      ok: false,
      reason: 'NO_AVAILABLE_PACKET',
      retailerId,
      customerId
    });
  }

  const message = await this.purchasePacket(ctx, packet.packetId, customerId);

  return JSON.stringify({
    ok: true,
    packetId: packet.packetId,
    retailerId,
    customerId,
    message
  });
}

async getFarmerRating(ctx, farmerId) {
this._logInvocation("getFarmerRating", arguments, ctx);
console.log("🚀 Function `getFarmerRating invoked");
  const lots = await this._getAllStatesByPartialCompositeKey(ctx, 'lot', []);
  let total = 0;
  let rejected = 0;

  for (const res of lots) {
    if (res && res.value.toString()) {
      const lot = JSON.parse(res.value.toString('utf8'));

      if (lot.farmerId === farmerId) {
        total++;
        if (lot.status === 'REJECTED') {
          rejected++;
        }
      }
    }
  }

  const rating = total === 0 ? 0 : Math.round(((total - rejected) / total) * 100);
  return JSON.stringify({ farmerId, total, rejected, rating });
}



  async getTestingFee(ctx, aggregatorId) {
    this._logInvocation("getTestingFee", arguments, ctx);
    console.log("🚀 Function `getTestingFee invoked");
    const key = ctx.stub.createCompositeKey('testingFee', [aggregatorId]);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error('Fee not set');
    return data.toString();
  }


async dummyPackLoad(ctx, dummyId, count = '20') {

  this._logInvocation("dummyPackLoad", arguments, ctx);
  console.log("🚀 Function `dummyPackLoad` invoked");

  // Optional: restrict to one org for stability
  // this._requireOrg(ctx, 'RetailersMSP');

  const numPackets = parseInt(count);
  const now = new Date().toISOString();

  const putOps = [];

  for (let i = 0; i < numPackets; i++) {

    const packetId = `${dummyId}-PKT-${i}-${Date.now()}`;

    const packetKey = ctx.stub.createCompositeKey('dummyPacket', [packetId]);

    const packet = {
      packetId,
      weight: ['100g','250g','500g','1000g'][i % 4],
      price: Math.floor(Math.random() * 1000) + 100,
      owner: "dummyUser",
      status: "DUMMY",
      packedAt: now,
      trace: {
        farmerId: "dummyFarmer",
        aggregatorId: "dummyAggregator",
        testedBy: "dummy",
        packedBy: "dummy",
        timestamp: now
      }
    };

    putOps.push(
      ctx.stub.putState(packetKey, Buffer.from(JSON.stringify(packet)))
    );
  }

  await Promise.all(putOps);

  return `✅ Dummy load created ${numPackets} packets`;
}






async getSubmittedProduceByAggregator(ctx, aggregatorId, limit) {

  this._logInvocation("getSubmittedProduceByAggregator", arguments, ctx);
  console.log("🚀 Function `getSubmittedProduceByAggregator` invoked");

  const results = [];
  const maxRecords = limit ? parseInt(limit) : Number.MAX_SAFE_INTEGER;
  const pageSize = 500;
  let bookmark = '';
  let hasMore = true;

  while (hasMore && results.length < maxRecords) {
    const response = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
      'lot',
      [],
      pageSize,
      bookmark
    );
    const iterator = response.iterator;

    try {
      while (results.length < maxRecords) {
        const res = await iterator.next();

        if (res.value && res.value.value && res.value.value.toString()) {
          const record = JSON.parse(res.value.value.toString('utf8'));

          if (record.status === "SUBMITTED" && record.aggregatorId === aggregatorId) {
            results.push(record);
          }
        }

        if (res.done) break;
      }
    } finally {
      await iterator.close();
    }

    bookmark = response.metadata && response.metadata.bookmark ? response.metadata.bookmark : '';
    hasMore = Boolean(bookmark) &&
      response.metadata &&
      response.metadata.fetchedRecordsCount === pageSize;
  }

  const payload = JSON.stringify(results);
  const payloadSize = Buffer.byteLength(payload, 'utf8');

  return JSON.stringify({
    recordCount: results.length,
    payloadSizeBytes: payloadSize,
    data: results
  });
}


async getProduceByStatusAndOwner(ctx, status, ownerId, limit) {

  this._logInvocation("getProduceByStatusAndOwner", arguments, ctx);
  console.log(`🚀 Fetching lots with status=${status}, owner=${ownerId}`);

  const results = await this._collectStatesByPartialCompositeKey(
    ctx,
    'lot',
    [],
    limit,
    record => record.status === status && record.owner === ownerId
  );

  return JSON.stringify({
    count: results.length,
    data: results
  });
}

async getAvailableProduceByOwner(ctx, ownerId, limit) {

  this._logInvocation("getAvailableProduceByOwner", arguments, ctx);
  console.log(`🚀 Fetching AVAILABLE lots for owner: ${ownerId}`);

  const results = await this._collectStatesByPartialCompositeKey(
    ctx,
    'lot',
    [],
    limit,
    record => record.status === 'AVAILABLE' && record.owner === ownerId
  );

  return JSON.stringify({
    count: results.length,
    data: results
  });
}




async getAllLotsWithOffers(ctx) {
    this._logInvocation("getAllLotsWithOffers", arguments, ctx);

    const results = [];
    const lots = await this._getAllStatesByPartialCompositeKey(ctx, 'lot', []);

    for (const lotRes of lots) {
        if (!lotRes || !lotRes.value) continue;

        const lot = JSON.parse(lotRes.value.toString('utf8'));
        const lotId = lot.lotId;

        const offerIterator = await ctx.stub.getStateByPartialCompositeKey('offer', [lotId]);
        const offers = [];

        let highestOffer = {
            offerPrice: 0,
            retailerId: null
        };

        while (true) {
            const offerRes = await offerIterator.next();
            if (offerRes.done) break;

            const offer = JSON.parse(offerRes.value.value.toString());
            offers.push(offer);

            if (
                offer.offerPrice !== undefined &&
                Number(offer.offerPrice) > highestOffer.offerPrice
            ) {
                highestOffer.offerPrice = Number(offer.offerPrice);
                highestOffer.retailerId = offer.retailerId;
            }
        }

        await offerIterator.close();

        results.push({
            ...lot,
            offers,
            highestOffer
        });
    }

    return JSON.stringify(results);
}

async getApprovedLotsWithoutOffers(ctx, ownerId, limitStr) {
    this._logInvocation("getApprovedLotsWithoutOffersByOwner", arguments, ctx);

    const limit = parseInt(limitStr) || 20;
    const results = await this._collectStatesByPartialCompositeKey(
        ctx,
        'lot',
        [],
        limit,
        lot => lot.status === 'APPROVED' &&
            (!ownerId || lot.owner === ownerId) &&
            lot.hasOffers !== true
    );

    return JSON.stringify(results.map(lot => ({
        ...lot,
        highestOffer: {
            offerPrice: 0,
            retailerId: null
        }
    })));
}

async getLotsWithOffersByOwner(ctx, ownerId, limit) {

    this._logInvocation("getLotsWithOffersByOwner", arguments, ctx);

    if (!ownerId) {
        throw new Error("ownerId is required");
    }

    const maxRecords = limit ? parseInt(limit) : 20;
    const results = await this._collectStatesByPartialCompositeKey(
        ctx,
        'lot',
        [],
        maxRecords,
        lot => lot.owner === ownerId &&
            lot.status === 'APPROVED' &&
            (lot.hasOffers === true || (lot.highestOffer && lot.highestOffer.offerPrice > 0))
    );

    return JSON.stringify(results.map(lot => ({
        ...lot,
        highestOffer: lot.highestOffer || {
            offerPrice: 0,
            retailerId: null
        }
    })));
}








  // ====================== QUERIES ======================
  async getAllProduce(ctx) {
    this._logInvocation("getAllProduce", arguments, ctx);
    console.log("🚀 Function `getAllProduce invoked");
    const lots = await this._getAllStatesByPartialCompositeKey(ctx, 'lot', []);
    const results = [];
    for (const res of lots) {
      if (res && res.value.toString()) {
        results.push(JSON.parse(res.value.toString('utf8')));
      }
    }
    return JSON.stringify(results);
  }

  async countLotStatuses(ctx) {
    this._logInvocation("countLotStatuses", arguments, ctx);
    console.log("🚀 Function `countLotStatuses` invoked");

    const lots = await this._getAllStatesByPartialCompositeKey(ctx, 'lot', []);
    const farmers = {};
    const retailers = {};
    const totals = {
      farmerId: 'ALL',
      total: 0,
      submitted: 0,
      approved: 0,
      bid: 0,
      sold: 0,
      packed: 0,
      rejected: 0,
      other: 0
    };

    const emptyFarmer = farmerId => ({
      farmerId,
      total: 0,
      submitted: 0,
      approved: 0,
      bid: 0,
      sold: 0,
      packed: 0,
      rejected: 0,
      other: 0,
      bidsByRetailer: {}
    });

    const emptyRetailer = retailerId => ({
      retailerId,
      sold: 0,
      packed: 0,
      bidLots: 0
    });

    const hasBid = lot =>
      lot.hasOffers === true ||
      (lot.highestOffer && Number(lot.highestOffer.offerPrice) > 0) ||
      (Array.isArray(lot.offers) && lot.offers.length > 0);

    const retailerForSoldLot = lot =>
      (lot.acceptedOffer && lot.acceptedOffer.retailerId) ||
      (lot.highestOffer && lot.highestOffer.retailerId) ||
      (String(lot.owner || '').startsWith('User') ? lot.owner : null);

    for (const res of lots) {
      if (!res || !res.value) continue;

      const lot = JSON.parse(res.value.toString('utf8'));
      const farmerId = lot.farmerId || lot.owner || 'UNKNOWN';
      const status = String(lot.status || 'UNKNOWN').toUpperCase();
      const bid = hasBid(lot);

      if (!farmers[farmerId]) farmers[farmerId] = emptyFarmer(farmerId);
      const farmer = farmers[farmerId];

      farmer.total++;
      totals.total++;

      if (status === 'SUBMITTED') {
        farmer.submitted++;
        totals.submitted++;
      } else if (status === 'APPROVED' && bid) {
        farmer.bid++;
        totals.bid++;
      } else if (status === 'APPROVED') {
        farmer.approved++;
        totals.approved++;
      } else if (status === 'SOLD') {
        farmer.sold++;
        totals.sold++;
      } else if (status === 'PACKED') {
        farmer.packed++;
        farmer.sold++;
        totals.packed++;
        totals.sold++;
      } else if (status === 'REJECTED') {
        farmer.rejected++;
        totals.rejected++;
      } else {
        farmer.other++;
        totals.other++;
      }

      // Track unique retailers who bid on this lot
      const bidders = new Set();
      if (Array.isArray(lot.offers)) {
        for (const offer of lot.offers) {
          if (offer.retailerId) bidders.add(offer.retailerId);
        }
      }
      if (lot.highestOffer && lot.highestOffer.retailerId) bidders.add(lot.highestOffer.retailerId);
      if (lot.acceptedOffer && lot.acceptedOffer.retailerId) bidders.add(lot.acceptedOffer.retailerId);

      for (const retailerId of bidders) {
        farmer.bidsByRetailer[retailerId] = (farmer.bidsByRetailer[retailerId] || 0) + 1;
      }

      if (bid && lot.highestOffer && lot.highestOffer.retailerId) {
        const bidderId = lot.highestOffer.retailerId;
        if (!retailers[bidderId]) retailers[bidderId] = emptyRetailer(bidderId);
        retailers[bidderId].bidLots++;
      }

      if (status === 'SOLD' || status === 'PACKED') {
        const retailerId = retailerForSoldLot(lot);
        if (retailerId) {
          if (!retailers[retailerId]) retailers[retailerId] = emptyRetailer(retailerId);
          retailers[retailerId].sold++;
          if (status === 'PACKED') retailers[retailerId].packed++;
        }
      }
    }

    const sortByUserNumber = (left, right, key) => {
      const leftMatch = String(left[key]).match(/User(\d+)/i);
      const rightMatch = String(right[key]).match(/User(\d+)/i);
      if (leftMatch && rightMatch) return Number(leftMatch[1]) - Number(rightMatch[1]);
      return String(left[key]).localeCompare(String(right[key]), undefined, { numeric: true });
    };

    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      totals,
      farmers: Object.values(farmers).sort((a, b) => sortByUserNumber(a, b, 'farmerId')),
      retailers: Object.values(retailers).sort((a, b) => sortByUserNumber(a, b, 'retailerId'))
    });
  }


  async getAllPackets(ctx, status, limit) {
  const parsedLimit = parseInt(limit);
  const maxRecords = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
  const packets = await this._collectStatesByPartialCompositeKey(
    ctx,
    'packet',
    [],
    maxRecords,
    packet => !status || packet.status === status
  );

  return JSON.stringify(packets);
}

async getAllPacketsByRetailer(ctx, retailerId, status, limit) {
  console.log(`🚀 Function getAllPacketsByRetailer invoked for retailer=${retailerId}, status=${status}`);

  if (!retailerId) {
    throw new Error('retailerId is required');
  }

  return this.getAllPacketsByRetailerRange(ctx, retailerId, retailerId, status, limit);
}

async getAllPacketsByRetailerRange(ctx, startRetailerId, endRetailerId, status, limit) {
  console.log(`🚀 Function getAllPacketsByRetailerRange invoked for ${startRetailerId}..${endRetailerId}, status=${status}`);

  const parseUserNumber = userId => {
    const match = String(userId || '').match(/^User(\d+)$/i);
    return match ? Number(match[1]) : null;
  };

  const startNumber = parseUserNumber(startRetailerId);
  const endNumber = parseUserNumber(endRetailerId);

  if (startNumber === null || endNumber === null) {
    throw new Error('startRetailerId and endRetailerId must be in UserN format');
  }

  const minRetailer = Math.min(startNumber, endNumber);
  const maxRetailer = Math.max(startNumber, endNumber);
  const parsedLimit = parseInt(limit, 10);
  const maxRecords = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
  const packets = [];
  const pageSize = 500;
  let bookmark = '';
  let hasMore = true;

  while (hasMore && packets.length < maxRecords) {
    const response = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
      'packet',
      [],
      pageSize,
      bookmark
    );
    const iterator = response.iterator;

    try {
      while (packets.length < maxRecords) {
        const res = await iterator.next();

        if (res.value && res.value.value && res.value.value.toString()) {
          try {
            const packet = JSON.parse(res.value.value.toString('utf8'));
            const ownerNumber = parseUserNumber(packet.owner);

            if (
              ownerNumber !== null &&
              ownerNumber >= minRetailer &&
              ownerNumber <= maxRetailer &&
              (!status || packet.status === status)
            ) {
              packets.push(packet);
            }
          } catch (err) {
            console.error("❌ Failed to parse packet:", err);
          }
        }

        if (res.done) {
          break;
        }
      }
    } finally {
      await iterator.close();
    }

    bookmark = response.metadata && response.metadata.bookmark ? response.metadata.bookmark : '';
    hasMore = Boolean(bookmark) && response.metadata && response.metadata.fetchedRecordsCount === pageSize;
  }

  console.log(`✅ getAllPacketsByRetailerRange returning ${packets.length} packets for User${minRetailer}..User${maxRetailer}`);
  return JSON.stringify(packets);
}

async testFunction(ctx, testId, readCount, writeCount, hotWrite = 'false', valueSize = '0') {
  this._logInvocation("testFunction", arguments, ctx);

  if (!testId) {
    throw new Error('testId is required');
  }

  const reads = Math.max(0, Math.min(parseInt(readCount, 10) || 0, 1000));
  const writes = Math.max(0, Math.min(parseInt(writeCount, 10) || 0, 1000));
  const bytes = Math.max(0, Math.min(parseInt(valueSize, 10) || 0, 10240));
  const useHotWrites = String(hotWrite).toLowerCase() === 'true';
  const txId = ctx.stub.getTxID();
  const payload = bytes > 0 ? 'x'.repeat(bytes) : '';
  const readKeys = [];
  const writeKeys = [];

  for (let i = 0; i < reads; i++) {
    const key = ctx.stub.createCompositeKey('testFunctionRead', [testId, String(i)]);
    await ctx.stub.getState(key);
    readKeys.push(key);
  }

  for (let i = 0; i < writes; i++) {
    const key = useHotWrites
      ? ctx.stub.createCompositeKey('testFunctionWrite', [testId, String(i)])
      : ctx.stub.createCompositeKey('testFunctionWrite', [testId, txId, String(i)]);

    const record = {
      docType: 'testFunction',
      testId,
      readCount: reads,
      writeCount: writes,
      hotWrite: useHotWrites,
      index: i,
      txId,
      payload,
      updatedAt: new Date().toISOString()
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    writeKeys.push(key);
  }

  return JSON.stringify({
    testId,
    txId,
    readCount: reads,
    writeCount: writes,
    hotWrite: useHotWrites,
    valueSizeBytes: bytes,
    readKeys,
    writeKeys
  });
}

  async getStats(ctx) {
  const lots = await this._getAllStatesByPartialCompositeKey(ctx, 'lot', []);
  const packets = await this._getAllStatesByPartialCompositeKey(ctx, 'packet', []);

  let stats = {
    totalWeight: 0,
    submittedLotsCount: 0,
    rejectedWeight: 0,
    awaitingApprovalWeight: 0,
    approvedWeight: 0,
    soldWeight: 0,
    purchasedWeight: 0,
    packedWeight: 0,
    awaitingTestCount: 0,
    testedApprovedLotsCount: 0,
    rejectedLotsCount: 0,
    createdPacketCounts: { "100": 0, "250": 0, "500": 0, "1000": 0 },
    topFarmer: ""
  };

  const farmerRatings = {};

  // ---- Process LOTS ----
  for (const res of lots) {
    if (res && res.value.toString()) {
      const lot = JSON.parse(res.value.toString('utf8'));
      const weight = lot.weightKg || 0;

      stats.totalWeight += weight;
      stats.submittedLotsCount++;

      switch (lot.status) {
        case "SUBMITTED":
          stats.awaitingTestCount++;
          stats.awaitingApprovalWeight += weight;
          break;
        case "REJECTED":
          stats.rejectedWeight += weight;
          stats.rejectedLotsCount++;
          break;
        case "APPROVED":
          stats.testedApprovedLotsCount++;
          break;
        case "purchase-requested":
          stats.testedApprovedLotsCount++;
          break;
        case "SOLD":
          stats.soldWeight += weight;
          stats.testedApprovedLotsCount++;
          break;
        case "PACKED":
          stats.soldWeight += weight;
          stats.testedApprovedLotsCount++;
          break;
      }

      if (lot.farmerId && typeof lot.rating === "number") {
        if (!farmerRatings[lot.farmerId]) farmerRatings[lot.farmerId] = [];
        farmerRatings[lot.farmerId].push(lot.rating);
      }
    }
  }

  // ---- Process PACKETS ----
  for (const res of packets) {
    if (res && res.value.toString()) {
      const packet = JSON.parse(res.value.toString('utf8'));

      // Parse weight from string like "100g"
      let weight = 0;
      if (typeof packet.weight === "string") {
        weight = parseInt(packet.weight.replace("g", ""));
      }

      stats.packedWeight += weight;

      const size = `${weight}`;
      if (stats.createdPacketCounts[size] !== undefined) {
        stats.createdPacketCounts[size] += 1;
      }

      if (packet.status === "PURCHASED") {
        stats.purchasedWeight += weight / 1000; // convert grams to kg
      }
    }
  }

  // ---- Derived Approved Weight ----
  stats.approvedWeight = stats.totalWeight - stats.rejectedWeight - stats.awaitingApprovalWeight;

  // ---- Top-rated Farmer ----
  let maxAvg = -1;
  for (const farmerId in farmerRatings) {
    const ratings = farmerRatings[farmerId];
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg > maxAvg) {
      maxAvg = avg;
      stats.topFarmer = farmerId;
    }
  }

  return JSON.stringify(stats);
}




}

module.exports = SupplyChainContract;
