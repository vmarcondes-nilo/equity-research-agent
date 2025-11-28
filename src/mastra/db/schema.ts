// ============================================================================
// DATABASE SCHEMA FOR PORTFOLIO OPTIMIZER
// ============================================================================
// Defines the database tables for persisting portfolio data:
// - portfolios: Main portfolio configuration
// - holdings: Current stock holdings
// - transactions: Buy/sell history
// - snapshots: Monthly portfolio snapshots for performance tracking
// - scores: Stock scoring history for analysis
// ============================================================================

import { homedir } from 'os';
import { join } from 'path';

// Use dynamic import for @libsql/client since it's a transitive dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbClient: any = null;

// Persistent database location in user's home directory
const DB_DIR = join(homedir(), 'equity-research-agent', 'data');
const DB_PATH = join(DB_DIR, 'portfolio.db');

// ============================================================================
// DATABASE CLIENT
// ============================================================================

export async function getDbClient(): Promise<any> {
  if (!dbClient) {
    // Ensure data directory exists
    const { mkdir } = await import('fs/promises');
    await mkdir(DB_DIR, { recursive: true });

    // Dynamic import to work with the transitive dependency
    const { createClient } = await import('@libsql/client');
    dbClient = createClient({
      url: `file:${DB_PATH}`,
    });
  }
  return dbClient;
}

// ============================================================================
// SCHEMA DEFINITIONS (SQL)
// ============================================================================

export const SCHEMA_SQL = `
-- Portfolio configuration
CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'value',
  initial_capital REAL NOT NULL,
  current_cash REAL NOT NULL,
  target_holdings INTEGER NOT NULL DEFAULT 20,
  max_position_pct REAL NOT NULL DEFAULT 0.10,
  min_position_pct REAL NOT NULL DEFAULT 0.02,
  max_sector_pct REAL NOT NULL DEFAULT 0.25,
  max_monthly_turnover INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Current holdings
CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  shares REAL NOT NULL,
  avg_cost REAL NOT NULL,
  current_price REAL,
  sector TEXT,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
  UNIQUE(portfolio_id, ticker)
);

-- Transaction history
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  shares REAL NOT NULL,
  price REAL NOT NULL,
  total_value REAL NOT NULL,
  reason TEXT,
  score_at_trade REAL,
  executed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

-- Monthly portfolio snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_value REAL NOT NULL,
  cash_value REAL NOT NULL,
  holdings_value REAL NOT NULL,
  holdings_count INTEGER NOT NULL,
  period_return_pct REAL,
  cumulative_return_pct REAL,
  spy_period_return_pct REAL,
  spy_cumulative_return_pct REAL,
  alpha_pct REAL,
  holdings_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

-- Stock scores for analysis
CREATE TABLE IF NOT EXISTS stock_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  score_date TEXT NOT NULL,
  total_score REAL NOT NULL,
  value_score REAL,
  quality_score REAL,
  growth_score REAL,
  momentum_score REAL,
  risk_score REAL,
  pe_ratio REAL,
  pb_ratio REAL,
  dividend_yield REAL,
  revenue_growth REAL,
  profit_margin REAL,
  beta REAL,
  market_cap REAL,
  sector TEXT,
  raw_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(executed_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON snapshots(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_scores_ticker ON stock_scores(ticker);
CREATE INDEX IF NOT EXISTS idx_scores_date ON stock_scores(score_date);
`;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Portfolio {
  id: string;
  name: string;
  strategy: 'value' | 'growth' | 'balanced';
  initialCapital: number;
  currentCash: number;
  targetHoldings: number;
  maxPositionPct: number;
  minPositionPct: number;
  maxSectorPct: number;
  maxMonthlyTurnover: number;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  id?: number;
  portfolioId: string;
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number | null;
  sector: string | null;
  acquiredAt: string;
  updatedAt: string;
}

export interface Transaction {
  id?: number;
  portfolioId: string;
  ticker: string;
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  totalValue: number;
  reason: string | null;
  scoreAtTrade: number | null;
  executedAt: string;
}

export interface Snapshot {
  id?: number;
  portfolioId: string;
  snapshotDate: string;
  totalValue: number;
  cashValue: number;
  holdingsValue: number;
  holdingsCount: number;
  periodReturnPct: number | null;
  cumulativeReturnPct: number | null;
  spyPeriodReturnPct: number | null;
  spyCumulativeReturnPct: number | null;
  alphaPct: number | null;
  holdingsData: HoldingSnapshot[];
  createdAt: string;
}

export interface HoldingSnapshot {
  ticker: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
  sector: string;
  gainPct: number;
}

export interface StockScore {
  id?: number;
  ticker: string;
  scoreDate: string;
  totalScore: number;
  valueScore: number | null;
  qualityScore: number | null;
  growthScore: number | null;
  momentumScore: number | null;
  riskScore: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  beta: number | null;
  marketCap: number | null;
  sector: string | null;
  rawData: Record<string, unknown> | null;
  createdAt: string;
}

// ============================================================================
// INITIALIZE DATABASE
// ============================================================================

export async function initializeDatabase(): Promise<void> {
  const client = await getDbClient();

  // Split schema into individual statements and execute
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.execute(statement);
  }

  console.log('Portfolio database initialized successfully');
}

// ============================================================================
// END OF SCHEMA
// ============================================================================
