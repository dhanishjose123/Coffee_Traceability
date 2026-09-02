import sys

with open('/home/dhanish/fabric_2/caliper-bench_9/run.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We know that the file was duplicated at the end due to a bad replacement.
# Let's find the first "console.log(`\n🎉 ALL BENCHMARKS COMPLETED`);"
# and truncate everything after its corresponding "})();"
marker = "console.log(`\\n🎉 ALL BENCHMARKS COMPLETED`);\n\n})();"

if marker in content:
    idx = content.find(marker) + len(marker)
    new_content = content[:idx] + "\n"
    with open('/home/dhanish/fabric_2/caliper-bench_9/run.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Fixed via marker")
else:
    print("Marker not found")
