import glob
import re

files = glob.glob("/home/dhanish/fabric_2/caliper-bench_9/run-*.js")

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Look for makeOfferBenchmarks returning strategicCounts.map(count => `makeoffer_r${count}`);
    if "`makeoffer_r${count}`)" in content:
        new_content = content.replace("`makeoffer_r${count}`)", "`makeoffer_r${count}_${process.env.LOT_COUNT || 5}`)")
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed {file}")
