import { db } from './db/sqlite';
import { M1CandleBuilder } from './market/m1CandleBuilder';
import { HtfAggregator } from './market/htfAggregator';
import { SignalEngine } from './strategy/signalEngine';
import { PaperTradeEngine } from './strategy/paperTradeEngine';
import OandaClient from './oanda/client';
import path from 'path';

// Force database URL to a test sqlite database for verification
process.env.DATABASE_URL = './tvindicators_test.db';

async function runVerification() {
  console.log('====================================================');
  console.log('      STRATEGY ENGINE REPLAY & VERIFICATION TOOL    ');
  console.log('====================================================');

  // 1. Initialize clean test DB and strategy modules
  await db.init();
  
  // Clear any old verification database records
  await db.run('DELETE FROM signals');
  await db.run('DELETE FROM paper_trades');

  const signalEngine = new SignalEngine();
  const paperTradeEngine = new PaperTradeEngine();
  const m1Builder = new M1CandleBuilder();
  const htfAggregator = new HtfAggregator();

  await signalEngine.initialize();
  await paperTradeEngine.initialize();

  // Load settings (default 0.7 CISD tolerance, 15 lookback)
  console.log('[Replay] Settings:', JSON.stringify(signalEngine.getSettings()));

  // 2. Fetch historical test candles
  console.log('[Replay] Generating 1000 historical 1m candles for replay simulation...');
  const m1Candles = await OandaClient.getCandles('XAU_USD', 'M1', 1000);

  // 3. Connect replay events flow
  m1Builder.on('close', (candle) => {
    signalEngine.handle1mCandleClose(m1Builder.getCandles());
    htfAggregator.handleM1Close(candle);
  });

  m1Builder.on('update', (candle) => {
    paperTradeEngine.handle1mCandleUpdate(candle);
  });

  htfAggregator.on('close', (candle) => {
    signalEngine.handle15mCandleClose(
      htfAggregator.getCandles(),
      m1Builder.getCandles(),
      candle
    );
  });

  signalEngine.on('signal', (signal) => {
    console.log(`[Replay SIGNAL] Confirmed ${signal.direction.toUpperCase()} entry signal at ${new Date(signal.signalTime).toISOString()} - Entry Price: $${signal.entryPrice.toFixed(2)}`);
    paperTradeEngine.handleLiveSignal(signal);
  });

  paperTradeEngine.on('tradeClosed', (trade) => {
    console.log(`[Replay TRADE] Closed ${trade.direction.toUpperCase()} trade ${trade.id.slice(0,8)}: ${trade.result?.toUpperCase()} -> exit price $${trade.exitPrice?.toFixed(2)} (Net: ${trade.rMultiple?.toFixed(1)}R)`);
  });

  // 4. Inject 1m candles candle-by-candle (simulating tick-close replay)
  console.log('[Replay] Starting replay loop...');
  for (const candle of m1Candles) {
    m1Builder.injectClosedCandle(candle);
  }
  console.log('[Replay] Replay loop completed.');

  // 5. Gather statistics
  const signals = signalEngine.getSignals();
  const openTrades = paperTradeEngine.getOpenTrades();
  const completedTrades = paperTradeEngine.getCompletedTrades();

  const wins = completedTrades.filter(t => t.result === 'win').length;
  const losses = completedTrades.filter(t => t.result === 'loss').length;
  const winRate = completedTrades.length > 0 ? (wins / completedTrades.length) * 100 : 0;
  const totalR = completedTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);

  console.log('\n====================================================');
  console.log('                 REPLAY REPORT                      ');
  console.log('====================================================');
  console.log(`M1 Candles Replayed  : ${m1Candles.length}`);
  console.log(`M15 Candles Build    : ${htfAggregator.getCandles().length}`);
  console.log(`Signals Triggered    : ${signals.length}`);
  console.log(`Open Trades Remaining: ${openTrades.length}`);
  console.log(`Completed Trades     : ${completedTrades.length}`);
  console.log(`  - Wins             : ${wins}`);
  console.log(`  - Losses           : ${losses}`);
  console.log(`  - Win Rate         : ${winRate.toFixed(1)}%`);
  console.log(`  - Net Return (R)   : ${totalR.toFixed(2)} R`);
  console.log('====================================================');

  process.exit(0);
}

runVerification().catch(err => {
  console.error('[Replay] Verification failed:', err);
  process.exit(1);
});
