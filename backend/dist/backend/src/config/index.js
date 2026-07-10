"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOandaStreamUrl = exports.getOandaApiUrl = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env from workspace root
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
exports.config = {
    oanda: {
        apiKey: process.env.OANDA_API_KEY || '',
        accountId: process.env.OANDA_ACCOUNT_ID || '',
        env: process.env.OANDA_ENV || 'practice',
        instrument: process.env.OANDA_INSTRUMENT || 'XAU_USD',
        useMockStream: process.env.USE_MOCK_STREAM === 'true',
    },
    port: parseInt(process.env.APP_PORT || '4000', 10),
    dbPath: path_1.default.resolve(__dirname, '../../../', process.env.DATABASE_URL || './tvindicators.db'),
    sessionTimezone: process.env.SESSION_TIMEZONE || 'Asia/Karachi',
};
const getOandaApiUrl = () => {
    return exports.config.oanda.env === 'live'
        ? 'https://api-fxtrade.oanda.com'
        : 'https://api-fxpractice.oanda.com';
};
exports.getOandaApiUrl = getOandaApiUrl;
const getOandaStreamUrl = () => {
    return exports.config.oanda.env === 'live'
        ? 'https://stream-fxtrade.oanda.com'
        : 'https://stream-fxpractice.oanda.com';
};
exports.getOandaStreamUrl = getOandaStreamUrl;
