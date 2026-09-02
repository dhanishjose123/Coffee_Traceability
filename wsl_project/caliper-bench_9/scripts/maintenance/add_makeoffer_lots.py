import glob

# 1. Update run.js
run_js_path = '/home/dhanish/fabric_2/caliper-bench_9/run.js'
with open(run_js_path, 'r', encoding='utf-8') as f:
    run_content = f.read()

old_array = 'const makeOfferLotCounts = [1, 5, 10, 20, 50];'
new_array = 'const makeOfferLotCounts = [1, 2, 5, 10, 20, 30, 40, 50];'

if old_array in run_content:
    run_content = run_content.replace(old_array, new_array)
    with open(run_js_path, 'w', encoding='utf-8') as f:
        f.write(run_content)
    print("Updated run.js")
else:
    print("Could not find makeOfferLotCounts in run.js")

# 2. Update run-latency-custom.js
custom_js_path = '/home/dhanish/fabric_2/caliper-bench_9/run-latency-custom.js'
with open(custom_js_path, 'r', encoding='utf-8') as f:
    custom_content = f.read()

if old_array in custom_content:
    custom_content = custom_content.replace(old_array, new_array)
    with open(custom_js_path, 'w', encoding='utf-8') as f:
        f.write(custom_content)
    print("Updated run-latency-custom.js")

# 3. Update the wrapper scripts
wrapper_files = [
    '/home/dhanish/fabric_2/caliper-bench_9/run-latency-matrix.js',
    '/home/dhanish/fabric_2/caliper-bench_9/run-latency-preload-matrix.js'
]

new_groups = '''    {
        name: 'makeoffer_1',
        benchmarks: makeOfferBenchmarks(1)
    },
    {
        name: 'makeoffer_2',
        benchmarks: makeOfferBenchmarks(2)
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
        name: 'makeoffer_30',
        benchmarks: makeOfferBenchmarks(30)
    },
    {
        name: 'makeoffer_40',
        benchmarks: makeOfferBenchmarks(40)
    },
    {
        name: 'makeoffer_50',
        benchmarks: makeOfferBenchmarks(50)
    },'''

old_groups = '''    {
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
    with open(w_file, 'r', encoding='utf-8') as f:
        w_content = f.read()
    
    if old_groups in w_content:
        w_content = w_content.replace(old_groups, new_groups)
        with open(w_file, 'w', encoding='utf-8') as f:
            f.write(w_content)
        print(f"Updated {w_file}")
    else:
        print(f"Could not find makeoffer groups in {w_file}")

print("Done")
