import glob

# 1. Update run.js
run_js_path = '/home/dhanish/fabric_2/caliper-bench_9/run.js'
with open(run_js_path, 'r', encoding='utf-8') as f:
    run_content = f.read()

old_run_matrix = '''const lotCount = process.env.LOT_COUNT || 5;
const makeOfferMatrix = strategicCounts.map(count => ({
    functionName: `makeoffer_r${count}_${lotCount}`,
    logLevel: 'info'
}));'''

new_run_matrix = '''const makeOfferLotCounts = [1, 5, 10, 20, 50];
const makeOfferMatrix = makeOfferLotCounts.flatMap(lots =>
    strategicCounts.map(count => ({
        functionName: `makeoffer_r${count}_${lots}`,
        logLevel: 'info'
    }))
);'''

if old_run_matrix in run_content:
    run_content = run_content.replace(old_run_matrix, new_run_matrix)
    with open(run_js_path, 'w', encoding='utf-8') as f:
        f.write(run_content)
    print("Updated run.js")
else:
    print("Could not find makeOfferMatrix in run.js")

# 2. Update the wrapper scripts
wrapper_files = glob.glob("/home/dhanish/fabric_2/caliper-bench_9/run-*.js")

old_func_1 = '''function makeOfferBenchmarks() {
    const lotCount = process.env.LOT_COUNT || 5;
    return strategicCounts.map(count => `makeoffer_r${count}_${lotCount}`);
}'''

old_func_2 = '''function makeOfferBenchmarks() {
    return strategicCounts.map(count => `makeoffer_r${count}_${process.env.LOT_COUNT || 5}`);
}'''

new_func = '''function makeOfferBenchmarks(lotCount) {
    return strategicCounts.map(count => `makeoffer_r${count}_${lotCount}`);
}'''

old_group = '''    {
        name: 'makeoffer',
        benchmarks: makeOfferBenchmarks()
    },'''

new_group = '''    {
        name: 'makeoffer_1',
        benchmarks: makeOfferBenchmarks(1)
    },
    {
        name: 'makeoffer_5',
        benchmarks: makeOfferBenchmarks(5)
    },
    {
        name: 'makeoffer_10',
        benchmarks: makeOfferBenchmarks(10)
    },
    {
        name: 'makeoffer_20',
        benchmarks: makeOfferBenchmarks(20)
    },
    {
        name: 'makeoffer_50',
        benchmarks: makeOfferBenchmarks(50)
    },'''

for w_file in wrapper_files:
    if "run.js" in w_file:
        continue
    with open(w_file, 'r', encoding='utf-8') as f:
        w_content = f.read()
    
    modified = False
    if old_func_1 in w_content:
        w_content = w_content.replace(old_func_1, new_func)
        modified = True
    elif old_func_2 in w_content:
        w_content = w_content.replace(old_func_2, new_func)
        modified = True
        
    if old_group in w_content:
        w_content = w_content.replace(old_group, new_group)
        modified = True

    if modified:
        with open(w_file, 'w', encoding='utf-8') as f:
            f.write(w_content)
        print(f"Updated {w_file}")

print("Done")
