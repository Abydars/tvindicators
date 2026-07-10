import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Candle, StrategySignal, PaperTrade } from '../../../shared/types';
import { db } from '../db/sqlite';

export class PaperTradeEngine extends EventEmitter {
  private openTrades: PaperTrade[] = [];
  private completedTrades: PaperTrade[] = [];
  
  // Default R multiplier
  private tp1Multiplier = 1.5;
  private tp2Multiplier = 5.0;

  constructor() {
    super();
  }

  public async initialize(): Promise<void> {
    const trades = await db.getPaperTrades();
    this.completedTrades = trades.filter((t) => t.status === 'closed');
    this.openTrades = trades.filter((t) => t.status === 'open');
    console.log(`[Paper Trade Engine] Loaded ${this.openTrades.length} open and ${this.completedTrades.length} closed trades.`);
  }

  public getOpenTrades(): PaperTrade[] {
    return [...this.openTrades];
  }

  public getCompletedTrades(): PaperTrade[] {
    return [...this.completedTrades];
  }

  public async clearTrades(): Promise<void> {
    this.openTrades = [];
    this.completedTrades = [];
    console.log('[Paper Trade Engine] Cleared trades from memory.');
  }

  /**
   * Run strategy warmup on historical paper trades.
   */
  public handleHistoricalSignal(signal: StrategySignal, allHistoricalM1: Candle[]): void {
    const isLong = signal.direction === 'long';
    const entryPrice = signal.entryPrice;
    
    // Stop Loss is the sweep level
    const stopLoss = signal.sweep.level;
    const risk = isLong ? entryPrice - stopLoss : stopLoss - entryPrice;

    if (risk <= 0) {
      console.warn(`[Paper Trade Engine] Invalid risk calculated for signal ${signal.id}. Skipping trade.`);
      return;
    }

    const takeProfit1 = isLong ? entryPrice + this.tp1Multiplier * risk : entryPrice - this.tp1Multiplier * risk;
    const takeProfit2 = isLong ? entryPrice + this.tp2Multiplier * risk : entryPrice - this.tp2Multiplier * risk;

    const trade: PaperTrade = {
      id: uuidv4(),
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entryTime: signal.signalTime,
      entryPrice,
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit1: parseFloat(takeProfit1.toFixed(2)),
      takeProfit2: parseFloat(takeProfit2.toFixed(2)),
      status: 'open',
    };

    // Find exit in historical 1m candles
    const signalIndex = allHistoricalM1.findIndex(c => c.time === signal.signalTime);
    if (signalIndex !== -1) {
      for (let i = signalIndex; i < allHistoricalM1.length; i++) {
        const candle = allHistoricalM1[i];
        const isClosed = this.checkTradeExit(trade, candle);
        if (isClosed) {
          this.completedTrades.push(trade);
          db.savePaperTrade(trade).catch(err => console.error('Failed to save paper trade:', err));
          return;
        }
      }
    }

    // If still open
    this.openTrades.push(trade);
    db.savePaperTrade(trade).catch(err => console.error('Failed to save paper trade:', err));
  }

  /**
   * Trigger paper trade on live confirmed signal.
   */
  public handleLiveSignal(signal: StrategySignal): void {
    const isLong = signal.direction === 'long';
    const entryPrice = signal.entryPrice;
    
    // SL is sweep level
    const stopLoss = signal.sweep.level;
    const risk = isLong ? entryPrice - stopLoss : stopLoss - entryPrice;

    if (risk <= 0) {
      console.warn(`[Paper Trade Engine] Live trade risk is invalid (${risk}). Skipping.`);
      return;
    }

    const takeProfit1 = isLong ? entryPrice + this.tp1Multiplier * risk : entryPrice - this.tp1Multiplier * risk;
    const takeProfit2 = isLong ? entryPrice + this.tp2Multiplier * risk : entryPrice - this.tp2Multiplier * risk;

    const trade: PaperTrade = {
      id: uuidv4(),
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entryTime: signal.signalTime,
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit1: parseFloat(takeProfit1.toFixed(2)),
      takeProfit2: parseFloat(takeProfit2.toFixed(2)),
      status: 'open',
    };

    this.openTrades.push(trade);
    db.savePaperTrade(trade)
      .then(() => {
        this.emit('tradeOpened', trade);
        console.log(`[Paper Trade Engine] Opened ${trade.direction.toUpperCase()} trade for signal ${signal.id}.`);
      })
      .catch((err) => console.error('Failed to save trade to SQLite:', err));
  }

  /**
   * Monitor open trades against new 1m candle updates.
   */
  public handle1mCandleUpdate(candle: Candle): void {
    if (this.openTrades.length === 0) return;

    let tradeChanged = false;
    const remainingOpen: PaperTrade[] = [];

    for (const trade of this.openTrades) {
      // Check exit criteria
      const isClosed = this.checkTradeExit(trade, candle);

      if (isClosed) {
        tradeChanged = true;
        this.completedTrades.push(trade);
        
        // Save to SQLite
        db.savePaperTrade(trade)
          .then(() => {
            this.emit('tradeClosed', trade);
            console.log(`[Paper Trade Engine] Closed trade ${trade.id} with result: ${trade.result}.`);
          })
          .catch((err) => console.error('Failed to update paper trade in database:', err));
      } else {
        remainingOpen.push(trade);
      }
    }

    if (tradeChanged) {
      this.openTrades = remainingOpen;
    }
  }

  private checkTradeExit(trade: PaperTrade, candle: Candle): boolean {
    const isLong = trade.direction === 'long';
    const risk = isLong ? trade.entryPrice - trade.stopLoss : trade.stopLoss - trade.entryPrice;
    
    // Check SL first (conservative)
    if (isLong) {
      if (candle.low <= trade.stopLoss) {
        trade.status = 'closed';
        trade.result = 'loss';
        trade.exitTime = candle.time;
        trade.exitPrice = trade.stopLoss;
        trade.rMultiple = -1.0;
        return true;
      }
      if (trade.takeProfit2 && candle.high >= trade.takeProfit2) {
        trade.status = 'closed';
        trade.result = 'win';
        trade.exitTime = candle.time;
        trade.exitPrice = trade.takeProfit2;
        trade.rMultiple = this.tp2Multiplier;
        return true;
      }
    } else {
      // Short trade
      if (candle.high >= trade.stopLoss) {
        trade.status = 'closed';
        trade.result = 'loss';
        trade.exitTime = candle.time;
        trade.exitPrice = trade.stopLoss;
        trade.rMultiple = -1.0;
        return true;
      }
      if (trade.takeProfit2 && candle.low <= trade.takeProfit2) {
        trade.status = 'closed';
        trade.result = 'win';
        trade.exitTime = candle.time;
        trade.exitPrice = trade.takeProfit2;
        trade.rMultiple = this.tp2Multiplier;
        return true;
      }
    }

    return false;
  }
}

export const paperTradeEngine = new PaperTradeEngine();
export default paperTradeEngine;
