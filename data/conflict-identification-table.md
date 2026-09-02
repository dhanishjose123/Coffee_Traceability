# Conflict Identification Results

| Function | Target TPS | Load TPS | End-to-End TPS | Load sec | Wall sec | Drain sec | Avg Latency ms | P95 Latency ms | Success % | Failure % | Success | Failure | Queued | Skipped | Learned Keys | Conflict Keys |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| acceptOffer | 20 | 5.53 | 0 | 18.80 | 0 | 0 | 0 | 0 | 50 | 50 | 52 | 52 | 0 | 0 | 1 | acceptOffer:participant:farmers |
| makeOffer | 20 | 3.00 | 0 | 20.00 | 0 | 0 | 0 | 0 | 100 | 0 | 60 | 0 | 0 | 0 | 0 |  |
| packLotIntoPackets | 20 | 3 | 0 | 20 | 0 | 0 | 0 | 0 | 50 | 50 | 30 | 30 | 0 | 0 | 0 |  |
| purchasePacket | 20 | 2.20 | 0 | 20 | 0 | 0 | 0 | 0 | 50 | 50 | 22 | 22 | 0 | 0 | 1 | purchasePacket:participant:retailers |
| submitProduce | 20 | 1.95 | 0 | 21.49 | 0 | 0 | 0 | 0 | 50 | 50 | 21 | 21 | 0 | 0 | 1 | submitProduce:participant:aggregators |
| testCoffee | 20 | 1.40 | 0 | 20.00 | 0 | 0 | 0 | 0 | 50 | 50 | 14 | 14 | 0 | 0 | 0 |  |
