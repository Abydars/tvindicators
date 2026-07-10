import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  oanda: {
    apiKey: process.env.OANDA_API_KEY || '',
    accountId: process.env.OANDA_ACCOUNT_ID || '',
    env: process.env.OANDA_ENV || 'practice',
    instrument: process.env.OANDA_INSTRUMENT || 'XAU_USD',
    useMockStream: process.env.USE_MOCK_STREAM === 'true',
  },
  port: parseInt(process.env.APP_PORT || '4000', 10),
  dbPath: path.resolve(__dirname, '../../../', process.env.DATABASE_URL || './tvindicators.db'),
  sessionTimezone: process.env.SESSION_TIMEZONE || 'Asia/Karachi',
};

export const getOandaApiUrl = () => {
  return config.oanda.env === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com';
};

export const getOandaStreamUrl = () => {
  return config.oanda.env === 'live'
    ? 'https://stream-fxtrade.oanda.com'
    : 'https://stream-fxpractice.oanda.com';
};
