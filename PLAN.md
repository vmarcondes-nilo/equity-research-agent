# S&P 500 Portfolio Optimizer Agent - Implementation Plan

## Overview

Create an autonomous agent that analyzes the S&P 500 universe, constructs an optimal portfolio, persists it to a database, and provides monthly performance tracking, review, and rebalancing capabilities.

---

## Existing Tools & Workflows to REUSE

### Existing Tools (NO need to recreate)

| Tool | File | What It Provides | How We'll Use It |
|------|------|------------------|------------------|
| `screenStocksTool` | screener-tools.ts | Filter stocks by P/E, market cap, sector, dividend, beta | Screen candidates by criteria |
| `compareCompaniesTool` | screener-tools.ts | Side-by-side comparison of 2-10 stocks | Compare top candidates |
| `getStockPriceTool` | equity-tools.ts | Current price, change, volume, 52-week range | Get current prices for holdings |
| `getFinancialsTool` | equity-tools.ts | P/E, EPS, dividend, margins, debt-to-equity, beta | Quick metrics for scoring |
| `getFinancialRatiosTool` | fundamental-tools.ts | Complete 5-category ratio analysis (profitability, liquidity, leverage, efficiency, valuation) | **Primary scoring data source** |
| `getBalanceSheetTool` | fundamental-tools.ts | Assets, liabilities, cash, debt, liquidity ratios | Quality factor scoring |
| `getCashFlowTool` | fundamental-tools.ts | Operating CF, Free CF, CapEx | Quality/growth factor scoring |
| `getBetaVolatilityTool` | risk-tools.ts | Beta, moving averages, trend signals | Risk factor scoring |
| `getDrawdownAnalysisTool` | risk-tools.ts | Max drawdown, recovery metrics | Risk factor scoring |
| `getSectorExposureTool` | risk-tools.ts | Sector, industry, market cap category | Sector diversification |
| `getShortInterestTool` | risk-tools.ts | Short interest, squeeze risk | Sentiment/risk factor |
| `getAnalystRatingsTool` | sentiment-tools.ts | Buy/hold/sell consensus | Sentiment factor scoring |

### Existing Workflows to REUSE

| Workflow | File | How We'll Use It |
|----------|------|------------------|
| `stockScreenerWorkflow` | screener-workflow.ts | Extend for universe screening (modify to handle larger universe) |
| `portfolioAnalysisWorkflow` | portfolio-workflow.ts | **Reuse directly** for portfolio review - already calculates weighted beta, sector allocation, diversification score |

### Existing Code Patterns to Follow

1. **Batch processing**: `screenStocksTool` already batches 20 stocks at a time - follow this pattern
2. **Risk metrics**: `assessPortfolioRisk` step in portfolio-workflow.ts already calculates weighted beta, sector allocation, concentration
3. **Synthesis agents**: All workflows use agent synthesis for final output - follow same pattern

---

## Phase 1: Expand Stock Universe

### 1.1 Create S&P 500 Stock List (NEW)

**File**: `src/mastra/data/sp500-stocks.ts`

Extend the existing `STOCK_UNIVERSE` pattern from screener-tools.ts to include full S&P 500:

```typescript
// Extend the existing pattern from screener-tools.ts
export const SP500_STOCKS: Record<string, string[]> = {
  // Same structure as STOCK_UNIVERSE but with all ~500 stocks
  'Technology': ['AAPL', 'MSFT', 'NVDA', ...], // ~70 stocks
  // ... all 11 GICS sectors
};

export const ALL_SP500_TICKERS: string[] = Object.values(SP500_STOCKS).flat();
```

### 1.2 Update screenStocksTool (MODIFY existing)

**File**: `src/mastra/tools/screener-tools.ts`

- Add option to use expanded S&P 500 universe
- Keep existing `STOCK_UNIVERSE` as default for backward compatibility
- Add `universe: 'default' | 'sp500'` parameter

---

## Phase 2: Portfolio Database & Persistence (NEW)

### 2.1 Database Schema

**File**: `src/mastra/db/schema.ts`

```typescript
// Portfolio table
export interface Portfolio {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived';
  strategy: string;
  initialCapital: number;
  currentValue: number;
}

// Holdings
export interface PortfolioHolding {
  id: string;
  portfolioId: string;
  ticker: string;
  shares: number;
  targetWeight: number;
  entryPrice: number;
  entryDate: Date;
  rationale: string;
}

// Monthly Snapshots
export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  snapshotDate: Date;
  totalValue: number;
  totalReturn: number;
  monthlyReturn: number;
  benchmarkReturn: number;
  alpha: number;
  holdings: string; // JSON
}

// Rebalance History
export interface RebalanceEvent {
  id: string;
  portfolioId: string;
  eventDate: Date;
  eventType: string;
  changes: string; // JSON
}
```

### 2.2 Portfolio Repository (NEW)

**File**: `src/mastra/db/portfolio-repository.ts`

Uses existing LibSQL setup from `index.ts`.

---

## Phase 3: Stock Scoring System (NEW - but uses existing tools)

### 3.1 Multi-Factor Scoring Tool (NEW)

**File**: `src/mastra/tools/stock-scoring-tools.ts`

This tool **orchestrates existing tools** to create a composite score:

```typescript
export const scoreStockTool = createTool({
  id: 'score-stock',
  description: 'Score a stock using multi-factor model',
  inputSchema: z.object({
    ticker: z.string(),
    strategy: z.enum(['value', 'growth', 'balanced', 'dividend', 'momentum']),
  }),
  execute: async ({ context, runtimeContext }) => {
    // REUSE existing tools to gather data
    const [ratios, risk, sentiment] = await Promise.all([
      getFinancialRatiosTool.execute({ context: { ticker }, runtimeContext }),
      getBetaVolatilityTool.execute({ context: { ticker }, runtimeContext }),
      getAnalystRatingsTool.execute({ context: { ticker }, runtimeContext }),
    ]);

    // Calculate factor scores from existing tool outputs
    const valueScore = calculateValueScore(ratios.valuation);
    const qualityScore = calculateQualityScore(ratios.profitability, ratios.liquidity);
    const momentumScore = calculateMomentumScore(risk);
    const growthScore = calculateGrowthScore(ratios.profitability);
    const riskScore = calculateRiskScore(risk, ratios.leverage);

    // Weight by strategy
    return weightedScore(strategy, { valueScore, qualityScore, momentumScore, growthScore, riskScore });
  }
});
```

**Key insight**: This tool doesn't fetch new data - it **reuses existing tools** and applies scoring logic.

---

## Phase 4: Portfolio Construction Workflow (NEW - extends existing)

### 4.1 Portfolio Construction Workflow

**File**: `src/mastra/workflows/portfolio-construction-workflow.ts`

```typescript
export const portfolioConstructionWorkflow = createWorkflow({
  id: 'portfolio-construction-workflow',
  inputSchema: z.object({
    strategy: z.enum(['value', 'growth', 'balanced', 'dividend', 'momentum']).default('value'),
    initialCapital: z.number().default(100000),
    targetPositions: z.number().default(20),
  }),
})
  .then(screenUniverseStep)        // Uses screenStocksTool internally (S&P 500)
  .then(scoreAndRankStep)          // Uses scoreStockTool (value-weighted scoring)
  .then(selectStocksStep)          // Select top 20 with sector constraints
  .then(calculateWeightsStep)      // Agent determines weights (2-10% per stock)
  .then(persistPortfolioStep)      // Save to database
  .then(synthesizeReportStep)      // AI synthesis with value rationale
```

---

## Phase 5: Portfolio Optimizer Agent (NEW)

**File**: `src/mastra/agents/portfolio-optimizer-agent.ts`

```typescript
export const portfolioOptimizerAgent = new Agent({
  name: 'Portfolio Optimizer',
  model: openai('gpt-4o'),
  instructions: `...`,
  tools: {
    // REUSE existing tools
    screenStocksTool,
    compareCompaniesTool,
    getFinancialRatiosTool,
    getBetaVolatilityTool,
    getAnalystRatingsTool,
    // NEW tools (only these are new)
    scoreStockTool,
  },
  workflows: {
    // REUSE existing
    portfolioAnalysisWorkflow,    // Already exists!
    stockScreenerWorkflow,        // Already exists!
    // NEW workflows
    portfolioConstructionWorkflow,
    portfolioRebalanceWorkflow,
  },
  memory: new Memory(),
});
```

---

## Phase 6: Performance Tracking (MOSTLY REUSE)

### 6.1 Extend Existing portfolioAnalysisWorkflow

The existing `portfolioAnalysisWorkflow` already:
- Fetches current prices for holdings
- Calculates gain/loss, weights
- Calculates weighted beta, sector allocation
- Generates AI synthesis

**We only need to ADD**:
- Benchmark comparison (fetch SPY returns)
- Snapshot persistence to database
- Alpha calculation

### 6.2 Performance Tracking Tool (NEW - minimal)

**File**: `src/mastra/tools/performance-tools.ts`

```typescript
export const getBenchmarkReturnTool = createTool({
  id: 'get-benchmark-return',
  description: 'Get S&P 500 (SPY) returns for comparison',
  inputSchema: z.object({
    period: z.enum(['1m', '3m', '6m', '1y', 'ytd']),
  }),
  execute: async ({ context }) => {
    // REUSE getDrawdownAnalysisTool pattern for SPY
    const spyData = await getDrawdownAnalysisTool.execute({
      context: { ticker: 'SPY', period: context.period }
    });
    return { benchmarkReturn: spyData.periodReturn };
  }
});

export const saveSnapshotTool = createTool({
  id: 'save-portfolio-snapshot',
  description: 'Save monthly portfolio snapshot to database',
  // Persists to database
});
```

---

## Phase 7: Monthly Review & Rebalancing (NEW)

### 7.1 Monthly Portfolio Review Workflow

This is the **core monthly process** that evaluates the entire portfolio and decides what to buy/sell.

**File**: `src/mastra/workflows/monthly-review-workflow.ts`

```typescript
export const monthlyReviewWorkflow = createWorkflow({
  id: 'monthly-review-workflow',
  inputSchema: z.object({
    portfolioId: z.string(),
  }),
})
  // PHASE 1: Current Portfolio Analysis
  .then(loadCurrentPortfolioStep)      // Load holdings from database
  .then(fetchCurrentPricesStep)        // Get current prices (batched, rate-limited)
  .then(calculatePerformanceStep)      // Calculate returns, P&L for each holding
  .then(fetchBenchmarkStep)            // Get SPY returns for comparison

  // PHASE 2: Re-evaluate Holdings (should we SELL any?)
  .then(rescoreCurrentHoldingsStep)    // Re-score all current holdings
  .then(identifySellCandidatesStep)    // Flag underperformers to sell

  // PHASE 3: Find New Opportunities (should we BUY any?)
  .then(screenUniverseForNewStocksStep) // Screen S&P 500 for candidates
  .then(scoreNewCandidatesStep)         // Score top candidates
  .then(identifyBuyCandidatesStep)      // Select best new stocks to buy

  // PHASE 4: Generate Trade Plan
  .then(generateTradeListStep)          // Create buy/sell orders
  .then(validateConstraintsStep)        // Check sector limits, position sizes

  // PHASE 5: Execute & Record
  .then(updateHoldingsStep)             // Update database with new holdings
  .then(createSnapshotStep)             // Save monthly snapshot
  .then(synthesizeReportStep)           // AI generates monthly report
```

### 7.2 Sell Decision Logic

A stock is flagged for SELL if:
- **Score dropped significantly**: Current score < original score - 15 points
- **Underperforming**: Stock return < benchmark return - 10% (over holding period)
- **Fundamentals deteriorated**: Key ratios worsened (e.g., debt increased, margins dropped)
- **Better opportunity**: A new candidate scores 20+ points higher

### 7.3 Buy Decision Logic

A stock is selected for BUY if:
- **High score**: In top 10% of screened universe
- **Not already held**: New position
- **Sector fits**: Adding it doesn't exceed sector limit (25%)
- **Replaces weaker holding**: Better than lowest-scoring current holding

---

## Phase 8: Rate Limiting Strategy

### 8.1 Yahoo Finance API Constraints

**Known limits**:
- ~2000 requests/hour (soft limit, varies)
- Batching: Can request multiple tickers in some endpoints
- Risk of IP blocking if too aggressive

### 8.2 Rate Limiting Implementation

**File**: `src/mastra/lib/rate-limiter.ts`

```typescript
export class RateLimiter {
  private requestCount = 0;
  private windowStart = Date.now();

  // Conservative: 1000 requests/hour = ~16/minute = 1 every 4 seconds
  private readonly MAX_REQUESTS_PER_HOUR = 1000;
  private readonly MIN_DELAY_MS = 500; // Minimum 500ms between requests

  async throttle(): Promise<void> {
    // Wait if needed
  }
}

export const yahooRateLimiter = new RateLimiter();
```

### 8.3 Batched Processing Pattern

```typescript
// Process stocks in batches with delays
async function processStocksWithRateLimit(
  tickers: string[],
  processFn: (ticker: string) => Promise<any>,
  options: { batchSize: number; delayBetweenBatches: number }
) {
  const results = [];
  const batches = chunk(tickers, options.batchSize);

  for (const batch of batches) {
    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(ticker => processFn(ticker))
    );
    results.push(...batchResults);

    // Wait between batches
    await sleep(options.delayBetweenBatches);
  }

  return results;
}
```

### 8.4 Monthly Review Timing Budget

For ~500 S&P 500 stocks with 20-stock portfolio:

| Operation | Requests | Time Estimate |
|-----------|----------|---------------|
| Screen universe (basic quote) | ~500 / 20 batches = 25 batched calls | ~15 seconds |
| Score top 50 value candidates (3 API calls each) | 150 requests | ~3 minutes |
| Re-score 20 current holdings (3 API calls each) | 60 requests | ~60 seconds |
| Benchmark data (SPY) | 1 request | instant |
| **Total** | ~236 requests | **~5 minutes** |

This is well within the hourly limit and allows multiple runs if needed.

---

## Phase 9: Clear Monthly Workflow Definition

### 9.1 The Monthly Process (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONTHLY PORTFOLIO REVIEW                      │
│                    (Runs on 1st of each month)                   │
└─────────────────────────────────────────────────────────────────┘

STEP 1: LOAD & MEASURE
├── Load current portfolio from database
├── Fetch current prices for all holdings (batched)
├── Calculate: current value, P&L, individual returns
├── Fetch SPY return for benchmark comparison
└── Output: Portfolio snapshot with performance metrics

STEP 2: EVALUATE CURRENT HOLDINGS (SELL DECISIONS)
├── For each holding:
│   ├── Re-fetch financial ratios (reuse getFinancialRatiosTool)
│   ├── Re-calculate factor score
│   ├── Compare: current score vs entry score
│   └── Flag if: score dropped >15 pts OR underperforming benchmark by >10%
├── Rank holdings by "keep score" (current score + momentum)
└── Output: List of SELL candidates (bottom performers)

STEP 3: SCREEN FOR NEW OPPORTUNITIES (BUY DECISIONS)
├── Screen S&P 500 universe with strategy filters (reuse screenStocksTool)
├── Get top 100 candidates by initial criteria
├── Score each candidate (reuse scoreStockTool with rate limiting)
├── Filter out: already held, sector would exceed 25%
├── Rank by composite score
└── Output: List of BUY candidates (top 10 new stocks)

STEP 4: GENERATE TRADE PLAN
├── Match sells to buys (e.g., sell 3, buy 3)
├── Calculate share quantities based on:
│   ├── Proceeds from sells
│   ├── Target weights (equal-weight or score-weighted)
│   └── Current cash balance
├── Validate constraints:
│   ├── No position > 10%
│   ├── No sector > 25%
│   └── Minimum 6 sectors
└── Output: Trade list with {ticker, action, shares, reason}

STEP 5: EXECUTE & RECORD
├── Update database:
│   ├── Remove sold holdings
│   ├── Add new holdings with entry price, date, rationale
│   ├── Update portfolio total value
│   └── Record rebalance event with full trade list
├── Create monthly snapshot:
│   ├── Total value, return since inception, monthly return
│   ├── Benchmark return, alpha
│   └── Holdings snapshot (JSON)
└── Output: Confirmation + updated portfolio state

STEP 6: GENERATE REPORT
├── AI synthesizes monthly report:
│   ├── Performance summary (vs benchmark)
│   ├── Winners & losers this month
│   ├── Trades executed with rationale
│   ├── New portfolio composition
│   ├── Sector allocation
│   └── Outlook for next month
└── Output: Formatted monthly report
```

### 9.2 Agent Responsibilities

**`portfolioOptimizerAgent`** orchestrates the entire monthly process:

```typescript
const portfolioOptimizerAgent = new Agent({
  name: 'Portfolio Optimizer',
  instructions: `
    You are a VALUE-focused portfolio manager running a $100,000 S&P 500 portfolio.

    ## Portfolio Configuration
    - Strategy: VALUE (low P/E, P/B, strong fundamentals, dividends)
    - Holdings: 20 stocks
    - Cash Reserve: 0% (fully invested)
    - Max Turnover: 5 stocks per month

    ## Position Sizing (Your Discretion)
    You determine position sizes based on conviction, within these bounds:
    - Minimum: 2% per stock
    - Maximum: 10% per stock
    - Sector Maximum: 25%

    Higher conviction = larger position. Consider:
    - Valuation gap (how undervalued vs fair value)
    - Quality score (profitability, balance sheet strength)
    - Risk metrics (prefer lower beta for larger positions)

    ## Monthly Review Process
    1. Run monthlyReviewWorkflow
    2. Present trade recommendations with rationale
    3. Execute trades (max 10 sells + 10 buys)

    ## SELL Decision (flag up to 10)
    - Score dropped >15 points from entry
    - Underperforming benchmark by >10%
    - Better value opportunity available (new stock scores 20+ higher)
    - Fundamentals deteriorated (margins down, debt up)

    ## BUY Decision (replace sells)
    - Top value scores in S&P 500
    - Not already held
    - Sector won't exceed 25%
    - Clear margin of safety (trading below intrinsic value)

    ## Value Scoring Weights
    - Value metrics: 40% (P/E, P/B, P/S, EV/EBITDA, dividend yield)
    - Quality metrics: 30% (ROE, ROA, margins, debt-to-equity)
    - Risk metrics: 15% (beta, volatility)
    - Growth metrics: 10% (revenue/earnings growth)
    - Momentum: 5% (trend confirmation)

    ## Always
    - Explain WHY each stock is undervalued
    - Show valuation vs peers and historical
    - Compare portfolio return to SPY benchmark
    - Justify position sizes based on conviction
  `,
  workflows: {
    monthlyReviewWorkflow,
    portfolioAnalysisWorkflow,
  },
});
```

---

## Summary: New vs Reused Components

### NEW Files (9 files)
```
src/mastra/
├── data/
│   └── sp500-stocks.ts              # S&P 500 ticker list
├── db/
│   ├── schema.ts                    # Database types
│   └── portfolio-repository.ts      # Database operations
├── lib/
│   └── rate-limiter.ts              # Yahoo Finance rate limiting
├── tools/
│   ├── stock-scoring-tools.ts       # Multi-factor scoring (uses existing tools)
│   └── performance-tools.ts         # Benchmark + snapshot (minimal)
├── workflows/
│   ├── portfolio-construction-workflow.ts  # Initial portfolio creation
│   └── monthly-review-workflow.ts          # Monthly rebalance + buy/sell
└── agents/
    └── portfolio-optimizer-agent.ts
```

### MODIFIED Files (2 files)
```
src/mastra/
├── tools/
│   └── screener-tools.ts           # Add 'sp500' universe option + rate limiting
└── index.ts                        # Register new components
```

### REUSED (no changes needed)
- All 12 existing tools (called internally by new tools)
- `portfolioAnalysisWorkflow` (for ad-hoc portfolio reviews)
- Existing database setup (LibSQL)
- Existing agent patterns and synthesis approach

---

## Implementation Order

### Sprint 1: Foundation
1. Create `sp500-stocks.ts` with full S&P 500 list
2. Create `rate-limiter.ts` for Yahoo Finance throttling
3. Add `universe` parameter to `screenStocksTool`
4. Create database schema and repository

### Sprint 2: Scoring
1. Create `scoreStockTool` (orchestrates existing tools with rate limiting)
2. Test scoring on sample stocks (verify rate limiting works)

### Sprint 3: Initial Portfolio Construction
1. Create `portfolioConstructionWorkflow`
2. Create `portfolioOptimizerAgent`
3. Test end-to-end: create initial 30-stock portfolio

### Sprint 4: Monthly Review Workflow
1. Create `monthlyReviewWorkflow` with all 6 phases
2. Implement sell decision logic
3. Implement buy decision logic
4. Test full monthly cycle

### Sprint 5: Persistence & Tracking
1. Create `saveSnapshotTool` and `getBenchmarkReturnTool`
2. Implement snapshot creation
3. Test performance tracking over multiple "months" (simulated)

---

## Monthly Workflow Summary

```
┌────────────────────────────────────────────────────────────┐
│                 MONTHLY REVIEW WORKFLOW                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  INPUT: portfolioId                                        │
│                                                            │
│  TOOLS USED:                                               │
│  ├── getStockPriceTool (existing)     → current prices     │
│  ├── getFinancialRatiosTool (existing)→ re-score holdings  │
│  ├── getBetaVolatilityTool (existing) → risk metrics       │
│  ├── getAnalystRatingsTool (existing) → sentiment          │
│  ├── screenStocksTool (modified)      → find new stocks    │
│  ├── scoreStockTool (new)             → composite scores   │
│  ├── getBenchmarkReturnTool (new)     → SPY comparison     │
│  └── saveSnapshotTool (new)           → persist snapshot   │
│                                                            │
│  WORKFLOWS USED:                                           │
│  └── portfolioAnalysisWorkflow (existing) → risk metrics   │
│                                                            │
│  OUTPUT:                                                   │
│  ├── Trade list: [{ticker, action, shares, reason}]        │
│  ├── Updated holdings in database                          │
│  ├── Monthly snapshot saved                                │
│  └── AI-generated monthly report                           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Configuration Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Initial Capital** | $100,000 | Starting portfolio value |
| **Position Sizing** | Agent-determined | Based on opportunity/conviction, but must maintain diversification |
| **Number of Holdings** | 20 stocks | Target portfolio size |
| **Strategy** | Value | Focus on undervalued stocks (low P/E, P/B, high dividend yield, strong fundamentals) |
| **Cash Reserve** | 0% | Fully invested |
| **Max Turnover** | 10 stocks/month | Maximum replacements per monthly review |

### Position Sizing Rules

Since position sizing is agent-determined based on conviction:

```
Position Size Constraints:
├── Minimum: 2% per stock (ensures meaningful position)
├── Maximum: 10% per stock (prevents over-concentration)
├── Sector Maximum: 25% (diversification)
└── Agent discretion within these bounds based on:
    ├── Composite score (higher score = can allocate more)
    ├── Conviction level (valuation gap to fair value)
    ├── Risk metrics (lower beta = can allocate more)
    └── Sector balance needs
```

### Value Strategy Scoring Weights

For the **Value** strategy, factor weights are:

| Factor | Weight | Key Metrics |
|--------|--------|-------------|
| **Value** | 40% | P/E, P/B, P/S, EV/EBITDA, dividend yield |
| **Quality** | 30% | ROE, ROA, profit margins, debt-to-equity |
| **Risk** | 15% | Beta, volatility, drawdown |
| **Growth** | 10% | Revenue growth, earnings growth |
| **Momentum** | 5% | 52-week performance, trend signals |

### Monthly Turnover Rules

With max 10 stocks/month turnover (up to 50% of portfolio):

```
SELL: Up to 10 weakest holdings (if they meet sell criteria)
BUY:  Up to 10 new stocks to replace sells (or fewer if fewer sells)

If no holdings meet sell criteria → no trades that month
If only 3 meet sell criteria → sell 3, buy 3
```

This allows for significant portfolio restructuring when market conditions warrant, while still preventing complete overhaul in a single month.
