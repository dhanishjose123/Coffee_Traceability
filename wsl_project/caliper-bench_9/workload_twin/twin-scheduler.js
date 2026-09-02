const http = require('http');

class TwinScheduler {
    constructor() {
        this.activeKeys = new Set();
        this.apiHost = 'localhost';
        this.apiPort = 5000;
        this.useTwin = process.env.TWIN_QUEUE_MODE === '1';
        
        // Caching predictions to reduce API spam
        this.lastPredictionTime = 0;
        this.cachedRisk = 0;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Calls the Python ML API to get the current risk score.
     */
    async getPredictedRisk(features) {
        // Cache prediction for 500ms to avoid overloading the API
        const now = Date.now();
        if (now - this.lastPredictionTime < 500) {
            return this.cachedRisk;
        }

        return new Promise((resolve) => {
            const data = JSON.stringify(features);

            const req = http.request({
                hostname: this.apiHost,
                port: this.apiPort,
                path: '/predict',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            }, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => { responseBody += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseBody);
                        this.cachedRisk = parsed.risk_score || 0;
                        this.lastPredictionTime = Date.now();
                        resolve(this.cachedRisk);
                    } catch (e) {
                        resolve(0); // If error, assume low risk to avoid hanging
                    }
                });
            });

            req.on('error', (e) => {
                // If the Python API is not running, fail gracefully and don't block
                // console.error(`[Twin API Error] ${e.message}`);
                resolve(0);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Submit a transaction through the admission controller queue.
     * @param {string} conflictKey The ledger key this transaction modifies.
     * @param {object} features Network features for the ML model.
     * @param {function} submitFn The actual gateway submit function.
     */
    async submit(conflictKey, features, submitFn) {
        if (!this.useTwin) {
            // Baseline: No Queue, No Prediction
            return await submitFn();
        }

        // We ignore conflictKey – only risk‑based throttling is applied now
        const risk = await this.getPredictedRisk(features);
        if (risk > 0.4) {
            // High risk of MVCC / timeout: add a noticeable delay
            await this.sleep(100 + (risk * 200)); // ~180‑300 ms
        } else if (risk > 0.15) {
            // Moderate risk: small spacing
            await this.sleep(50);
        }
        // Directly submit without any local key lock
        return await submitFn();
    }
}

// Export a singleton instance so state is shared across calls in the same worker
const scheduler = new TwinScheduler();
module.exports = scheduler;
