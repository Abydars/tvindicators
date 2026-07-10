import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RotateCcw, Shield, Sliders, Database, TrendingUp, Activity, Download } from 'lucide-react';
import TradingViewChart from './components/TradingViewChart';
import { Candle, StrategySignal, PaperTrade, StrategySettings, Drawing } from '../../shared/types';

const BACKEND_URL = 'http://localhost:4000';

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [m1Candles, setM1Candles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [openTrades, setOpenTrades] = useState<PaperTrade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<PaperTrade[]>([]);
  const [settings, setSettings] = useState<StrategySettings | null>(null);
  const [livePrice, setLivePrice] = useState<{ bid: number; ask: number; mid: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'signals' | 'settings'>('signals');
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Stats
  const [stats, setStats] = useState({
    pnl: 0,
    winRate: 0,
    total: 0,
    wins: 0,
    losses: 0,
  });

  useEffect(() => {
    // Connect to Socket.IO backend
    const s = io(BACKEND_URL);
    setSocket(s);

    s.on('connect', () => {
      console.log('[Socket] Connected to backend');
    });

    s.on('candles:initial', (data: any) => {
      console.log('[Socket] Received initial data:', data);
      setM1Candles(data.m1Candles);
      setSignals(data.signals);
      setDrawings(data.drawings);
      setOpenTrades(data.openTrades);
      setCompletedTrades(data.completedTrades);
      setSettings(data.settings);

      if (data.currentM1) {
        setLivePrice({
          mid: data.currentM1.close,
          bid: data.currentM1.close - 0.08,
          ask: data.currentM1.close + 0.08,
        });
      }
    });
    s.on('candle:update', (candle: Candle) => {
      setLivePrice({
        mid: candle.close,
        bid: candle.close - 0.07,
        ask: candle.close + 0.07,
      });
      setM1Candles((prev) => {
        if (prev.length === 0) return [candle];
        const last = prev[prev.length - 1];
        if (last.time === candle.time) {
          const updated = [...prev];
          updated[updated.length - 1] = candle;
          return updated;
        } else {
          return [...prev, candle].slice(-2000);
        }
      });
    });

    s.on('candle:closed', (candle: Candle) => {
      setM1Candles((prev) => {
        const filtered = prev.filter((c) => c.time !== candle.time);
        return [...filtered, candle].slice(-2000);
      });
      
      // Calculate active session
      setSessionActive(checkSessionTime(candle.time));
    });

    s.on('signal:new', (signal: StrategySignal) => {
      setSignals((prev) => [...prev, signal]);
    });

    s.on('drawing:new', (drawing: Drawing) => {
      setDrawings((prev) => [...prev, drawing]);
    });

    s.on('trade:new', (trade: PaperTrade) => {
      setOpenTrades((prev) => [...prev.filter((t) => t.id !== trade.id), trade]);
    });

    s.on('trade:closed', (trade: PaperTrade) => {
      setOpenTrades((prev) => prev.filter((t) => t.id !== trade.id));
      setCompletedTrades((prev) => [trade, ...prev.filter((t) => t.id !== trade.id)]);
    });

    s.on('settings:updated', (newSettings: StrategySettings) => {
      setSettings(newSettings);
    });

    s.on('strategy:reset_done', () => {
      setIsResetting(false);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Update statistics
  useEffect(() => {
    const total = completedTrades.length;
    const wins = completedTrades.filter((t) => t.result === 'win').length;
    const losses = completedTrades.filter((t) => t.result === 'loss').length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    
    // Sum R multiples
    const pnl = completedTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);

    setStats({
      pnl,
      winRate,
      total,
      wins,
      losses,
    });
  }, [completedTrades]);

  const checkSessionTime = (time: number): boolean => {
    // Timezone Asia/Karachi offset is UTC+5
    const dt = new Date(time);
    const utcHours = dt.getUTCHours();
    const utcMinutes = dt.getUTCMinutes();
    const karachiMinutes = (utcHours * 60 + utcMinutes + 300) % 1440;

    const s1Start = 12 * 60; // 12:00
    const s1End = 14 * 60;   // 14:00
    const s2Start = 18 * 60; // 18:00
    const s2End = 19.5 * 60; // 19:30

    return (
      (karachiMinutes >= s1Start && karachiMinutes < s1End) ||
      (karachiMinutes >= s2Start && karachiMinutes < s2End)
    );
  };

  const handleSettingsChange = (key: keyof StrategySettings, value: any) => {
    if (!settings || !socket) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    socket.emit('settings:update', updated);
  };

  const handleReset = () => {
    if (!socket || !window.confirm('Are you sure you want to reset all strategy signals, trades, and database records?')) return;
    setIsResetting(true);
    socket.emit('strategy:reset');
    setSignals([]);
    setDrawings([]);
    setOpenTrades([]);
    setCompletedTrades([]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b0f19] text-slate-200">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#222f47] bg-[#0e1726]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <TrendingUp size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide text-white">XAU/USD Strategy Engine</h1>
            <p className="text-xs text-slate-400">Pakistan Sessions SMC (15m Sweep + 1m CISD)</p>
          </div>
        </div>

        {/* Live Status Board */}
        <div className="flex items-center gap-6">
          {sessionActive ? (
            <div className="flex items-center gap-2 px-3 py-1 text-xs font-semibold text-emerald-400 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 live-indicator-pulse" />
              PK Session Active
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 text-xs font-semibold text-amber-400 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Outside Sessions
            </div>
          )}

          {livePrice ? (
            <div className="flex items-center gap-4 bg-[#14223d]/60 px-4 py-1.5 rounded-lg border border-[#222f47]">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Gold Price</span>
                <span className="text-sm font-mono font-bold text-white">${livePrice.mid.toFixed(2)}</span>
              </div>
              <div className="h-6 w-px bg-[#222f47]" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Spread</span>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  ${(livePrice.ask - livePrice.bid).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Activity className="animate-spin text-indigo-400" size={16} />
              Connecting to live ticks...
            </div>
          )}
        </div>
      </header>

      {/* Main Interface */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Side: Chart and Paper Trading log */}
        <div className="flex flex-col flex-1 border-r border-[#222f47] overflow-hidden">
          {/* Chart Viewport */}
          <div className="flex-1 min-h-[450px] relative bg-[#0e1726]">
            {m1Candles.length > 0 ? (
              <TradingViewChart
                m1Candles={m1Candles}
                drawings={drawings}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0f19]/80">
                <Activity size={32} className="animate-pulse text-indigo-500" />
                <span className="text-slate-400 text-sm">Warming up charts...</span>
              </div>
            )}
          </div>

          {/* Bottom Panel: Paper Trades */}
          <div className="h-64 border-t border-[#222f47] bg-[#0c1220] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#222f47]">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Paper Trading Logs</h3>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-6 text-xs font-semibold bg-[#11192e] px-4 py-1.5 rounded-lg border border-[#222f47]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Total:</span>
                    <span className="text-white">{stats.total}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Win Rate:</span>
                    <span className="text-emerald-400">{stats.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Net R PnL:</span>
                    <span className={stats.pnl >= 0 ? 'text-emerald-400' : 'text-rose-500'}>
                      {stats.pnl >= 0 ? '+' : ''}{stats.pnl.toFixed(2)} R
                    </span>
                  </div>
                </div>

                <a
                  href={`${BACKEND_URL}/api/trades/export`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium border border-indigo-500/20 transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  <Download size={13} />
                  Export CSV
                </a>
              </div>
            </div>

            {/* Trades List View */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#11192e]/80 text-slate-400 font-semibold border-b border-[#222f47] sticky top-0">
                    <th className="px-6 py-2.5">Symbol</th>
                    <th className="px-6 py-2.5">Type</th>
                    <th className="px-6 py-2.5">Entry Price</th>
                    <th className="px-6 py-2.5">Stop Loss</th>
                    <th className="px-6 py-2.5">Take Profit 1 / 2</th>
                    <th className="px-6 py-2.5">Result</th>
                    <th className="px-6 py-2.5">PnL (R)</th>
                    <th className="px-6 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222f47]/50 font-mono">
                  {/* Open Trades */}
                  {openTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-[#152038]/30 bg-[#122240]/10">
                      <td className="px-6 py-2 font-semibold text-white">{t.symbol}</td>
                      <td className="px-6 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {t.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-2">${t.entryPrice.toFixed(2)}</td>
                      <td className="px-6 py-2 text-rose-400">${t.stopLoss.toFixed(2)}</td>
                      <td className="px-6 py-2 text-slate-300">
                        ${t.takeProfit1?.toFixed(2)} / ${t.takeProfit2?.toFixed(2)}
                      </td>
                      <td className="px-6 py-2 text-slate-400">-</td>
                      <td className="px-6 py-2 text-slate-400">-</td>
                      <td className="px-6 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 animate-pulse">
                          OPEN
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Closed Trades */}
                  {completedTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-[#152038]/30">
                      <td className="px-6 py-2 font-semibold text-slate-300">{t.symbol}</td>
                      <td className="px-6 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === 'long'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {t.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-2 text-slate-300">${t.entryPrice.toFixed(2)}</td>
                      <td className="px-6 py-2 text-slate-400">${t.stopLoss.toFixed(2)}</td>
                      <td className="px-6 py-2 text-slate-400">
                        ${t.takeProfit1?.toFixed(2)} / ${t.takeProfit2?.toFixed(2)}
                      </td>
                      <td className="px-6 py-2">
                        {t.result === 'win' ? (
                          <span className="text-emerald-400 font-bold">WIN</span>
                        ) : (
                          <span className="text-rose-400 font-bold">LOSS</span>
                        )}
                      </td>
                      <td className="px-6 py-2 font-bold">
                        <span className={t.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.result === 'win' ? '+' : ''}{t.rMultiple?.toFixed(1)} R
                        </span>
                      </td>
                      <td className="px-6 py-2 text-slate-400">CLOSED</td>
                    </tr>
                  ))}
                  {openTrades.length === 0 && completedTrades.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-500 font-sans">
                        No trade history captured yet. Run strategy reset or wait for setup signals.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Tabbed Signals & Control Panel */}
        <div className="w-80 bg-[#0e1627] flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-[#222f47]">
            <button
              onClick={() => setActiveTab('signals')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'signals'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Entry Signals ({signals.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'settings'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Control Panel
            </button>
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'signals' ? (
              <div className="space-y-3">
                {signals.map((sig) => {
                  const isLong = sig.direction === 'long';
                  return (
                    <div
                      key={sig.id}
                      className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${
                        isLong
                          ? 'bg-[#0b1b1a] border-emerald-500/20 text-slate-200'
                          : 'bg-[#1c0e15] border-rose-500/20 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {sig.direction.toUpperCase()} SIGNAL
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(sig.signalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-1">
                        <div>
                          <span className="text-[9px] text-slate-500 block">ENTRY PRICE</span>
                          <span className="text-white font-semibold">${sig.entryPrice.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 block">SWEEP LEVEL</span>
                          <span className="text-white font-semibold">${sig.sweep.level.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="h-px bg-slate-800 my-1" />

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-[9px] text-slate-500 block">CISD LEVEL</span>
                          <span className="text-indigo-300 font-semibold">${sig.cisd.level.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 block">CISD TRIGGER BAR</span>
                          <span className="text-slate-400 font-semibold">#{sig.cisd.signalBar}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {signals.length === 0 && (
                  <div className="text-center py-10 text-slate-500 text-sm">
                    No signals generated yet. Strategy runs on history to calculate historical alerts.
                  </div>
                )}
              </div>
            ) : (
              // Settings Control Panel
              settings && (
                <div className="space-y-6">
                  {/* Calcs Group */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sliders size={12} />
                      CISD & Calculations
                    </h4>
                    
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 block font-medium">CISD Invalidation Noise Filter</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.1"
                          value={settings.cisdTolerance}
                          onChange={(e) => handleSettingsChange('cisdTolerance', parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-[#222f47] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-xs font-mono font-bold text-white bg-[#1a2538] px-2 py-0.5 rounded border border-[#222f47]">
                          {settings.cisdTolerance.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 block font-medium">Previous Wick Lookback</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.sweepLookback}
                        onChange={(e) => handleSettingsChange('sweepLookback', parseInt(e.target.value, 10))}
                        className="w-full bg-[#141f35] border border-[#222f47] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <label className="text-xs text-slate-300 font-medium">Require Sweep Reclaim Close</label>
                      <input
                        type="checkbox"
                        checked={settings.requireSweepReclaim}
                        onChange={(e) => handleSettingsChange('requireSweepReclaim', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-800" />

                  {/* Visuals Group */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Shield size={12} />
                      Appearance
                    </h4>

                    <div className="flex items-center justify-between py-1">
                      <label className="text-xs text-slate-300 font-medium">Show Signal Sweeps</label>
                      <input
                        type="checkbox"
                        checked={settings.showSignalSweeps}
                        onChange={(e) => handleSettingsChange('showSignalSweeps', e.target.checked)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <label className="text-xs text-slate-300 font-medium">Show CISD Levels</label>
                      <input
                        type="checkbox"
                        checked={settings.showSignalCisdLevels}
                        onChange={(e) => handleSettingsChange('showSignalCisdLevels', e.target.checked)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <label className="text-xs text-slate-300 font-medium">Show Entry Signal Markers</label>
                      <input
                        type="checkbox"
                        checked={settings.showEntrySignals}
                        onChange={(e) => handleSettingsChange('showEntrySignals', e.target.checked)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-800" />

                  {/* Reset Strategy button */}
                  <button
                    onClick={handleReset}
                    disabled={isResetting}
                    className="w-full py-2.5 rounded bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800/40 text-white font-bold text-xs uppercase tracking-wider border border-rose-500/25 flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-950/20 cursor-pointer"
                  >
                    <RotateCcw size={14} className={isResetting ? 'animate-spin' : ''} />
                    Reset Strategy Records
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
