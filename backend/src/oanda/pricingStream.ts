import { EventEmitter } from 'events';
import axios from 'axios';
import { config, getOandaStreamUrl } from '../config';
import { PriceTick } from '../../../shared/types';

export class PricingStream extends EventEmitter {
  private active = false;
  private mockInterval: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastPrice = 2350.0;

  constructor() {
    super();
  }

  public start(): void {
    if (this.active) return;
    this.active = true;

    const isMock = config.oanda.useMockStream || !config.oanda.apiKey || !config.oanda.accountId;

    if (isMock) {
      console.log('[Pricing Stream] Starting Mock Stream...');
      this.startMockStream();
    } else {
      console.log('[Pricing Stream] Starting OANDA Live Stream...');
      this.startOandaStream();
    }
  }

  public stop(): void {
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

  private startMockStream(): void {
    // Generate a mock price tick every 1000ms
    this.mockInterval = setInterval(() => {
      if (!this.active) return;

      const spread = 0.15; // 15 cents spread
      const change = (Math.random() - 0.5) * 0.4; // random tick fluctuation
      const mid = parseFloat((this.lastPrice + change).toFixed(2));
      const bid = parseFloat((mid - spread / 2).toFixed(2));
      const ask = parseFloat((mid + spread / 2).toFixed(2));

      this.lastPrice = mid;

      const tick: PriceTick = {
        instrument: config.oanda.instrument,
        time: new Date().toISOString(),
        timestamp: Date.now(),
        bid,
        ask,
        mid,
      };

      this.emit('tick', tick);
    }, 1000);
  }

  private async startOandaStream(): Promise<void> {
    this.abortController = new AbortController();
    const url = `${getOandaStreamUrl()}/v3/accounts/${config.oanda.accountId}/pricing/stream`;

    try {
      const response = await axios({
        method: 'get',
        url,
        headers: {
          Authorization: `Bearer ${config.oanda.apiKey}`,
        },
        params: {
          instruments: config.oanda.instrument,
        },
        responseType: 'stream',
        signal: this.abortController.signal,
      });

      console.log('[Pricing Stream] OANDA connection established successfully.');

      let buffer = '';

      response.data.on('data', (chunk: Buffer) => {
        if (!this.active) return;

        buffer += chunk.toString();
        const lines = buffer.split('\n');
        
        // Keep the last (incomplete) line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          this.parseStreamLine(line);
        }
      });

      response.data.on('end', () => {
        console.warn('[Pricing Stream] OANDA stream ended by server. Reconnecting...');
        this.handleReconnect();
      });

      response.data.on('error', (err: any) => {
        console.error('[Pricing Stream] Stream error:', err.message);
        this.handleReconnect();
      });

    } catch (error: any) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return; // normal stop
      }
      console.error('[Pricing Stream] Failed to connect to OANDA stream:', error.message);
      this.handleReconnect();
    }
  }

  private parseStreamLine(line: string): void {
    try {
      const data = JSON.parse(line);
      
      if (data.type === 'PRICE') {
        const bid = parseFloat(data.bids[0].price);
        const ask = parseFloat(data.asks[0].price);
        const mid = parseFloat(((bid + ask) / 2).toFixed(2));

        const tick: PriceTick = {
          instrument: data.instrument,
          time: data.time,
          timestamp: new Date(data.time).getTime(),
          bid,
          ask,
          mid,
        };

        this.emit('tick', tick);
      } else if (data.type === 'HEARTBEAT') {
        // Heartbeats are sent to keep connection alive
        this.emit('heartbeat', data);
      }
    } catch (e) {
      // JSON parse error (could be an incomplete line)
    }
  }

  private handleReconnect(): void {
    if (!this.active) return;
    this.stop();
    this.active = true; // allow reconnection

    console.log('[Pricing Stream] Scheduling reconnection in 5 seconds...');
    this.reconnectTimeout = setTimeout(() => {
      this.start();
    }, 5000);
  }
}

export const pricingStream = new PricingStream();
export default pricingStream;
