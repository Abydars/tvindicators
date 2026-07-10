"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const config_1 = require("../config");
// Verbose mode to help with debugging
const sqlite = sqlite3_1.default.verbose();
class Database {
    db;
    init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite.Database(config_1.config.dbPath, (err) => {
                if (err) {
                    console.error('Failed to connect to SQLite database:', err);
                    return reject(err);
                }
                console.log(`Connected to SQLite database at: ${config_1.config.dbPath}`);
                this.createTables()
                    .then(() => resolve())
                    .catch((err) => reject(err));
            });
        });
    }
    createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // 1. Settings Table
                this.db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `);
                // 2. Signals Table
                this.db.run(`
          CREATE TABLE IF NOT EXISTS signals (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            direction TEXT,
            signal_time INTEGER,
            signal_bar_index INTEGER,
            entry_price REAL,
            sweep_level REAL,
            sweep_source_time INTEGER,
            completed_sweep_candle_open_time INTEGER,
            cisd_level REAL,
            cisd_origin_bar INTEGER,
            cisd_signal_bar INTEGER,
            created_at INTEGER
          )
        `);
                // 3. Paper Trades Table
                this.db.run(`
          CREATE TABLE IF NOT EXISTS paper_trades (
            id TEXT PRIMARY KEY,
            signal_id TEXT,
            symbol TEXT,
            direction TEXT,
            entry_time INTEGER,
            entry_price REAL,
            stop_loss REAL,
            take_profit_1 REAL,
            take_profit_2 REAL,
            status TEXT,
            result TEXT,
            exit_time INTEGER,
            exit_price REAL,
            r_multiple REAL,
            created_at INTEGER
          )
        `, (err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        });
    }
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err)
                    return reject(err);
                resolve(row || null);
            });
        });
    }
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
    }
    // --- Settings helpers ---
    async getSettings() {
        try {
            const row = await this.get('SELECT value FROM settings WHERE key = ?', ['strategy_settings']);
            if (!row)
                return null;
            return JSON.parse(row.value);
        }
        catch (e) {
            console.error('Error fetching settings:', e);
            return null;
        }
    }
    async saveSettings(settings) {
        await this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['strategy_settings', JSON.stringify(settings)]);
    }
    // --- Signals helpers ---
    async saveSignal(signal) {
        await this.run(`INSERT OR REPLACE INTO signals (
        id, symbol, direction, signal_time, signal_bar_index, entry_price,
        sweep_level, sweep_source_time, completed_sweep_candle_open_time,
        cisd_level, cisd_origin_bar, cisd_signal_bar, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            signal.id,
            signal.symbol,
            signal.direction,
            signal.signalTime,
            signal.signalBarIndex,
            signal.entryPrice,
            signal.sweep.level,
            signal.sweep.sourceTime,
            signal.sweep.completedSweepCandleOpenTime,
            signal.cisd.level,
            signal.cisd.originBar,
            signal.cisd.signalBar,
            Date.now(),
        ]);
    }
    async getSignals() {
        const rows = await this.all('SELECT * FROM signals ORDER BY signal_time ASC');
        return rows.map((row) => ({
            id: row.id,
            symbol: row.symbol,
            direction: row.direction,
            signalTime: row.signal_time,
            signalBarIndex: row.signal_bar_index,
            entryPrice: row.entry_price,
            sweep: {
                level: row.sweep_level,
                sourceTime: row.sweep_source_time,
                completedSweepCandleOpenTime: row.completed_sweep_candle_open_time,
            },
            cisd: {
                level: row.cisd_level,
                originBar: row.cisd_origin_bar,
                signalBar: row.cisd_signal_bar,
            },
        }));
    }
    // --- Paper Trades helpers ---
    async savePaperTrade(trade) {
        await this.run(`INSERT OR REPLACE INTO paper_trades (
        id, signal_id, symbol, direction, entry_time, entry_price,
        stop_loss, take_profit_1, take_profit_2, status, result,
        exit_time, exit_price, r_multiple, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            trade.id,
            trade.signalId,
            trade.symbol,
            trade.direction,
            trade.entryTime,
            trade.entryPrice,
            trade.stopLoss,
            trade.takeProfit1 || null,
            trade.takeProfit2 || null,
            trade.status,
            trade.result || null,
            trade.exitTime || null,
            trade.exitPrice || null,
            trade.rMultiple || null,
            trade.entryTime, // use entry time as created_at
        ]);
    }
    async getPaperTrades() {
        const rows = await this.all('SELECT * FROM paper_trades ORDER BY entry_time DESC');
        return rows.map((row) => ({
            id: row.id,
            signalId: row.signal_id,
            symbol: row.symbol,
            direction: row.direction,
            entryTime: row.entry_time,
            entryPrice: row.entry_price,
            stopLoss: row.stop_loss,
            takeProfit1: row.take_profit_1 || undefined,
            takeProfit2: row.take_profit_2 || undefined,
            status: row.status,
            result: row.result || undefined,
            exitTime: row.exit_time || undefined,
            exitPrice: row.exit_price || undefined,
            rMultiple: row.r_multiple !== null ? row.r_multiple : undefined,
        }));
    }
}
exports.db = new Database();
exports.default = exports.db;
