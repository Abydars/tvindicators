export interface Candle {
  time: number; // UTC timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
  barIndex: number;
}

export interface PriceTick {
  instrument: string;
  time: string;
  timestamp: number;
  bid: number;
  ask: number;
  mid: number;
}

export interface CisdPotential {
  level: number;
  barIndex: number;
}

export interface HTFCisdState {
  bullishCisdSeen: boolean;
  bearishCisdSeen: boolean;

  bullishCisdSignalBar: number | null;
  bearishCisdSignalBar: number | null;

  bullishCisdOriginBar: number | null;
  bearishCisdOriginBar: number | null;

  bullishCisdLevel: number | null;
  bearishCisdLevel: number | null;
}

export interface SweepResult {
  found: boolean;
  direction: "bullish" | "bearish" | null;
  level: number | null;
  sourceTime: number | null;
  sourceIndex: number | null;
  sweepCandleOpenTime: number | null;
  sweepCandleCloseTime: number | null;
}

export interface StrategySignal {
  id: string;
  symbol: string;
  direction: "long" | "short";
  signalTime: number;
  signalBarIndex: number;
  entryPrice: number;
  sweep: {
    level: number;
    sourceTime: number;
    completedSweepCandleOpenTime: number;
  };
  cisd: {
    level: number;
    originBar: number;
    signalBar: number;
  };
}

export interface PaperTrade {
  id: string;
  signalId: string;
  symbol: string;
  direction: "long" | "short";
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1?: number;
  takeProfit2?: number;
  status: "open" | "closed";
  result?: "win" | "loss" | "breakeven";
  exitTime?: number;
  exitPrice?: number;
  rMultiple?: number;
}

export interface StrategySettings {
  cisdTolerance: number;
  sweepTimeframe: "15m";
  sweepLookback: number;
  requireSweepReclaim: boolean;
  sessionTimezone: string;
  sessionOne: string; // e.g. "12:00-14:00"
  sessionTwo: string; // e.g. "18:00-19:30"
  showSignalSweeps: boolean;
  showSignalCisdLevels: boolean;
  showEntrySignals: boolean;
}

export interface Drawing {
  id: string;
  signalId: string;
  type: 'line' | 'marker';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  text?: string;
  position?: 'aboveBar' | 'belowBar';
  color: string;
  width?: number;
}
