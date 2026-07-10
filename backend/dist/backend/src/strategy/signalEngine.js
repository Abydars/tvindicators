"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalEngine = exports.SignalEngine = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const cisdEngine_1 = require("./cisdEngine");
const sweepEngine_1 = require("./sweepEngine");
const sessionFilter_1 = require("../market/sessionFilter");
const sqlite_1 = require("../db/sqlite");
class SignalEngine extends events_1.EventEmitter {
    cisdEngine = new cisdEngine_1.CisdEngine();
    settings;
    // Track strategy states
    bullishCisdSeenCurrent = false;
    bearishCisdSeenCurrent = false;
    bullishCisdSignalBarCurrent = null;
    bearishCisdSignalBarCurrent = null;
    bullishCisdOriginBarCurrent = null;
    bearishCisdOriginBarCurrent = null;
    bullishCisdLevelCurrent = null;
    bearishCisdLevelCurrent = null;
    // Closed states from completed HTF candle
    closedHtfCisd = {
        bullishCisdSeen: false,
        bearishCisdSeen: false,
        bullishCisdSignalBar: null,
        bearishCisdSignalBar: null,
        bullishCisdOriginBar: null,
        bearishCisdOriginBar: null,
        bullishCisdLevel: null,
        bearishCisdLevel: null,
    };
    signals = [];
    drawings = [];
    constructor() {
        super();
        this.setDefaults();
    }
    setDefaults() {
        this.settings = {
            cisdTolerance: 0.7,
            sweepTimeframe: '15m',
            sweepLookback: 15,
            requireSweepReclaim: false,
            sessionTimezone: 'Asia/Karachi',
            sessionOne: '12:00-14:00',
            sessionTwo: '18:00-19:30',
            showSignalSweeps: true,
            showSignalCisdLevels: true,
            showEntrySignals: true,
        };
    }
    async initialize() {
        const saved = await sqlite_1.db.getSettings();
        if (saved) {
            this.settings = saved;
            console.log('[Signal Engine] Settings loaded from database.');
        }
        else {
            await sqlite_1.db.saveSettings(this.settings);
            console.log('[Signal Engine] Saved default settings to database.');
        }
        // Load saved historical signals
        this.signals = await sqlite_1.db.getSignals();
        this.regenerateDrawingsFromSignals();
        console.log(`[Signal Engine] Loaded ${this.signals.length} signals and regenerated drawings.`);
    }
    getSettings() {
        return this.settings;
    }
    async updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        await sqlite_1.db.saveSettings(this.settings);
        this.emit('settingsUpdated', this.settings);
    }
    getSignals() {
        return [...this.signals];
    }
    getDrawings() {
        return [...this.drawings];
    }
    clearSignals() {
        return new Promise((resolve, reject) => {
            sqlite_1.db.run('DELETE FROM signals')
                .then(() => {
                sqlite_1.db.run('DELETE FROM paper_trades').then(() => {
                    this.signals = [];
                    this.drawings = [];
                    this.resetState();
                    this.emit('reset');
                    resolve();
                });
            })
                .catch(reject);
        });
    }
    resetState() {
        this.cisdEngine.reset();
        this.bullishCisdSeenCurrent = false;
        this.bearishCisdSeenCurrent = false;
        this.bullishCisdSignalBarCurrent = null;
        this.bearishCisdSignalBarCurrent = null;
        this.bullishCisdOriginBarCurrent = null;
        this.bearishCisdOriginBarCurrent = null;
        this.bullishCisdLevelCurrent = null;
        this.bearishCisdLevelCurrent = null;
        this.closedHtfCisd = {
            bullishCisdSeen: false,
            bearishCisdSeen: false,
            bullishCisdSignalBar: null,
            bearishCisdSignalBar: null,
            bullishCisdOriginBar: null,
            bearishCisdOriginBar: null,
            bullishCisdLevel: null,
            bearishCisdLevel: null,
        };
    }
    /**
     * Run the strategy engine on historical 1m candles.
     * This is used to warm up signals and drawings so they populate instantly on load.
     */
    runHistoryWarmup(m1Candles, htfCandles) {
        console.log('[Signal Engine] Running historical strategy warmup...');
        this.resetState();
        // We iterate through completed 1m candles and simulate their closing.
        // To do this correctly, we simulate the htf boundaries.
        const htfBuckets = {};
        for (const htf of htfCandles) {
            htfBuckets[htf.time] = [];
        }
        // Map 1m candles to their respective 15m closed buckets
        for (const m1 of m1Candles) {
            const htfTime = Math.floor(m1.time / (15 * 60 * 1000)) * (15 * 60 * 1000);
            if (htfBuckets[htfTime]) {
                htfBuckets[htfTime].push(m1);
            }
        }
        const sortedHtfTimes = Object.keys(htfBuckets).map(Number).sort((a, b) => a - b);
        const processedM1Candles = [];
        const processedHtfCandles = [];
        for (let hIndex = 0; hIndex < sortedHtfTimes.length; hIndex++) {
            const htfTime = sortedHtfTimes[hIndex];
            const m1s = htfBuckets[htfTime];
            // Simulate each 1m candle in this 15m bucket
            for (let mIndex = 0; mIndex < m1s.length; mIndex++) {
                const m1 = m1s[mIndex];
                processedM1Candles.push(m1);
                // Run CISD evaluation on the closed 1m candle
                this.process1mCandleClose(processedM1Candles);
                // If it's the last 1m candle of the 15m bucket, we simulate the 15m candle close!
                const isHtfEnd = mIndex === m1s.length - 1;
                if (isHtfEnd) {
                    // Push completed 15m candle
                    const htfCandle = htfCandles.find(c => c.time === htfTime);
                    if (htfCandle) {
                        processedHtfCandles.push(htfCandle);
                        this.process15mCandleClose(processedHtfCandles, processedM1Candles, htfCandle);
                    }
                }
            }
        }
        console.log(`[Signal Engine] Warmup complete. Calculated ${this.signals.length} signals.`);
    }
    /**
     * Process a closed 1m candle.
     */
    handle1mCandleClose(allCompletedM1) {
        this.process1mCandleClose(allCompletedM1);
    }
    process1mCandleClose(candles) {
        if (candles.length < 2)
            return;
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        // Check if inside Pakistan Session
        const inSession = sessionFilter_1.SessionFilter.isInPakistanSession(current.time);
        // Evaluate CISD engine
        const cisd = this.cisdEngine.evaluate(candles, this.settings.cisdTolerance);
        // Store first bullish CISD inside the developing HTF candle
        if (inSession && cisd.signal === 2 && !this.bullishCisdSeenCurrent) {
            this.bullishCisdSeenCurrent = true;
            this.bullishCisdSignalBarCurrent = current.barIndex;
            this.bullishCisdOriginBarCurrent = cisd.originIndex;
            this.bullishCisdLevelCurrent = cisd.originLevel;
        }
        // Store first bearish CISD inside the developing HTF candle
        if (inSession && cisd.signal === 1 && !this.bearishCisdSeenCurrent) {
            this.bearishCisdSeenCurrent = true;
            this.bearishCisdSignalBarCurrent = current.barIndex;
            this.bearishCisdOriginBarCurrent = cisd.originIndex;
            this.bearishCisdLevelCurrent = cisd.originLevel;
        }
        // Detect session ended
        if (sessionFilter_1.SessionFilter.didSessionJustEnd(prev.time, current.time)) {
            this.bullishCisdSeenCurrent = false;
            this.bearishCisdSeenCurrent = false;
            this.bullishCisdSignalBarCurrent = null;
            this.bearishCisdSignalBarCurrent = null;
            this.bullishCisdOriginBarCurrent = null;
            this.bearishCisdOriginBarCurrent = null;
            this.bullishCisdLevelCurrent = null;
            this.bearishCisdLevelCurrent = null;
        }
    }
    /**
     * Process a completed 15m candle.
     */
    handle15mCandleClose(allCompletedHTF, allCompletedM1, closedHtfCandle) {
        this.process15mCandleClose(allCompletedHTF, allCompletedM1, closedHtfCandle);
    }
    process15mCandleClose(htfCandles, m1Candles, closedHtfCandle) {
        // 1. Copy developing state to closed state
        this.closedHtfCisd = {
            bullishCisdSeen: this.bullishCisdSeenCurrent,
            bearishCisdSeen: this.bearishCisdSeenCurrent,
            bullishCisdSignalBar: this.bullishCisdSignalBarCurrent,
            bearishCisdSignalBar: this.bearishCisdSignalBarCurrent,
            bullishCisdOriginBar: this.bullishCisdOriginBarCurrent,
            bearishCisdOriginBar: this.bearishCisdOriginBarCurrent,
            bullishCisdLevel: this.bullishCisdLevelCurrent,
            bearishCisdLevel: this.bearishCisdLevelCurrent,
        };
        // 2. Reset developing states for the next period
        this.bullishCisdSeenCurrent = false;
        this.bearishCisdSeenCurrent = false;
        this.bullishCisdSignalBarCurrent = null;
        this.bearishCisdSignalBarCurrent = null;
        this.bullishCisdOriginBarCurrent = null;
        this.bearishCisdOriginBarCurrent = null;
        this.bullishCisdLevelCurrent = null;
        this.bearishCisdLevelCurrent = null;
        // 3. Evaluate sweep conditions on closed 15m candles
        const confirmedBullSweep = sweepEngine_1.SweepEngine.findConfirmedBullSweep(htfCandles, this.settings.sweepLookback, this.settings.requireSweepReclaim);
        const confirmedBearSweep = sweepEngine_1.SweepEngine.findConfirmedBearSweep(htfCandles, this.settings.sweepLookback, this.settings.requireSweepReclaim);
        // 4. Combine sweep & CISD entries
        const longEntry = confirmedBullSweep.found &&
            this.closedHtfCisd.bullishCisdSeen &&
            this.closedHtfCisd.bullishCisdSignalBar !== null &&
            this.closedHtfCisd.bullishCisdLevel !== null;
        const shortEntry = confirmedBearSweep.found &&
            this.closedHtfCisd.bearishCisdSeen &&
            this.closedHtfCisd.bearishCisdSignalBar !== null &&
            this.closedHtfCisd.bearishCisdLevel !== null;
        if (longEntry && confirmedBullSweep.level !== null && confirmedBullSweep.sourceTime !== null) {
            this.triggerSignal('long', closedHtfCandle, // The candle that just closed
            confirmedBullSweep, this.closedHtfCisd.bullishCisdLevel, this.closedHtfCisd.bullishCisdOriginBar, this.closedHtfCisd.bullishCisdSignalBar, m1Candles);
        }
        else if (shortEntry && confirmedBearSweep.level !== null && confirmedBearSweep.sourceTime !== null) {
            this.triggerSignal('short', closedHtfCandle, // The candle that just closed
            confirmedBearSweep, this.closedHtfCisd.bearishCisdLevel, this.closedHtfCisd.bearishCisdOriginBar, this.closedHtfCisd.bearishCisdSignalBar, m1Candles);
        }
    }
    triggerSignal(direction, completedHtfCandle, sweep, cisdLevel, cisdOriginBar, cisdSignalBar, m1Candles) {
        const signalTime = completedHtfCandle.time + 15 * 60 * 1000; // open of next 15m candle / current 1m candle time
        // Find entry price (open of the signal candle, which is close of completed 1m candle)
        const lastM1 = m1Candles[m1Candles.length - 1];
        const entryPrice = lastM1.close;
        const signal = {
            id: (0, uuid_1.v4)(),
            symbol: 'XAU_USD',
            direction,
            signalTime,
            signalBarIndex: lastM1.barIndex + 1, // first bar index of the new candle
            entryPrice,
            sweep: {
                level: sweep.level,
                sourceTime: sweep.sourceTime,
                completedSweepCandleOpenTime: sweep.sweepCandleOpenTime,
            },
            cisd: {
                level: cisdLevel,
                originBar: cisdOriginBar,
                signalBar: cisdSignalBar,
            },
        };
        // Save signal to database (async)
        sqlite_1.db.saveSignal(signal).catch((err) => console.error('Failed to save signal to SQLite:', err));
        // Save in memory
        this.signals.push(signal);
        // Generate drawings
        const drawings = this.createDrawingsForSignal(signal, m1Candles);
        this.drawings.push(...drawings);
        // Emit event
        this.emit('signal', signal, drawings);
    }
    createDrawingsForSignal(signal, m1Candles) {
        const drawings = [];
        const isLong = signal.direction === 'long';
        // 1. Sweep Line Drawing (x1 = sourceTime, x2 = completedSweepCandleOpenTime, y1/y2 = sweepLevel)
        if (this.settings.showSignalSweeps) {
            drawings.push({
                id: (0, uuid_1.v4)(),
                signalId: signal.id,
                type: 'line',
                x1: signal.sweep.sourceTime,
                y1: signal.sweep.level,
                x2: signal.sweep.completedSweepCandleOpenTime,
                y2: signal.sweep.level,
                color: isLong ? '#00ffff' : '#ff0000', // Aqua for Bullish, Red for Bearish
                width: 2,
            });
        }
        // 2. CISD Line Drawing
        if (this.settings.showSignalCisdLevels) {
            // Find the timestamps matching cisd.originBar and cisd.signalBar in m1Candles
            const originCandle = m1Candles.find((c) => c.barIndex === signal.cisd.originBar);
            const signalCandle = m1Candles.find((c) => c.barIndex === signal.cisd.signalBar);
            if (originCandle && signalCandle) {
                drawings.push({
                    id: (0, uuid_1.v4)(),
                    signalId: signal.id,
                    type: 'line',
                    x1: originCandle.time,
                    y1: signal.cisd.level,
                    x2: signalCandle.time,
                    y2: signal.cisd.level,
                    color: isLong ? '#00ffbb' : '#ff1100', // CISD Colors
                    width: 3,
                });
            }
        }
        // 3. Entry Marker Drawing
        if (this.settings.showEntrySignals) {
            drawings.push({
                id: (0, uuid_1.v4)(),
                signalId: signal.id,
                type: 'marker',
                x: signal.signalTime,
                y: signal.entryPrice,
                text: isLong ? 'LONG' : 'SHORT',
                position: isLong ? 'belowBar' : 'aboveBar',
                color: isLong ? '#00ff00' : '#ff0000',
            });
        }
        return drawings;
    }
    regenerateDrawingsFromSignals() {
        this.drawings = [];
        // Sort signals by time
        const sorted = [...this.signals].sort((a, b) => a.signalTime - b.signalTime);
        for (const signal of sorted) {
            const isLong = signal.direction === 'long';
            // Sweep lines
            if (this.settings.showSignalSweeps) {
                this.drawings.push({
                    id: (0, uuid_1.v4)(),
                    signalId: signal.id,
                    type: 'line',
                    x1: signal.sweep.sourceTime,
                    y1: signal.sweep.level,
                    x2: signal.sweep.completedSweepCandleOpenTime,
                    y2: signal.sweep.level,
                    color: isLong ? '#00ffff' : '#ff0000',
                    width: 2,
                });
            }
            // CISD Lines
            if (this.settings.showSignalCisdLevels) {
                // We approximate the start and end of the CISD line based on timestamps
                // Since we don't have all 1m historical candles here, we can approximate the bar indices.
                // But to make it precise, we can use the signal's completed sweep candle time
                // and signalTime.
                // Origin bar was at index signal.cisd.originBar, signal bar was at index signal.cisd.signalBar.
                // Let's approximate the times:
                // signalTime - (signalBar - originBar) * 60 * 1000
                const signalBarTime = signal.signalTime - 60000; // the 1m candle before signalTime is the CISD signal candle
                const originBarTime = signalBarTime - (signal.cisd.signalBar - signal.cisd.originBar) * 60000;
                this.drawings.push({
                    id: (0, uuid_1.v4)(),
                    signalId: signal.id,
                    type: 'line',
                    x1: originBarTime,
                    y1: signal.cisd.level,
                    x2: signalBarTime,
                    y2: signal.cisd.level,
                    color: isLong ? '#00ffbb' : '#ff1100',
                    width: 3,
                });
            }
            // Marker
            if (this.settings.showEntrySignals) {
                this.drawings.push({
                    id: (0, uuid_1.v4)(),
                    signalId: signal.id,
                    type: 'marker',
                    x: signal.signalTime,
                    y: signal.entryPrice,
                    text: isLong ? 'LONG' : 'SHORT',
                    position: isLong ? 'belowBar' : 'aboveBar',
                    color: isLong ? '#00ff00' : '#ff0000',
                });
            }
        }
    }
}
exports.SignalEngine = SignalEngine;
exports.signalEngine = new SignalEngine();
exports.default = exports.signalEngine;
