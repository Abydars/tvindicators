import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { m1CandleBuilder } from '../market/m1CandleBuilder';
import { htfAggregator } from '../market/htfAggregator';
import { signalEngine } from '../strategy/signalEngine';
import { paperTradeEngine } from '../strategy/paperTradeEngine';

export class SocketService {
  private io!: Server;

  public initialize(server: HttpServer): void {
    this.io = new Server(server, {
      cors: {
        origin: '*', // Allow all origins for dev/local execution
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log(`[Socket] Client connected: ${socket.id}`);

      // Send the entire warm environment on first connect
      socket.emit('candles:initial', {
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

      // Handle custom settings updates from user
      socket.on('settings:update', async (settings) => {
        try {
          console.log('[Socket] Settings update request received:', settings);
          await signalEngine.updateSettings(settings);
        } catch (err: any) {
          console.error('[Socket] Failed to update settings:', err.message);
        }
      });

      // Reset strategy stats (signals, paper trades)
      socket.on('strategy:reset', async () => {
        try {
          console.log('[Socket] Resetting strategy execution records...');
          await signalEngine.clearSignals();
          await paperTradeEngine.clearTrades();
          
          // Let client know to reload layout
          socket.emit('strategy:reset_done');
          this.io.emit('candles:initial', {
            m1Candles: m1CandleBuilder.getCandles(),
            m15Candles: htfAggregator.getCandles(),
            currentM1: m1CandleBuilder.getCurrentCandle(),
            currentM15: htfAggregator.getCurrentCandle(),
            signals: [],
            drawings: [],
            openTrades: [],
            completedTrades: [],
            settings: signalEngine.getSettings(),
          });
        } catch (err: any) {
          console.error('[Socket] Failed to reset strategy:', err.message);
        }
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });

    // Wire up backend event broadcasters to emit live updates
    m1CandleBuilder.on('update', (candle) => {
      this.io.emit('candle:update', candle);
    });

    m1CandleBuilder.on('close', (candle) => {
      this.io.emit('candle:closed', candle);
    });

    signalEngine.on('signal', (signal, drawings) => {
      this.io.emit('signal:new', signal);
      for (const d of drawings) {
        this.io.emit('drawing:new', d);
      }
    });

    signalEngine.on('settingsUpdated', (settings) => {
      this.io.emit('settings:updated', settings);
    });

    paperTradeEngine.on('tradeOpened', (trade) => {
      this.io.emit('trade:new', trade);
    });

    paperTradeEngine.on('tradeClosed', (trade) => {
      this.io.emit('trade:closed', trade);
    });
  }

  public broadcast(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

export const socketService = new SocketService();
export default socketService;
