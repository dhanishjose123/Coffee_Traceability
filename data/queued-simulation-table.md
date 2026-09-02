# Queued Digital Twin Simulation Results

| Function | Target TPS | Load TPS | End-to-End TPS | Load sec | Wall sec | Drain sec | Avg Latency ms | P95 Latency ms | Success % | Failure % | Success | Failure | Queued | Skipped | Learned Keys | Conflict Keys |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| acceptOffer | 200 | 197.63 | 2.07 | 2.53 | 242.07 | 239.54 | 2192.95 | 2331 | 100 | 0 | 500 | 0 | 491 | 0 | 2 | acceptOffer:participant:farmers; acceptOffer:participant:retailers |
| makeOffer | 200 | 198.81 | 0.45 | 2.52 | 1103.21 | 1100.70 | 2148.16 | 2581 | 100 | 0 | 500 | 0 | 498 | 0 | 1 | makeOffer:lot |
| purchasePacket | 200 | 196.16 | 1.88 | 2.52 | 265.99 | 263.46 | 2055.10 | 2089.87 | 100 | 0 | 500 | 0 | 490 | 0 | 3 | purchasePacket:packet; purchasePacket:participant:consumers; purchasePacket:participant:retailers |
| submitProduce | 200 | 195.08 | 1.98 | 2.56 | 252.38 | 249.82 | 2126.67 | 2112 | 100 | 0 | 500 | 0 | 491 | 0 | 2 | submitProduce:participant:aggregators; submitProduce:participant:farmers |
