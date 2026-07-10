"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SweepEngine = void 0;
class SweepEngine {
    /**
     * Run bearish sweep detection on completed HTF (15m) candles.
     * sweepCandle corresponds to htfCandles[htfCandles.length - 1] (Pine's [1])
     * Candidates are from index htfCandles.length - 2 back to htfCandles.length - (lookback + 1)
     */
    static findConfirmedBearSweep(htfCandles, lookback, requireReclaim) {
        const result = {
            found: false,
            direction: null,
            level: null,
            sourceTime: null,
            sourceIndex: null,
            sweepCandleOpenTime: null,
            sweepCandleCloseTime: null,
        };
        if (htfCandles.length <= lookback + 1) {
            return result;
        }
        const sweepCandle = htfCandles[htfCandles.length - 1];
        for (let i = 2; i <= lookback + 1; i++) {
            const candidateIndexInArray = htfCandles.length - i;
            if (candidateIndexInArray < 0)
                break;
            const candidateCandle = htfCandles[candidateIndexInArray];
            const candidateHigh = candidateCandle.high;
            let untouched = true;
            if (i > 2) {
                for (let j = 2; j < i; j++) {
                    const intermediateCandle = htfCandles[htfCandles.length - j];
                    if (intermediateCandle.high > candidateHigh) {
                        untouched = false;
                        break;
                    }
                }
            }
            const wickTaken = sweepCandle.high > candidateHigh;
            const reclaimValid = !requireReclaim || sweepCandle.close < candidateHigh;
            if (untouched && wickTaken && reclaimValid) {
                result.found = true;
                result.direction = 'bearish';
                result.level = candidateHigh;
                result.sourceTime = candidateCandle.time;
                result.sourceIndex = candidateCandle.barIndex;
                result.sweepCandleOpenTime = sweepCandle.time;
                result.sweepCandleCloseTime = sweepCandle.time + 15 * 60 * 1000;
                break; // Stop at first/closest candidate found, matching Pine behavior
            }
        }
        return result;
    }
    /**
     * Run bullish sweep detection on completed HTF (15m) candles.
     */
    static findConfirmedBullSweep(htfCandles, lookback, requireReclaim) {
        const result = {
            found: false,
            direction: null,
            level: null,
            sourceTime: null,
            sourceIndex: null,
            sweepCandleOpenTime: null,
            sweepCandleCloseTime: null,
        };
        if (htfCandles.length <= lookback + 1) {
            return result;
        }
        const sweepCandle = htfCandles[htfCandles.length - 1];
        for (let i = 2; i <= lookback + 1; i++) {
            const candidateIndexInArray = htfCandles.length - i;
            if (candidateIndexInArray < 0)
                break;
            const candidateCandle = htfCandles[candidateIndexInArray];
            const candidateLow = candidateCandle.low;
            let untouched = true;
            if (i > 2) {
                for (let j = 2; j < i; j++) {
                    const intermediateCandle = htfCandles[htfCandles.length - j];
                    if (intermediateCandle.low < candidateLow) {
                        untouched = false;
                        break;
                    }
                }
            }
            const wickTaken = sweepCandle.low < candidateLow;
            const reclaimValid = !requireReclaim || sweepCandle.close > candidateLow;
            if (untouched && wickTaken && reclaimValid) {
                result.found = true;
                result.direction = 'bullish';
                result.level = candidateLow;
                result.sourceTime = candidateCandle.time;
                result.sourceIndex = candidateCandle.barIndex;
                result.sweepCandleOpenTime = sweepCandle.time;
                result.sweepCandleCloseTime = sweepCandle.time + 15 * 60 * 1000;
                break; // Stop at first/closest candidate found, matching Pine behavior
            }
        }
        return result;
    }
}
exports.SweepEngine = SweepEngine;
exports.default = SweepEngine;
