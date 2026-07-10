"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CisdEngine = void 0;
class CisdEngine {
    bearishPotentialLevels = [];
    bullishPotentialLevels = [];
    /**
     * Evaluates the candles array on the close of a 1m candle.
     * Returns a CisdOutput containing the signal direction and origin details.
     */
    evaluate(candles, cisdTolerance) {
        if (candles.length < 3) {
            return { signal: 0, originLevel: null, originIndex: null };
        }
        // Helper for accessing candles by offset from the end (Pine Script style close[i])
        const getCandle = (offset) => {
            return candles[candles.length - 1 - offset];
        };
        const current = getCandle(0);
        const prev = getCandle(1);
        // 1. Detect new Bearish CISD source candle
        // Pine: if close[1] < open[1] and close > open
        if (prev.close < prev.open && current.close > current.open) {
            this.bearishPotentialLevels.unshift({
                level: current.open,
                barIndex: current.barIndex,
            });
        }
        // 2. Detect new Bullish CISD source candle
        // Pine: if close[1] > open[1] and close < open
        if (prev.close > prev.open && current.close < current.open) {
            this.bullishPotentialLevels.unshift({
                level: current.open,
                barIndex: current.barIndex,
            });
        }
        let signal = 0;
        let originLevel = null;
        let originIndex = null;
        // 3. Bearish CISD Invalidation & Confirmation Loop
        if (this.bearishPotentialLevels.length > 0) {
            let continueBearLoop = true;
            while (continueBearLoop && this.bearishPotentialLevels.length > 0) {
                const candidate = this.bearishPotentialLevels[0];
                // Pine: if close < candidateLevel
                if (current.close < candidate.level) {
                    const barsFromCandidate = current.barIndex - candidate.barIndex;
                    // Find highestClose between candidate (inclusive) and current (inclusive)
                    let highestClose = 0;
                    for (let i = 0; i <= barsFromCandidate; i++) {
                        const c = getCandle(i);
                        if (c.close > highestClose) {
                            highestClose = c.close;
                        }
                    }
                    // Search backwards for the source candle's preceding bearish run to find sourceTop
                    let continueSourceSearch = true;
                    let sourceOffset = barsFromCandidate + 1;
                    let sourceTop = 0;
                    while (continueSourceSearch && sourceOffset < candles.length) {
                        const sourceCandle = getCandle(sourceOffset);
                        if (sourceCandle.close < sourceCandle.open) {
                            sourceTop = sourceCandle.open;
                            sourceOffset += 1;
                        }
                        else {
                            continueSourceSearch = false;
                        }
                    }
                    const denominator = sourceTop - candidate.level;
                    const validBearCisd = denominator !== 0 &&
                        (highestClose - candidate.level) / denominator > cisdTolerance;
                    if (validBearCisd) {
                        originLevel = candidate.level;
                        originIndex = candidate.barIndex;
                        // Clear potential levels list on successful confirmation
                        this.bearishPotentialLevels = [];
                        signal = 1;
                        continueBearLoop = false;
                    }
                    else {
                        // Noise - discard candidate and check next oldest candidate
                        this.bearishPotentialLevels.shift();
                    }
                }
                else {
                    // Current close did not cross below candidate level, keep candidate for future checks
                    continueBearLoop = false;
                }
            }
        }
        // 4. Bullish CISD Invalidation & Confirmation Loop
        if (this.bullishPotentialLevels.length > 0) {
            let continueBullLoop = true;
            while (continueBullLoop && this.bullishPotentialLevels.length > 0) {
                const candidate = this.bullishPotentialLevels[0];
                // Pine: if close > candidateLevel
                if (current.close > candidate.level) {
                    const barsFromCandidate = current.barIndex - candidate.barIndex;
                    // Find lowestClose between candidate (inclusive) and current (inclusive)
                    let lowestClose = current.close;
                    for (let i = 0; i <= barsFromCandidate; i++) {
                        const c = getCandle(i);
                        if (c.close < lowestClose) {
                            lowestClose = c.close;
                        }
                    }
                    // Search backwards for the source candle's preceding bullish run to find sourceBottom
                    let continueSourceSearch = true;
                    let sourceOffset = barsFromCandidate + 1;
                    let sourceBottom = 0;
                    while (continueSourceSearch && sourceOffset < candles.length) {
                        const sourceCandle = getCandle(sourceOffset);
                        if (sourceCandle.close > sourceCandle.open) {
                            sourceBottom = sourceCandle.open;
                            sourceOffset += 1;
                        }
                        else {
                            continueSourceSearch = false;
                        }
                    }
                    const denominator = candidate.level - sourceBottom;
                    const validBullCisd = denominator !== 0 &&
                        (candidate.level - lowestClose) / denominator > cisdTolerance;
                    if (validBullCisd) {
                        originLevel = candidate.level;
                        originIndex = candidate.barIndex;
                        // Clear potential levels list on successful confirmation
                        this.bullishPotentialLevels = [];
                        signal = 2;
                        continueBullLoop = false;
                    }
                    else {
                        // Noise - discard candidate and check next oldest candidate
                        this.bullishPotentialLevels.shift();
                    }
                }
                else {
                    // Current close did not cross above candidate level, keep candidate for future checks
                    continueBullLoop = false;
                }
            }
        }
        return { signal, originLevel, originIndex };
    }
    reset() {
        this.bearishPotentialLevels = [];
        this.bullishPotentialLevels = [];
    }
}
exports.CisdEngine = CisdEngine;
