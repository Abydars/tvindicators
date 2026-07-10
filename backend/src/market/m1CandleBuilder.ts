import { EventEmitter } from 'events';
import { Candle, PriceTick } from '../../../shared/types';
import OandaClient from '../oanda/client';

export class M1CandleBuilder extends EventEmitter {
  private candles: Candle[] = [];
  private currentCandle: Candle | null = null;
  private currentMinuteTime: number = 0;

  constructor() {
    super();
  }

  public async initialize(): Promise<void> {
    try {
      const history = await OandaClient.getCandles(undefined, 'M1', 500);
      this.candles = history;
      if (this.candles.length > 0) {
        const last = this.candles[this.candles.length - 1];
        this.currentMinuteTime = last.time;
        
        // Initialize our developing candle with the last closed candle state as fallback
        this.currentCandle = {
          time: this.currentMinuteTime + 60000,
          open: last.close,
          high: last.close,
          low: last.close,
          close: last.close,
          volume: 0,
          complete: false,
          barIndex: last.barIndex + 1,
        };
        this.currentMinuteTime = this.currentCandle.time;
      }
      console.log(`[M1 Candle Builder] Initialized with ${this.candles.length} historical M1 candles.`);
    } catch (error) {
      console.error('[M1 Candle Builder] Initialization failed:', error);
      // Initialize with empty arrays if OANDA fails completely
      this.candles = [];
      this.currentCandle = null;
      this.currentMinuteTime = 0;
    }
  }

  public getCandles(): Candle[] {
    return [...this.candles];
  }

  public getCurrentCandle(): Candle | null {
    return this.currentCandle;
  }

  public handleTick(tick: PriceTick): void {
    const tickMinuteTime = Math.floor(tick.timestamp / 60000) * 60000;

    if (!this.currentCandle) {
      // First candle ever
      this.currentCandle = {
        time: tickMinuteTime,
        open: tick.mid,
        high: tick.mid,
        low: tick.mid,
        close: tick.mid,
        volume: 1,
        complete: false,
        barIndex: 0,
      };
      this.currentMinuteTime = tickMinuteTime;
      this.emit('update', this.currentCandle);
      return;
    }

    if (tickMinuteTime === this.currentMinuteTime) {
      // Update current developing candle
      this.currentCandle.close = tick.mid;
      if (tick.mid > this.currentCandle.high) this.currentCandle.high = tick.mid;
      if (tick.mid < this.currentCandle.low) this.currentCandle.low = tick.mid;
      this.currentCandle.volume += 1;
      this.emit('update', this.currentCandle);
    } else if (tickMinuteTime > this.currentMinuteTime) {
      // Finalize current candle
      this.currentCandle.complete = true;
      this.candles.push(this.currentCandle);
      
      const finalized = this.currentCandle;
      
      // Keep candles list size managed (e.g., last 2000 candles)
      if (this.candles.length > 2000) {
        this.candles.shift();
      }

      // Start new candle
      this.currentCandle = {
        time: tickMinuteTime,
        open: finalized.close,
        high: tick.mid,
        low: tick.mid,
        close: tick.mid,
        volume: 1,
        complete: false,
        barIndex: finalized.barIndex + 1,
      };
      this.currentMinuteTime = tickMinuteTime;

      // Emit close of previous and update of new
      this.emit('close', finalized);
      this.emit('update', this.currentCandle);
    }
  }

  // Backtest / replay injection helper
  public injectClosedCandle(candle: Candle): void {
    this.candles.push(candle);
    this.currentMinuteTime = candle.time;
    if (this.candles.length > 2000) {
      this.candles.shift();
    }
    this.emit('close', candle);
  }

  public reset(): void {
    this.candles = [];
    this.currentCandle = null;
    this.currentMinuteTime = 0;
  }
}

export const m1CandleBuilder = new M1CandleBuilder();
export default m1CandleBuilder;
