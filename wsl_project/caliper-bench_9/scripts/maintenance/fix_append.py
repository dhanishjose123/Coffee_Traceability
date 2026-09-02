with open('/home/dhanish/fabric_2/caliper-bench_9/run.js', 'a', encoding='utf-8') as f:
    f.write('''
function getWorkersForFunction(functionName) {
    const submitProduceMatch = String(functionName).match(/^submitproduce(?:_(?:no|n0)_mvcc)?_f(\\d+)_a(\\d+)(?:_s(\\d+))?$/i);
    if (submitProduceMatch) {
        const farmerCount = Number(submitProduceMatch[1]);
        return farmerCount;
    }

    const testCoffeeMatch = String(functionName).match(/^testcoffee_a(\\d+)(?:_s(\\d+))?$/i);
    if (testCoffeeMatch) {
        return Number(testCoffeeMatch[1]);
    }

    const makeOfferMatch = String(functionName).match(/^makeoffer_r(\\d+)(?:_(\\d+))?$/i);
    if (makeOfferMatch) {
        return Number(makeOfferMatch[1]);
    }

    const makeOfferAllMatch = String(functionName).match(/^makeofferall(?:_r(\\d+)_f(\\d+)|_f(\\d+)_r(\\d+))(?:_s(\\d+))?$/i);
    if (makeOfferAllMatch) {
        return Number(makeOfferAllMatch[1] || makeOfferAllMatch[4]);
    }

    const packMatch = String(functionName).match(/^pack_r(\\d+)(?:_s(\\d+))?$/i);
    if (packMatch) {
        return Number(packMatch[1]);
    }

    const purchaseMatch = String(functionName).match(/^purchase_c(\\d+)(?:_r(\\d+))?$/i);
    if (purchaseMatch) {
        return Number(purchaseMatch[1]);
    }

    if (String(functionName).toLowerCase() === 'makeofferall') {
        return Math.max(...strategicCounts);
    }

    const acceptOfferMatch = String(functionName).match(/^acceptoffer(?:_(?:no|n0)_mvcc)?_f(\\d+)_r(\\d+)(?:_s(\\d+))?$/i);
    if (acceptOfferMatch) {
        return Number(acceptOfferMatch[1]);
    }

    if (typeof fixedCaliperWorkers !== 'undefined' && fixedCaliperWorkers) {
        return fixedCaliperWorkers;
    }

    return 5;
}
''')
print("Appended successfully")
