import axios from 'axios';
import { config, getOandaApiUrl } from '../config';
import { Candle } from '../../../shared/types';

export class OandaClient {
  /**
   * Fetch historical candles for a given instrument.
   * If config indicates mock mode or if OANDA details are empty, generates simulated historical candles.
   */
  public static async getCandles(
    instrument: string = config.oanda.instrument,
    granularity: 'M1' | 'M15' = 'M1',
    count: number = 500
  ): Promise<Candle[]> {
    const isMock = config.oanda.useMockStream || !config.oanda.apiKey || !config.oanda.accountId;

    if (isMock) {
      console.log(`[OANDA Mock] Generating ${count} mock ${granularity} candles...`);
      return this.generateMockCandles(granularity, count);
    }

    try {
      const url = `${getOandaApiUrl()}/v3/instruments/${instrument}/candles`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${config.oanda.apiKey}`,
          'Content-Type': 'application/json',
        },
        params: {
          price: 'M', // Midpoint
          granularity,
          count,
        },
      });

      if (!response.data || !response.data.candles) {
        throw new Error('Invalid response from OANDA API');
      }

      return response.data.candles.map((c: any, index: number) => ({
        time: new Date(c.time).getTime(),
        open: parseFloat(c.mid.o),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
        volume: c.volume,
        complete: c.complete,
        barIndex: index,
      }));
    } catch (error: any) {
      console.error(`Error fetching candles from OANDA API (${error.message}). Falling back to mock generator.`);
      return this.generateMockCandles(granularity, count);
    }
  }

  private static generateMockCandles(granularity: 'M1' | 'M15', count: number): Candle[] {
    const candles: Candle[] = [];
    const candleDurationMs = granularity === 'M1' ? 60 * 1000 : 15 * 60 * 1000;
    
    // Standard starting gold price
    let lastClose = 2350.0;
    let baseTime = Math.floor(Date.now() / candleDurationMs) * candleDurationMs - count * candleDurationMs;

    for (let i = 0; i < count; i++) {
      const time = baseTime + i * candleDurationMs;
      const open = lastClose;
      
      // Random walk simulation for gold
      const change = (Math.random() - 0.495) * 1.5; // slight positive bias or balanced
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 1.0;
      const low = Math.min(open, close) - Math.random() * 1.0;
      const volume = Math.floor(Math.random() * 300) + 50;

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume,
        complete: true,
        barIndex: i,
      });

      lastClose = close;
    }

    return candles;
  }
}

export default OandaClient;
