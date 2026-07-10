"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingStream = exports.PricingStream = void 0;
const events_1 = require("events");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
class PricingStream extends events_1.EventEmitter {
    active = false;
    mockInterval = null;
    abortController = null;
    reconnectTimeout = null;
    lastPrice = 2350.0;
    constructor() {
        super();
    }
    start() {
        if (this.active)
            return;
        this.active = true;
        const isMock = config_1.config.oanda.useMockStream || !config_1.config.oanda.apiKey || !config_1.config.oanda.accountId;
        if (isMock) {
            console.log('[Pricing Stream] Starting Mock Stream...');
            this.startMockStream();
        }
        else {
            console.log('[Pricing Stream] Starting OANDA Live Stream...');
            this.startOandaStream();
        }
    }
    stop() {
        this.active = false;
        if (this.mockInterval) {
            clearInterval(this.mockInterval);
            this.mockInterval = null;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        console.log('[Pricing Stream] Stopped.');
    }
    startMockStream() {
        // Generate a mock price tick every 1000ms
        this.mockInterval = setInterval(() => {
            if (!this.active)
                return;
            const spread = 0.15; // 15 cents spread
            const change = (Math.random() - 0.5) * 0.4; // random tick fluctuation
            const mid = parseFloat((this.lastPrice + change).toFixed(2));
            const bid = parseFloat((mid - spread / 2).toFixed(2));
            const ask = parseFloat((mid + spread / 2).toFixed(2));
            this.lastPrice = mid;
            const tick = {
                instrument: config_1.config.oanda.instrument,
                time: new Date().toISOString(),
                timestamp: Date.now(),
                bid,
                ask,
                mid,
            };
            this.emit('tick', tick);
        }, 1000);
    }
    async startOandaStream() {
        this.abortController = new AbortController();
        const url = `${(0, config_1.getOandaStreamUrl)()}/v3/accounts/${config_1.config.oanda.accountId}/pricing/stream`;
        try {
            const response = await (0, axios_1.default)({
                method: 'get',
                url,
                headers: {
                    Authorization: `Bearer ${config_1.config.oanda.apiKey}`,
                },
                params: {
                    instruments: config_1.config.oanda.instrument,
                },
                responseType: 'stream',
                signal: this.abortController.signal,
            });
            console.log('[Pricing Stream] OANDA connection established successfully.');
            let buffer = '';
            response.data.on('data', (chunk) => {
                if (!this.active)
                    return;
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                // Keep the last (incomplete) line in the buffer
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    this.parseStreamLine(line);
                }
            });
            response.data.on('end', () => {
                console.warn('[Pricing Stream] OANDA stream ended by server. Reconnecting...');
                this.handleReconnect();
            });
            response.data.on('error', (err) => {
                console.error('[Pricing Stream] Stream error:', err.message);
                this.handleReconnect();
            });
        }
        catch (error) {
            if (error.name === 'CanceledError' || error.name === 'AbortError') {
                return; // normal stop
            }
            console.error('[Pricing Stream] Failed to connect to OANDA stream:', error.message);
            this.handleReconnect();
        }
    }
    parseStreamLine(line) {
        try {
            const data = JSON.parse(line);
            if (data.type === 'PRICE') {
                const bid = parseFloat(data.bids[0].price);
                const ask = parseFloat(data.asks[0].price);
                const mid = parseFloat(((bid + ask) / 2).toFixed(2));
                const tick = {
                    instrument: data.instrument,
                    time: data.time,
                    timestamp: new Date(data.time).getTime(),
                    bid,
                    ask,
                    mid,
                };
                this.emit('tick', tick);
            }
            else if (data.type === 'HEARTBEAT') {
                // Heartbeats are sent to keep connection alive
                this.emit('heartbeat', data);
            }
        }
        catch (e) {
            // JSON parse error (could be an incomplete line)
        }
    }
    handleReconnect() {
        if (!this.active)
            return;
        this.stop();
        this.active = true; // allow reconnection
        console.log('[Pricing Stream] Scheduling reconnection in 5 seconds...');
        this.reconnectTimeout = setTimeout(() => {
            this.start();
        }, 5000);
    }
}
exports.PricingStream = PricingStream;
exports.pricingStream = new PricingStream();
exports.default = exports.pricingStream;
