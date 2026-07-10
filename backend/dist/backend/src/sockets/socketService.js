"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const m1CandleBuilder_1 = require("../market/m1CandleBuilder");
const htfAggregator_1 = require("../market/htfAggregator");
const signalEngine_1 = require("../strategy/signalEngine");
const paperTradeEngine_1 = require("../strategy/paperTradeEngine");
class SocketService {
    io;
    initialize(server) {
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: '*', // Allow all origins for dev/local execution
                methods: ['GET', 'POST'],
            },
        });
        this.io.on('connection', (socket) => {
            console.log(`[Socket] Client connected: ${socket.id}`);
            // Send the entire warm environment on first connect
            socket.emit('candles:initial', {
                m1Candles: m1CandleBuilder_1.m1CandleBuilder.getCandles(),
                m15Candles: htfAggregator_1.htfAggregator.getCandles(),
                currentM1: m1CandleBuilder_1.m1CandleBuilder.getCurrentCandle(),
                currentM15: htfAggregator_1.htfAggregator.getCurrentCandle(),
                signals: signalEngine_1.signalEngine.getSignals(),
                drawings: signalEngine_1.signalEngine.getDrawings(),
                openTrades: paperTradeEngine_1.paperTradeEngine.getOpenTrades(),
                completedTrades: paperTradeEngine_1.paperTradeEngine.getCompletedTrades(),
                settings: signalEngine_1.signalEngine.getSettings(),
            });
            // Handle custom settings updates from user
            socket.on('settings:update', async (settings) => {
                try {
                    console.log('[Socket] Settings update request received:', settings);
                    await signalEngine_1.signalEngine.updateSettings(settings);
                }
                catch (err) {
                    console.error('[Socket] Failed to update settings:', err.message);
                }
            });
            // Reset strategy stats (signals, paper trades)
            socket.on('strategy:reset', async () => {
                try {
                    console.log('[Socket] Resetting strategy execution records...');
                    await signalEngine_1.signalEngine.clearSignals();
                    await paperTradeEngine_1.paperTradeEngine.clearTrades();
                    // Let client know to reload layout
                    socket.emit('strategy:reset_done');
                    this.io.emit('candles:initial', {
                        m1Candles: m1CandleBuilder_1.m1CandleBuilder.getCandles(),
                        m15Candles: htfAggregator_1.htfAggregator.getCandles(),
                        currentM1: m1CandleBuilder_1.m1CandleBuilder.getCurrentCandle(),
                        currentM15: htfAggregator_1.htfAggregator.getCurrentCandle(),
                        signals: [],
                        drawings: [],
                        openTrades: [],
                        completedTrades: [],
                        settings: signalEngine_1.signalEngine.getSettings(),
                    });
                }
                catch (err) {
                    console.error('[Socket] Failed to reset strategy:', err.message);
                }
            });
            socket.on('disconnect', () => {
                console.log(`[Socket] Client disconnected: ${socket.id}`);
            });
        });
        // Wire up backend event broadcasters to emit live updates
        m1CandleBuilder_1.m1CandleBuilder.on('update', (candle) => {
            this.io.emit('candle:update', candle);
        });
        m1CandleBuilder_1.m1CandleBuilder.on('close', (candle) => {
            this.io.emit('candle:closed', candle);
        });
        signalEngine_1.signalEngine.on('signal', (signal, drawings) => {
            this.io.emit('signal:new', signal);
            for (const d of drawings) {
                this.io.emit('drawing:new', d);
            }
        });
        signalEngine_1.signalEngine.on('settingsUpdated', (settings) => {
            this.io.emit('settings:updated', settings);
        });
        paperTradeEngine_1.paperTradeEngine.on('tradeOpened', (trade) => {
            this.io.emit('trade:new', trade);
        });
        paperTradeEngine_1.paperTradeEngine.on('tradeClosed', (trade) => {
            this.io.emit('trade:closed', trade);
        });
    }
    broadcast(event, data) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }
}
exports.SocketService = SocketService;
exports.socketService = new SocketService();
exports.default = exports.socketService;
