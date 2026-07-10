"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.htfAggregator = exports.HtfAggregator = void 0;
const events_1 = require("events");
const client_1 = __importDefault(require("../oanda/client"));
class HtfAggregator extends events_1.EventEmitter {
    candles = [];
    currentCandle = null;
    currentHTFTime = 0;
    constructor() {
        super();
    }
    async initialize(m1Candles) {
        try {
            const history = await client_1.default.getCandles(undefined, 'M15', 200);
            this.candles = history;
            if (this.candles.length > 0) {
                const last = this.candles[this.candles.length - 1];
                this.currentHTFTime = last.time;
                // Initialize developing 15m candle
                this.currentCandle = {
                    time: this.currentHTFTime + 15 * 60 * 1000,
                    open: last.close,
                    high: last.close,
                    low: last.close,
                    close: last.close,
                    volume: 0,
                    complete: false,
                    barIndex: last.barIndex + 1,
                };
                this.currentHTFTime = this.currentCandle.time;
            }
            console.log(`[HTF Aggregator] Initialized with ${this.candles.length} historical M15 candles.`);
        }
        catch (e) {
            console.warn('[HTF Aggregator] Failed to fetch M15 history. Building from M1 candles...');
            this.aggregateFromM1History(m1Candles);
        }
    }
    getCandles() {
        return [...this.candles];
    }
    getCurrentCandle() {
        return this.currentCandle;
    }
    handleM1Close(m1Candle) {
        const htfOpenTime = Math.floor(m1Candle.time / (15 * 60 * 1000)) * (15 * 60 * 1000);
        if (!this.currentCandle) {
            this.currentCandle = {
                time: htfOpenTime,
                open: m1Candle.open,
                high: m1Candle.high,
                low: m1Candle.low,
                close: m1Candle.close,
                volume: m1Candle.volume,
                complete: false,
                barIndex: this.candles.length,
            };
            this.currentHTFTime = htfOpenTime;
            this.emit('update', this.currentCandle);
            return;
        }
        if (htfOpenTime === this.currentHTFTime) {
            // Update developing 15m candle
            this.currentCandle.close = m1Candle.close;
            if (m1Candle.high > this.currentCandle.high)
                this.currentCandle.high = m1Candle.high;
            if (m1Candle.low < this.currentCandle.low)
                this.currentCandle.low = m1Candle.low;
            this.currentCandle.volume += m1Candle.volume;
            this.emit('update', this.currentCandle);
        }
        else if (htfOpenTime > this.currentHTFTime) {
            // Finalize current 15m candle
            this.currentCandle.complete = true;
            this.candles.push(this.currentCandle);
            const finalized = this.currentCandle;
            if (this.candles.length > 1000) {
                this.candles.shift();
            }
            // Start new developing 15m candle
            this.currentCandle = {
                time: htfOpenTime,
                open: m1Candle.open,
                high: m1Candle.high,
                low: m1Candle.low,
                close: m1Candle.close,
                volume: m1Candle.volume,
                complete: false,
                barIndex: finalized.barIndex + 1,
            };
            this.currentHTFTime = htfOpenTime;
            // Emit close of previous and update of new
            this.emit('close', finalized);
            this.emit('update', this.currentCandle);
        }
    }
    // Injection helper for replay
    injectClosedHTFCandle(candle) {
        this.candles.push(candle);
        this.currentHTFTime = candle.time;
        if (this.candles.length > 1000) {
            this.candles.shift();
        }
        this.emit('close', candle);
    }
    aggregateFromM1History(m1Candles) {
        const buckets = {};
        for (const c of m1Candles) {
            const htfOpenTime = Math.floor(c.time / (15 * 60 * 1000)) * (15 * 60 * 1000);
            if (!buckets[htfOpenTime])
                buckets[htfOpenTime] = [];
            buckets[htfOpenTime].push(c);
        }
        const sortedTimes = Object.keys(buckets).map(Number).sort((a, b) => a - b);
        this.candles = [];
        // Filter out the last bucket if it's incomplete (less than 15 M1 candles)
        // to keep historical list clean of partial candles.
        for (let i = 0; i < sortedTimes.length; i++) {
            const t = sortedTimes[i];
            const list = buckets[t];
            const open = list[0].open;
            const close = list[list.length - 1].close;
            const high = Math.max(...list.map(c => c.high));
            const low = Math.min(...list.map(c => c.low));
            const volume = list.reduce((sum, c) => sum + c.volume, 0);
            this.candles.push({
                time: t,
                open,
                high,
                low,
                close,
                volume,
                complete: true,
                barIndex: i,
            });
        }
        if (this.candles.length > 0) {
            this.currentHTFTime = this.candles[this.candles.length - 1].time;
        }
    }
    reset() {
        this.candles = [];
        this.currentCandle = null;
        this.currentHTFTime = 0;
    }
}
exports.HtfAggregator = HtfAggregator;
exports.htfAggregator = new HtfAggregator();
exports.default = exports.htfAggregator;
