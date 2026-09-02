with open('/home/dhanish/fabric_2/caliper-bench_9/extractthroughput.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update makeOfferMatch in getStakeholderValuesForFunction
content = content.replace(
    "const makeOfferMatch = String(functionName || '').match(/makeoffer_r(\\d+)(?:_s\\d+)?$/i);",
    "const makeOfferMatch = String(functionName || '').match(/makeoffer_r(\\d+)(?:_(\\d+))?(?:_s\\d+)?$/i);"
)

# 2. Update getCaliperWorkersForFunction oneDimensionalMatch
content = content.replace(
    "const oneDimensionalMatch = name.match(/^(?:testcoffee_a|makeoffer_r|pack(?:\\d+kg)?_r)(\\d+)(?:_s\\d+)?$/);",
    "const oneDimensionalMatch = name.match(/^(?:testcoffee_a|makeoffer_r|pack(?:\\d+kg)?_r)(\\d+)(?:_\\d+)?(?:_s\\d+)?$/);"
)

# 3. Update hotParticipants logic inside line 962 block
content = content.replace(
    '''            const hotParticipants = Number(complexity.hotKeyWrites || 0) > 0
                ? totalParticipants
                : 0;''',
    '''            let hotParticipants = Number(complexity.hotKeyWrites || 0) > 0
                ? totalParticipants
                : 0;
            const makeOfferMatch2 = String(parsed.func || '').match(/makeoffer_r(\\d+)(?:_(\\d+))?(?:_s\\d+)?$/i);
            if (makeOfferMatch2 && makeOfferMatch2[2]) {
                hotParticipants = Number(makeOfferMatch2[2]);
            }'''
)

# 4. Update hotParticipants logic inside line 1403 block
content = content.replace(
    "            hotParticipants: hotKeyWrites > 0 ? participantCount : 0,",
    '''            hotParticipants: (() => {
                const makeOfferMatch3 = String(row.functionName || '').match(/makeoffer_r(\\d+)(?:_(\\d+))?(?:_s\\d+)?$/i);
                if (makeOfferMatch3 && makeOfferMatch3[2]) {
                    return Number(makeOfferMatch3[2]);
                }
                return hotKeyWrites > 0 ? participantCount : 0;
            })(),'''
)

with open('/home/dhanish/fabric_2/caliper-bench_9/extractthroughput.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated extractthroughput.js")
