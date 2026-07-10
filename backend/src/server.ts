import express from 'express';
import { createServer } from 'http';
import { config } from './config';
import { db } from './db/sqlite';
import { m1CandleBuilder } from './market/m1CandleBuilder';
import { htfAggregator } from './market/htfAggregator';
import { signalEngine } from './strategy/signalEngine';
import { paperTradeEngine } from './strategy/paperTradeEngine';
import { pricingStream } from './oanda/pricingStream';
import { socketService } from './sockets/socketService';

const app = express();
const httpServer = createServer(app);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    time: new Date().toISOString(),
    oandaEnv: config.oanda.env,
    instrument: config.oanda.instrument,
    mockMode: config.oanda.useMockStream || !config.oanda.apiKey,
  });
});

// CSV Export Endpoint for paper trades
app.get('/api/trades/export', async (req, res) => {
  try {
    const trades = await db.getPaperTrades();
    let csv = 'ID,SignalID,Symbol,Direction,EntryTime,EntryPrice,StopLoss,TakeProfit1,TakeProfit2,Status,Result,ExitTime,ExitPrice,RMultiple\n';
    
    for (const t of trades) {
      csv += `"${t.id}","${t.signalId}","${t.symbol}","${t.direction}","${new Date(t.entryTime).toISOString()}",${t.entryPrice},${t.stopLoss},${t.takeProfit1 || ''},${t.takeProfit2 || ''},"${t.status}","${t.result || ''}","${t.exitTime ? new Date(t.exitTime).toISOString() : ''}",${t.exitPrice || ''},${t.rMultiple !== undefined ? t.rMultiple : ''}\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=paper_trades.csv');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// CSV Export Endpoint for signals (as required by backtest/replay scope)
app.get('/api/signals/export', async (req, res) => {
  try {
    const signals = await db.getSignals();
    const trades = await db.getPaperTrades();
    let csv = 'time,direction,entryPrice,sweepLevel,cisdLevel,sl,tp,result,rMultiple\n';
    
    for (const sig of signals) {
      const trade = trades.find((t) => t.signalId === sig.id);
      csv += `"${new Date(sig.signalTime).toISOString()}","${sig.direction}",${sig.entryPrice},${sig.sweep.level},${sig.cisd.level},${trade?.stopLoss || ''},${trade?.takeProfit2 || ''},"${trade?.result || 'open'}",${trade?.rMultiple !== undefined ? trade.rMultiple : ''}\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=signals_backtest.csv');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function bootstrap() {
  console.log('[Server] Initializing modules...');
  
  // 1. Initialize DB and Strategy Engines
  await db.init();
  await signalEngine.initialize();
  await paperTradeEngine.initialize();

  // 2. Initialize candle aggregators with historical candles
  await m1CandleBuilder.initialize();
  await htfAggregator.initialize(m1CandleBuilder.getCandles());

  // 3. Run strategy warmup on history if no signals exist in DB
  const existingSignals = signalEngine.getSignals();
  if (existingSignals.length === 0) {
    console.log('[Server] Signals database is empty. Running historical strategy warmup...');
    
    // Wire temporary warmup handler for trades
    const warmupSignalHandler = (signal: any) => {
      paperTradeEngine.handleHistoricalSignal(signal, m1CandleBuilder.getCandles());
    };
    signalEngine.on('signal', warmupSignalHandler);
    
    signalEngine.runHistoryWarmup(m1CandleBuilder.getCandles(), htfAggregator.getCandles());
    
    // Remove temporary handler
    signalEngine.off('signal', warmupSignalHandler);
  }

  // 4. Initialize Socket.IO
  socketService.initialize(httpServer);

  // 5. Connect live event handlers for real-time streaming
  m1CandleBuilder.on('close', (candle) => {
    // Run CISD evaluation on the closed 1m candle
    signalEngine.handle1mCandleClose(m1CandleBuilder.getCandles());
    
    // Pass closed 1m candle to 15m aggregator
    htfAggregator.handleM1Close(candle);
  });

  m1CandleBuilder.on('update', (candle) => {
    // Track open trades against the developing 1m candle
    paperTradeEngine.handle1mCandleUpdate(candle);
  });

  htfAggregator.on('close', (candle) => {
    // Check sweeps and CISD confirmations when a 15m candle closes
    signalEngine.handle15mCandleClose(
      htfAggregator.getCandles(),
      m1CandleBuilder.getCandles(),
      candle
    );
  });

  // Connect live signal triggers to trade placement
  signalEngine.on('signal', (signal) => {
    paperTradeEngine.handleLiveSignal(signal);
  });

  // Handle live settings changes from frontend: re-evaluate history!
  signalEngine.on('settingsUpdated', async () => {
    console.log('[Server] Settings updated. Re-calculating strategy history...');
    
    // Clear databases and engine records
    await signalEngine.clearSignals();
    await paperTradeEngine.clearTrades();

    // Re-run strategy warmup with new settings
    const warmupSignalHandler = (signal: any) => {
      paperTradeEngine.handleHistoricalSignal(signal, m1CandleBuilder.getCandles());
    };
    signalEngine.on('signal', warmupSignalHandler);
    
    signalEngine.runHistoryWarmup(m1CandleBuilder.getCandles(), htfAggregator.getCandles());
    
    signalEngine.off('signal', warmupSignalHandler);

    // Broadcast newly calculated historical warm state
    socketService.broadcast('candles:initial', {
      m1Candles: m1CandleBuilder.getCandles(),
      m15Candles: htfAggregator.getCandles(),
      currentM1: m1CandleBuilder.getCurrentCandle(),
      currentM15: htfAggregator.getCurrentCandle(),
      signals: signalEngine.getSignals(),
      drawings: signalEngine.getDrawings(),
      openTrades: paperTradeEngine.getOpenTrades(),
      completedTrades: paperTradeEngine.getCompletedTrades(),
      settings: signalEngine.getSettings(),
    });
  });

  // 6. Connect live ticks to the M1 candle builder
  pricingStream.on('tick', (tick) => {
    m1CandleBuilder.handleTick(tick);
  });

  // 7. Start the pricing stream
  pricingStream.start();

  // 8. Start HTTP & Socket server
  httpServer.listen(config.port, () => {
    console.log(`[Server] Web server listening on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Server] Bootstrap failed:', err);
  process.exit(1);
});
