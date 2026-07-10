"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const config_1 = require("./config");
const sqlite_1 = require("./db/sqlite");
const m1CandleBuilder_1 = require("./market/m1CandleBuilder");
const htfAggregator_1 = require("./market/htfAggregator");
const signalEngine_1 = require("./strategy/signalEngine");
const paperTradeEngine_1 = require("./strategy/paperTradeEngine");
const pricingStream_1 = require("./oanda/pricingStream");
const socketService_1 = require("./sockets/socketService");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        time: new Date().toISOString(),
        oandaEnv: config_1.config.oanda.env,
        instrument: config_1.config.oanda.instrument,
        mockMode: config_1.config.oanda.useMockStream || !config_1.config.oanda.apiKey,
    });
});
// CSV Export Endpoint for paper trades
app.get('/api/trades/export', async (req, res) => {
    try {
        const trades = await sqlite_1.db.getPaperTrades();
        let csv = 'ID,SignalID,Symbol,Direction,EntryTime,EntryPrice,StopLoss,TakeProfit1,TakeProfit2,Status,Result,ExitTime,ExitPrice,RMultiple\n';
        for (const t of trades) {
            csv += `"${t.id}","${t.signalId}","${t.symbol}","${t.direction}","${new Date(t.entryTime).toISOString()}",${t.entryPrice},${t.stopLoss},${t.takeProfit1 || ''},${t.takeProfit2 || ''},"${t.status}","${t.result || ''}","${t.exitTime ? new Date(t.exitTime).toISOString() : ''}",${t.exitPrice || ''},${t.rMultiple !== undefined ? t.rMultiple : ''}\n`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=paper_trades.csv');
        res.status(200).send(csv);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
async function bootstrap() {
    console.log('[Server] Initializing modules...');
    // 1. Initialize DB and Strategy Engines
    await sqlite_1.db.init();
    await signalEngine_1.signalEngine.initialize();
    await paperTradeEngine_1.paperTradeEngine.initialize();
    // 2. Initialize candle aggregators with historical candles
    await m1CandleBuilder_1.m1CandleBuilder.initialize();
    await htfAggregator_1.htfAggregator.initialize(m1CandleBuilder_1.m1CandleBuilder.getCandles());
    // 3. Run strategy warmup on history if no signals exist in DB
    const existingSignals = signalEngine_1.signalEngine.getSignals();
    if (existingSignals.length === 0) {
        console.log('[Server] Signals database is empty. Running historical strategy warmup...');
        // Wire temporary warmup handler for trades
        const warmupSignalHandler = (signal) => {
            paperTradeEngine_1.paperTradeEngine.handleHistoricalSignal(signal, m1CandleBuilder_1.m1CandleBuilder.getCandles());
        };
        signalEngine_1.signalEngine.on('signal', warmupSignalHandler);
        signalEngine_1.signalEngine.runHistoryWarmup(m1CandleBuilder_1.m1CandleBuilder.getCandles(), htfAggregator_1.htfAggregator.getCandles());
        // Remove temporary handler
        signalEngine_1.signalEngine.off('signal', warmupSignalHandler);
    }
    // 4. Initialize Socket.IO
    socketService_1.socketService.initialize(httpServer);
    // 5. Connect live event handlers for real-time streaming
    m1CandleBuilder_1.m1CandleBuilder.on('close', (candle) => {
        // Run CISD evaluation on the closed 1m candle
        signalEngine_1.signalEngine.handle1mCandleClose(m1CandleBuilder_1.m1CandleBuilder.getCandles());
        // Pass closed 1m candle to 15m aggregator
        htfAggregator_1.htfAggregator.handleM1Close(candle);
    });
    m1CandleBuilder_1.m1CandleBuilder.on('update', (candle) => {
        // Track open trades against the developing 1m candle
        paperTradeEngine_1.paperTradeEngine.handle1mCandleUpdate(candle);
    });
    htfAggregator_1.htfAggregator.on('close', (candle) => {
        // Check sweeps and CISD confirmations when a 15m candle closes
        signalEngine_1.signalEngine.handle15mCandleClose(htfAggregator_1.htfAggregator.getCandles(), m1CandleBuilder_1.m1CandleBuilder.getCandles(), candle);
    });
    // Connect live signal triggers to trade placement
    signalEngine_1.signalEngine.on('signal', (signal) => {
        paperTradeEngine_1.paperTradeEngine.handleLiveSignal(signal);
    });
    // Handle live settings changes from frontend: re-evaluate history!
    signalEngine_1.signalEngine.on('settingsUpdated', async () => {
        console.log('[Server] Settings updated. Re-calculating strategy history...');
        // Clear databases and engine records
        await signalEngine_1.signalEngine.clearSignals();
        await paperTradeEngine_1.paperTradeEngine.clearTrades();
        // Re-run strategy warmup with new settings
        const warmupSignalHandler = (signal) => {
            paperTradeEngine_1.paperTradeEngine.handleHistoricalSignal(signal, m1CandleBuilder_1.m1CandleBuilder.getCandles());
        };
        signalEngine_1.signalEngine.on('signal', warmupSignalHandler);
        signalEngine_1.signalEngine.runHistoryWarmup(m1CandleBuilder_1.m1CandleBuilder.getCandles(), htfAggregator_1.htfAggregator.getCandles());
        signalEngine_1.signalEngine.off('signal', warmupSignalHandler);
        // Broadcast newly calculated historical warm state
        socketService_1.socketService.broadcast('candles:initial', {
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
    });
    // 6. Connect live ticks to the M1 candle builder
    pricingStream_1.pricingStream.on('tick', (tick) => {
        m1CandleBuilder_1.m1CandleBuilder.handleTick(tick);
    });
    // 7. Start the pricing stream
    pricingStream_1.pricingStream.start();
    // 8. Start HTTP & Socket server
    httpServer.listen(config_1.config.port, () => {
        console.log(`[Server] Web server listening on port ${config_1.config.port}`);
    });
}
bootstrap().catch((err) => {
    console.error('[Server] Bootstrap failed:', err);
    process.exit(1);
});
