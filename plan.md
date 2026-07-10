Below is the complete development plan for the **Node.js OANDA live XAU/USD chart + strategy engine**, following your final Pine Script exactly as the master specification. The Pine Script confirms entries only on the first 1m candle after the 15m candle closes, stores CISD inside the developing 15m candle, restricts CISD to Pakistan sessions, and draws only the sweep/CISD used by a confirmed signal. 

# Project Goal

Build a web app that shows a **live OANDA XAU/USD chart** and reproduces your Pine Script strategy logic:

```txt
15m sweep + 1m CISD + Pakistan sessions = LONG / SHORT signal
```

The first version should be **paper-trading only**. Live execution should come after the Node.js signals match TradingView.

---

# Final App Features

## Core features

```txt
Live XAU/USD 1m chart
Live candle updates from OANDA
15m candle aggregation from 1m candles
Pakistan session highlighting
15m sweep detection
1m CISD detection
LONG / SHORT signal at 15m candle close
Draw only signal-related sweep and CISD levels
Paper trade logging
Settings panel
CSV export
```

## Later features

```txt
Live OANDA order execution
SL/TP placement
Two take profits
Break-even logic
Daily loss protection
Trade dashboard
Telegram / WhatsApp alerts
```

---

# Technology Stack

## Backend

```txt
Node.js
TypeScript
Express.js
Socket.IO
OANDA v20 API
PostgreSQL or SQLite
Luxon for timezone handling
```

## Frontend

```txt
Next.js / React
TradingView Lightweight Charts
Socket.IO client
Tailwind CSS
```

## Database

For MVP:

```txt
SQLite
```

For production:

```txt
PostgreSQL
```

---

# High-Level Architecture

```txt
OANDA API
   ↓
Node.js Backend
   ↓
M1 candle builder
   ↓
M15 aggregator
   ↓
CISD engine
   ↓
Sweep engine
   ↓
Signal engine
   ↓
Paper trade engine
   ↓
Socket.IO
   ↓
Frontend live chart
```

---

# Main Rule

The Node.js version must be a **1:1 port** of the Pine Script first.

Do not simplify CISD.
Do not change sweep logic.
Do not change signal timing.
Do not add filters yet.
Do not place live trades yet.

First target:

```txt
Node.js signals must match TradingView signals.
```

---

# Phase 1 — Project Setup

## Goal

Create the full app structure and environment setup.

## Folder structure

```txt
oanda-xau-live/
  backend/
    src/
      config/
      oanda/
      market/
      strategy/
      state/
      sockets/
      db/
      alerts/
      server.ts

  frontend/
    src/
      app/
      components/
      lib/
      types/

  shared/
    types/

  .env
  README.md
```

## Environment variables

```env
OANDA_API_KEY=
OANDA_ACCOUNT_ID=
OANDA_ENV=practice
OANDA_INSTRUMENT=XAU_USD

APP_PORT=4000
DATABASE_URL=

SESSION_TIMEZONE=Asia/Karachi
```

## Backend setup

Install:

```bash
npm install express socket.io axios luxon dotenv
npm install -D typescript ts-node-dev @types/node @types/express
```

## Frontend setup

Install:

```bash
npm install next react react-dom socket.io-client lightweight-charts
```

## Deliverables

```txt
Backend starts successfully
Frontend starts successfully
Socket.IO connection works
.env file loaded
Basic health endpoint works
```

---

# Phase 2 — OANDA Data Access

## Goal

Connect to OANDA and fetch XAU/USD candles.

## Backend modules

```txt
backend/src/oanda/client.ts
backend/src/oanda/candles.ts
backend/src/oanda/pricingStream.ts
```

## OANDA client

Responsibilities:

```txt
Select practice or live URL
Attach Bearer token
Handle API errors
Retry failed requests
```

## Candle fetcher

Function:

```ts
getCandles({
  instrument: "XAU_USD",
  granularity: "M1",
  count: 500
})
```

Returns normalized candles:

```ts
type Candle = {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  complete: boolean;
  barIndex: number;
};
```

## Pricing stream

Responsibilities:

```txt
Connect to OANDA pricing stream
Receive live bid/ask prices
Calculate mid price
Send price tick to candle builder
Reconnect if disconnected
```

Tick type:

```ts
type PriceTick = {
  instrument: "XAU_USD";
  time: string;
  timestamp: number;
  bid: number;
  ask: number;
  mid: number;
};
```

## Deliverables

```txt
Fetch last 500 M1 XAU/USD candles
Stream live XAU/USD price
Console log live price updates
Reconnect on stream failure
```

---

# Phase 3 — 1m Candle Builder

## Goal

Convert OANDA live ticks into live 1m candles.

## Module

```txt
backend/src/market/m1CandleBuilder.ts
```

## Responsibilities

```txt
Load historical M1 candles
Maintain current live M1 candle
Update high/low/close from each tick
Finalize candle when minute changes
Emit candle update to frontend
Emit candle close event to strategy engine
```

## Events

```txt
onCandleUpdate
onCandleClose
```

## Candle behavior

When tick arrives:

```txt
If tick belongs to current minute:
    update current candle high/low/close

If tick belongs to new minute:
    close previous M1 candle
    create new M1 candle
    notify strategy engine
```

## Deliverables

```txt
Live M1 candle updates correctly
Closed M1 candles are stored
Frontend receives current candle update
```

---

# Phase 4 — 15m Candle Aggregator

## Goal

Build 15m candles from completed 1m candles.

This is important because your Pine Script uses the selected sweep timeframe, default 15m.

## Module

```txt
backend/src/market/htfAggregator.ts
```

## Responsibilities

```txt
Group M1 candles into 15m buckets
Build developing 15m candle
Finalize 15m candle when new 15m period starts
Detect newSweepTimeframeCandle
Send closed 15m candle to sweep engine
```

## 15m candle type

```ts
type HTFCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  candles: Candle[];
  complete: boolean;
  htfIndex: number;
};
```

## Key behavior

If current time changes from:

```txt
12:15–12:30
```

to:

```txt
12:30–12:45
```

Then:

```txt
12:15–12:30 candle is now closed
newSweepTimeframeCandle = true
signal check happens now
```

## Deliverables

```txt
M15 candles built from M1 candles
M15 candle closes exactly on 00, 15, 30, 45
Backend emits new HTF candle close event
```

---

# Phase 5 — Pakistan Session Engine

## Goal

Replicate Pine Script session behavior.

## Module

```txt
backend/src/market/sessionFilter.ts
```

## Settings

```ts
const sessions = [
  { name: "Session 1", start: "12:00", end: "14:00" },
  { name: "Session 2", start: "18:00", end: "19:30" },
];

const timezone = "Asia/Karachi";
```

## Functions

```ts
isInPakistanSession(timestamp): boolean
getActiveSession(timestamp): Session | null
didSessionJustEnd(previousTimestamp, currentTimestamp): boolean
```

## Important behavior

CISD is stored only when:

```txt
inPakistanSession === true
```

If session ends:

```txt
Reset current CISD tracking
```

This matches the Pine Script’s `sessionJustEnded` reset behavior. 

## Deliverables

```txt
Pakistan sessions detected correctly
Frontend highlights sessions
CISD is ignored outside sessions
CISD state resets when session ends
```

---

# Phase 6 — CISD Engine

## Goal

Port the Pine Script CISD logic exactly.

## Module

```txt
backend/src/strategy/cisdEngine.ts
```

## State

```ts
type CisdState = {
  bearishPotentialLevels: CisdPotential[];
  bullishPotentialLevels: CisdPotential[];
};

type CisdPotential = {
  level: number;
  barIndex: number;
};
```

## Output

```ts
type CisdSignal = {
  signal: 0 | 1 | 2;
  originLevel: number | null;
  originIndex: number | null;
  signalBarIndex: number;
  signalTime: number;
};
```

Where:

```txt
0 = no CISD
1 = bearish CISD
2 = bullish CISD
```

## Bearish CISD source

From Pine:

```txt
Previous candle bearish
Current candle bullish
Store current open as bearish potential level
```

Node condition:

```ts
if (prev.close < prev.open && current.close > current.open) {
  bearishPotentialLevels.unshift({
    level: current.open,
    barIndex: current.barIndex,
  });
}
```

## Bullish CISD source

From Pine:

```txt
Previous candle bullish
Current candle bearish
Store current open as bullish potential level
```

Node condition:

```ts
if (prev.close > prev.open && current.close < current.open) {
  bullishPotentialLevels.unshift({
    level: current.open,
    barIndex: current.barIndex,
  });
}
```

## Bearish CISD confirmation

```txt
If close < candidateLevel
```

Then calculate:

```txt
highestClose between candidate and current candle
sourceTop from source candle search
denominator = sourceTop - candidateLevel
validBearCisd =
    denominator != 0 &&
    (highestClose - candidateLevel) / denominator > cisdTolerance
```

If valid:

```txt
cisdSignal = 1
clear bearishPotentialLevels
```

## Bullish CISD confirmation

```txt
If close > candidateLevel
```

Then calculate:

```txt
lowestClose between candidate and current candle
sourceBottom from source candle search
denominator = candidateLevel - sourceBottom
validBullCisd =
    denominator != 0 &&
    (candidateLevel - lowestClose) / denominator > cisdTolerance
```

If valid:

```txt
cisdSignal = 2
clear bullishPotentialLevels
```

## Deliverables

```txt
CISD output matches Pine Script
bearishPotentialLevels work correctly
bullishPotentialLevels work correctly
cisdTolerance default 0.7
CISD origin level and origin bar are saved
```

---

# Phase 7 — CISD Inside Developing 15m Candle

## Goal

Store only the first bullish and bearish CISD inside the current developing 15m candle.

## Module

```txt
backend/src/strategy/htfCisdState.ts
```

## Current HTF CISD state

```ts
type HTFCisdState = {
  bullishCisdSeen: boolean;
  bearishCisdSeen: boolean;

  bullishCisdSignalBar: number | null;
  bearishCisdSignalBar: number | null;

  bullishCisdOriginBar: number | null;
  bearishCisdOriginBar: number | null;

  bullishCisdLevel: number | null;
  bearishCisdLevel: number | null;
};
```

## Behavior

When 1m candle closes:

```txt
Run CISD engine
If inside Pakistan session:
    If bullish CISD and bullishCisdSeen is false:
        store bullish CISD
    If bearish CISD and bearishCisdSeen is false:
        store bearish CISD
```

When new 15m candle starts:

```txt
closedHtfCisd = currentHtfCisd
currentHtfCisd = empty state
```

When session ends:

```txt
currentHtfCisd = empty state
```

## Deliverables

```txt
First bullish CISD inside 15m candle is stored
First bearish CISD inside 15m candle is stored
Closed 15m CISD state is copied on new 15m candle
Current state resets after copying
```

---

# Phase 8 — Sweep Engine

## Goal

Port `findConfirmedBearSweep()` and `findConfirmedBullSweep()` exactly.

## Module

```txt
backend/src/strategy/sweepEngine.ts
```

## Settings

```ts
type SweepSettings = {
  lookback: number; // default 15
  requireSweepReclaim: boolean; // default false
};
```

## Bearish sweep

Use the completed 15m candle as sweep candle.

Equivalent Pine indexing:

```txt
[1] = completed sweep candle
[2] to [lookback + 1] = previous candidate candles
```

Node logic:

```txt
For i = 2 to lookback + 1:
    candidateHigh = candles[index - i].high

    untouched = true

    For j = 2 to i - 1:
        if candles[index - j].high > candidateHigh:
            untouched = false

    wickTaken = sweepCandle.high > candidateHigh

    reclaimValid =
        !requireSweepReclaim ||
        sweepCandle.close < candidateHigh

    if untouched && wickTaken && reclaimValid:
        found bearish sweep
```

## Bullish sweep

```txt
For i = 2 to lookback + 1:
    candidateLow = candles[index - i].low

    untouched = true

    For j = 2 to i - 1:
        if candles[index - j].low < candidateLow:
            untouched = false

    wickTaken = sweepCandle.low < candidateLow

    reclaimValid =
        !requireSweepReclaim ||
        sweepCandle.close > candidateLow

    if untouched && wickTaken && reclaimValid:
        found bullish sweep
```

## Sweep output

```ts
type SweepResult = {
  found: boolean;
  direction: "bullish" | "bearish";
  level: number | null;
  sourceTime: number | null;
  sourceIndex: number | null;
  sweepCandleOpenTime: number;
  sweepCandleCloseTime: number;
};
```

## Deliverables

```txt
Bullish sweep matches Pine Script
Bearish sweep matches Pine Script
Lookback default is 15
Optional reclaim rule works
Source wick time is saved for drawing
```

---

# Phase 9 — Signal Engine

## Goal

Combine closed 15m sweep and closed 15m CISD state.

## Module

```txt
backend/src/strategy/signalEngine.ts
```

## Long entry

```ts
const longEntry =
  newSweepTimeframeCandle &&
  confirmedBullSweep.found &&
  closedHtfCisd.bullishCisdSeen &&
  closedHtfCisd.bullishCisdSignalBar !== null;
```

## Short entry

```ts
const shortEntry =
  newSweepTimeframeCandle &&
  confirmedBearSweep.found &&
  closedHtfCisd.bearishCisdSeen &&
  closedHtfCisd.bearishCisdSignalBar !== null;
```

## Timing

Signal is created on:

```txt
First 1m candle of next 15m candle
```

Example:

```txt
CISD happens: 12:28
15m candle closes: 12:30
Signal marker appears: 12:30
```

## Signal object

```ts
type StrategySignal = {
  id: string;
  symbol: "XAU_USD";
  direction: "long" | "short";
  signalTime: number;
  signalBarIndex: number;

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

  entryPrice: number;
};
```

## Deliverables

```txt
LONG appears only on new 15m candle
SHORT appears only on new 15m candle
No signal appears directly on CISD candle
No sweep/CISD drawings unless signal is confirmed
```

---

# Phase 10 — Drawing Engine

## Goal

Send drawing objects to frontend only for confirmed signals.

## Module

```txt
backend/src/strategy/drawingEngine.ts
```

## Drawing types

```ts
type ChartDrawing =
  | SweepLineDrawing
  | CisdLineDrawing
  | SignalMarkerDrawing
  | SessionBoxDrawing;
```

## Long signal drawings

```txt
Bullish sweep line:
x1 = confirmedBullSourceTime
y1 = confirmedBullSweepLevel
x2 = completedSweepCandleOpenTime
y2 = confirmedBullSweepLevel

Bullish CISD line:
x1 = bullishCisdOriginBarClosed
y1 = bullishCisdLevelClosed
x2 = bullishCisdSignalBarClosed
y2 = bullishCisdLevelClosed

LONG marker:
x = current bar
y = low
```

## Short signal drawings

```txt
Bearish sweep line:
x1 = confirmedBearSourceTime
y1 = confirmedBearSweepLevel
x2 = completedSweepCandleOpenTime
y2 = confirmedBearSweepLevel

Bearish CISD line:
x1 = bearishCisdOriginBarClosed
y1 = bearishCisdLevelClosed
x2 = bearishCisdSignalBarClosed
y2 = bearishCisdLevelClosed

SHORT marker:
x = current bar
y = high
```

## Deliverables

```txt
Frontend receives drawing objects
Only signal-related sweep lines are drawn
Only signal-related CISD lines are drawn
LONG / SHORT markers show on the correct candle
```

---

# Phase 11 — Frontend Chart

## Goal

Create a live web chart similar to TradingView.

## Components

```txt
frontend/src/components/XauChart.tsx
frontend/src/components/SettingsPanel.tsx
frontend/src/components/SignalPanel.tsx
frontend/src/components/TradePanel.tsx
```

## Chart features

```txt
Candlestick chart
Live current candle update
Session background highlight
Sweep lines
CISD lines
LONG / SHORT markers
Current price line
Signal list on the side
```

## Socket events

Backend to frontend:

```txt
candles:initial
candle:update
candle:closed
drawing:new
signal:new
trade:new
```

Frontend to backend:

```txt
settings:update
chart:reload
strategy:reset
```

## Deliverables

```txt
Live XAU chart renders
Candles update without refresh
Signals appear live
Drawings match backend signal objects
```

---

# Phase 12 — Settings Panel

## Goal

Allow changing strategy settings from UI.

## Settings

```ts
type StrategySettings = {
  cisdTolerance: number;
  sweepTimeframe: "15m";
  sweepLookback: number;
  requireSweepReclaim: boolean;

  sessionTimezone: "Asia/Karachi";
  sessionOne: "12:00-14:00";
  sessionTwo: "18:00-19:30";

  showSignalSweeps: boolean;
  showSignalCisdLevels: boolean;
  showEntrySignals: boolean;
};
```

## Default values

```txt
CISD tolerance: 0.7
Sweep timeframe: 15m
Sweep lookback: 15
Require sweep reclaim: false
Session timezone: Asia/Karachi
Session 1: 12:00–14:00
Session 2: 18:00–19:30
```

## Deliverables

```txt
Settings can be changed
Settings persist in database
Strategy can reload with new settings
```

---

# Phase 13 — Paper Trading Engine

## Goal

Track trades without placing real OANDA orders.

## Module

```txt
backend/src/strategy/paperTradeEngine.ts
```

## Trade object

```ts
type PaperTrade = {
  id: string;
  signalId: string;
  symbol: "XAU_USD";
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
};
```

## SL rule

For long:

```txt
SL = sweep candle low / sweep extreme
```

For short:

```txt
SL = sweep candle high / sweep extreme
```

## TP rule

Configurable:

```txt
TP1 = 1R
TP2 = 9R
or single TP = 5R
```

## Deliverables

```txt
Paper trade opens on signal
SL/TP calculated
Trade closes when price hits SL/TP
Trade result is stored
Trade list visible in UI
```

---

# Phase 14 — Database

## Goal

Store candles, signals, drawings, settings, and paper trades.

## Tables

```sql
settings
candles_m1
candles_m15
signals
drawings
paper_trades
strategy_logs
```

## signals table

```sql
id
symbol
direction
signal_time
signal_bar_index
entry_price
sweep_level
sweep_source_time
cisd_level
cisd_origin_bar
cisd_signal_bar
created_at
```

## paper_trades table

```sql
id
signal_id
symbol
direction
entry_time
entry_price
stop_loss
take_profit_1
take_profit_2
status
exit_time
exit_price
result
r_multiple
created_at
updated_at
```

## Deliverables

```txt
Signals saved
Paper trades saved
Settings saved
Historical signals reload on app start
```

---

# Phase 15 — Backtest / Replay Mode

## Goal

Verify Node.js signals against TradingView.

## Replay engine

```txt
Load historical M1 candles
Replay candle-by-candle
Build M15 candles during replay
Run CISD engine
Run sweep engine
Generate signals
Export signals to CSV
```

## CSV output

```txt
time
direction
entryPrice
sweepLevel
cisdLevel
session
sl
tp
result
rMultiple
```

## Why this is important

Before live trading, we need to confirm:

```txt
TradingView signal time = Node.js signal time
TradingView direction = Node.js direction
TradingView sweep line = Node.js sweep line
TradingView CISD line = Node.js CISD line
```

## Deliverables

```txt
Replay historical candles
Generate signals from history
Export CSV
Compare with TradingView screenshots
```

---

# Phase 16 — Alerts

## Goal

Send alerts when new signal appears.

## Alert channels

MVP:

```txt
Browser notification
Sound alert
```

Later:

```txt
Telegram
WhatsApp
Email
```

## Alert message

```txt
XAU/USD LONG
Time: 12:30 Asia/Karachi
Entry: 2345.20
SL: 2341.70
TP1: 2348.70
TP2: 2376.70
Reason: Bullish 15m sweep + bullish 1m CISD
```

## Deliverables

```txt
Alert fires only once per signal
Alert appears in UI
Optional Telegram integration later
```

---

# Phase 17 — Live OANDA Trading

Only start this after the paper system is verified.

## Goal

Place live orders through OANDA.

## Module

```txt
backend/src/oanda/orders.ts
```

## Execution rules

```txt
One trade per signal
One trade per sweep
Do not enter outside Pakistan sessions
Do not enter if spread too high
Do not enter if trading disabled
Do not enter if daily loss limit reached
```

## Order type

First version:

```txt
Market order
Attached stop loss
Attached take profit
```

## Position sizing

Use your preferred style:

```txt
Initial capital input
Investment % input
Leverage input
```

Example:

```txt
Initial capital: $1,000
Investment: 2%
Leverage: 100x

$20 margin x 100 = $2,000 notional
```

## Safety controls

```txt
Enable/disable live trading
Max trades per day
Max daily loss
Max open trades
Close all button
Emergency stop
Practice/live mode indicator
```

## Deliverables

```txt
Practice account trading first
Live order placement
SL/TP attached
Trade status synced from OANDA
Emergency stop available
```

---

# Development Milestones

## Milestone 1 — Base app

```txt
Backend setup
Frontend setup
Socket.IO connection
.env config
Health check
```

Estimated deliverable:

```txt
Blank app connected to backend
```

---

## Milestone 2 — OANDA live chart

```txt
Fetch M1 candles
Render chart
Stream price
Update current candle live
```

Deliverable:

```txt
Live XAU/USD 1m chart
```

---

## Milestone 3 — 15m aggregation

```txt
Build M15 from M1
Detect 15m close
Show optional 15m candle boxes
```

Deliverable:

```txt
Node.js knows exactly when 15m candle closes
```

---

## Milestone 4 — Session engine

```txt
Pakistan session detection
Session highlight on chart
CISD only inside session
Reset state when session ends
```

Deliverable:

```txt
Session behavior matches Pine Script
```

---

## Milestone 5 — CISD engine

```txt
Port bearish potential levels
Port bullish potential levels
Port tolerance formulas
Store origin bars and levels
```

Deliverable:

```txt
CISD signals match Pine Script
```

---

## Milestone 6 — Sweep engine

```txt
Port bullish sweep logic
Port bearish sweep logic
Support lookback 15
Support optional reclaim
```

Deliverable:

```txt
15m sweep detection matches Pine Script
```

---

## Milestone 7 — Combined signals

```txt
Copy current HTF CISD to closed state
Check sweep at new 15m candle
Create LONG/SHORT only at 15m close
```

Deliverable:

```txt
LONG/SHORT markers appear on correct 1m candle
```

---

## Milestone 8 — Drawings

```txt
Draw only signal sweep
Draw only signal CISD
Draw entry marker
Do not draw unused sweeps/CISDs
```

Deliverable:

```txt
Chart visually matches TradingView indicator behavior
```

---

## Milestone 9 — Paper trading

```txt
Create paper trades
Calculate SL from sweep extreme
Calculate TP by R multiple
Track result
Save trades
```

Deliverable:

```txt
Paper trading dashboard
```

---

## Milestone 10 — Replay/backtest

```txt
Load historical candles
Replay candle-by-candle
Export signals/trades CSV
Compare with TradingView
```

Deliverable:

```txt
Validation tool before live trading
```

---

## Milestone 11 — Live execution

```txt
OANDA practice orders
SL/TP orders
Risk controls
Emergency stop
```

Deliverable:

```txt
Practice trading bot
```

---

## Milestone 12 — Production hardening

```txt
Logging
Error handling
Reconnect handling
Database backups
Server deployment
SSL
Auth login
```

Deliverable:

```txt
Production-ready app
```

---

# Exact Signal Flow

This is the most important development flow.

```txt
1. OANDA sends price tick
2. Backend updates current 1m candle
3. When 1m candle closes:
      run CISD detection
      if inside Pakistan session:
          store first bullish/bearish CISD inside current 15m candle

4. When new 15m candle starts:
      copy current HTF CISD state to closed HTF CISD state
      reset current HTF CISD state
      run confirmed sweep detection on completed 15m candle

5. If bullish sweep + bullish CISD:
      create LONG signal

6. If bearish sweep + bearish CISD:
      create SHORT signal

7. Send signal and drawings to frontend

8. Optional:
      create paper trade
```

---

# Validation Checklist

Before live trading, confirm these items:

```txt
M1 candles match OANDA/TradingView
M15 candles match TradingView
Pakistan session timing is correct
CISD appears only inside session
CISD resets after session ends
Bull sweep matches Pine Script
Bear sweep matches Pine Script
Signal appears on first 1m candle after 15m close
No signal appears on CISD candle itself
Only signal-related sweep/CISD is drawn
Replay CSV matches TradingView signals
```

---

# MVP Scope

The first build should include only this:

```txt
Live XAU/USD 1m chart
15m aggregation
Pakistan session highlight
Final Pine Script CISD logic
Final Pine Script sweep logic
LONG/SHORT signal at 15m close
Draw only used sweep/CISD
Paper trade mode
CSV export
```

Do **not** include live orders in the MVP.

---

# Production Scope

After MVP validation:

```txt
OANDA practice trading
Risk settings
SL/TP management
Daily limits
Telegram alerts
User login
Hosted dashboard
Live trading switch
```

---

# Suggested Development Order

```txt
1. Build live chart
2. Add 15m aggregation
3. Add Pakistan sessions
4. Add CISD engine
5. Add sweep engine
6. Add signal engine
7. Add drawings
8. Add paper trades
9. Add replay/backtest
10. Add OANDA practice execution
11. Add live execution
```

This plan keeps the project safe: first we match your final Pine Script (final.pine), then we validate with replay/paper trading, and only after that we connect live execution.
