# Workflow Data Reference

This document outlines what data is available to each workflow and where it comes from.

## Available Yahoo Finance Data Sources

### 1. `yf.quote(ticker)` - Basic Quote Data
Returns real-time price and trading data:
- `regularMarketPrice` - Current price
- `regularMarketPreviousClose` - Previous close
- `regularMarketVolume` - Trading volume
- `marketCap` - Market capitalization
- `regularMarketDayHigh` / `regularMarketDayLow` - Daily range
- `fiftyTwoWeekHigh` / `fiftyTwoWeekLow` - 52-week range
- `sharesOutstanding` - Total shares
- `dividendYield` - Dividend yield (decimal)
- `longName` / `shortName` - Company name
- `beta` - Beta (some tickers)

### 2. `yf.quoteSummary(ticker, { modules: ['financialData'] })` - Financial Metrics
Returns latest financial data:
- `totalRevenue` - Latest revenue
- `grossProfits` - Gross profit
- `ebitda` - EBITDA
- `operatingCashflow` - Operating cash flow
- `freeCashflow` - Free cash flow
- `totalCash` - Cash and equivalents
- `totalDebt` - Total debt
- `totalCashPerShare` - Cash per share
- `revenuePerShare` - Revenue per share
- `debtToEquity` - Debt-to-equity ratio
- `currentRatio` - Current ratio
- `quickRatio` - Quick ratio
- `grossMargins` - Gross margin (decimal)
- `ebitdaMargins` - EBITDA margin (decimal)
- `operatingMargins` - Operating margin (decimal)
- `profitMargins` - Profit margin (decimal)
- `returnOnEquity` - ROE (decimal)
- `returnOnAssets` - ROA (decimal)
- `earningsGrowth` - Earnings growth (decimal)
- `revenueGrowth` - Revenue growth (decimal)

### 3. `yf.quoteSummary(ticker, { modules: ['defaultKeyStatistics'] })` - Key Statistics
Returns valuation and statistical metrics:
- `trailingEps` - Trailing 12-month EPS
- `forwardPE` - Forward P/E ratio
- `priceToBook` - Price-to-book ratio
- `pegRatio` - PEG ratio
- `enterpriseToEbitda` - EV/EBITDA
- `enterpriseToRevenue` - EV/Revenue
- `beta` - Stock beta
- `netIncomeToCommon` - Net income
- `bookValue` - Book value per share
- `sharesOutstanding` - Shares outstanding
- `floatShares` - Float shares
- `sharesShort` - Shares short
- `shortRatio` - Short ratio
- `lastFiscalYearEnd` - Last fiscal year end date
- `mostRecentQuarter` - Most recent quarter date
- `earningsQuarterlyGrowth` - Quarterly earnings growth

### 4. `yf.quoteSummary(ticker, { modules: ['summaryDetail'] })` - Summary Details
Returns additional valuation metrics:
- `trailingPE` - Trailing P/E ratio
- `priceToSalesTrailing12Months` - P/S ratio

### 5. `yf.search(ticker, { newsCount: 5 })` - News Data
Returns recent news articles:
- `news[]` - Array of news items
  - `title` - Article title
  - `publisher` - Publisher name
  - `providerPublishTime` - Unix timestamp
  - `summary` - Article summary (optional)

## Workflow Data Mapping

### 1. Equity Analysis Workflow (`equity-workflow.ts`)

**Purpose:** Quick comprehensive stock analysis

**Data Flow:**
1. **fetchStockPrice** → Uses `yf.quote()`
   - Gets: price, volume, market cap, 52-week range
   
2. **fetchFinancials** → Uses `yf.quoteSummary()` with modules: `financialData`, `defaultKeyStatistics`, `summaryDetail`
   - Gets: P/E, EPS, margins, debt-to-equity, revenue growth, beta
   
3. **fetchNews** → Uses `yf.search()`
   - Gets: Recent news articles (up to 5)
   
4. **synthesizeAnalysis** → AI synthesis
   - Combines all data into investment thesis

**Available Metrics:**
- Price & Trading: ✅ Current, volume, market cap, 52-week range
- Valuation: ✅ P/E, EPS, dividend yield
- Profitability: ✅ Profit margin, revenue growth
- Leverage: ✅ Debt-to-equity
- Risk: ✅ Beta
- News: ✅ Recent articles

---

### 2. DCF Valuation Workflow (`valuation-workflows.ts`)

**Purpose:** Calculate intrinsic value using DCF model

**Data Flow:**
1. **fetchDCFData** → Uses `yf.quote()` + `yf.quoteSummary()` with modules: `financialData`, `defaultKeyStatistics`
   - Gets:
     - `freeCashflow` - Latest FCF (from financialData)
     - `operatingCashflow` - Operating CF (from financialData)
     - `totalRevenue` - Revenue (from financialData)
     - `netIncomeToCommon` - Net income (from defaultKeyStatistics)
     - `totalDebt` - Debt (from financialData)
     - `totalCash` - Cash (from financialData)
     - `sharesOutstanding` - Shares (from quote)
     - `revenueGrowth` - Growth rate (from financialData)
     - `marketCap` - Market cap (from quote)
   
2. **calculateDCF** → Real JavaScript calculations
   - Projects 5 years of FCF
   - Calculates terminal value
   - Discounts to present value (10% WACC)
   - Adjusts for net debt
   - Returns intrinsic value per share
   - **Bear/Base/Bull scenarios:**
     - Bear: 70% of growth rate, 2% terminal growth
     - Base: 100% of growth rate, 3% terminal growth
     - Bull: 130% of growth rate, 4% terminal growth

**Calculation Details:**
```javascript
// For each year 1-5:
projectedFCF = previousFCF * (1 + growthRate/100)
presentValue += projectedFCF / (1 + discountRate/100)^year

// Terminal value (year 5):
terminalFCF = year5FCF * (1 + terminalGrowth/100)
terminalValue = terminalFCF / ((discountRate - terminalGrowth)/100)
presentValue += terminalValue / (1 + discountRate/100)^5

// Equity value:
equityValue = presentValue - netDebt
intrinsicValuePerShare = equityValue / sharesOutstanding
```

**Available Data:**
- Cash Flow: ✅ Free cash flow, operating cash flow
- Balance Sheet: ✅ Cash, debt, shares outstanding
- Growth: ✅ Historical revenue growth (as proxy)
- Valuation: ✅ Current price, market cap
- **Output:** Bear/Base/Bull intrinsic values with % upside/downside

---

### 3. Comparable Analysis Workflow (`valuation-workflows.ts`)

**Purpose:** Compare valuation vs peer companies

**Data Flow:**
1. **fetchComparables** → Uses `yf.quote()` + `yf.quoteSummary()` with modules: `defaultKeyStatistics`, `summaryDetail`, `financialData`
   
   **Company Data:**
   - `price` - Current price
   - `marketCap` - Market cap
   - `peRatio` - P/E ratio (from summaryDetail.trailingPE)
   - `pbRatio` - P/B ratio (from defaultKeyStatistics.priceToBook)
   - `psRatio` - P/S ratio (from summaryDetail.priceToSalesTrailing12Months)
   - `pegRatio` - PEG ratio (from defaultKeyStatistics.pegRatio)
   - `evToEbitda` - EV/EBITDA (from defaultKeyStatistics.enterpriseToEbitda)
   - `revenueGrowth` - Revenue growth % (from financialData.revenueGrowth)
   - `profitMargin` - Profit margin % (from financialData.profitMargins)
   
   **Peer Data (same metrics for each peer):**
   - Fetches same valuation multiples for peer companies
   - Returns array of peer data
   
2. **analyzeComparables** → AI analysis
   - Calculates peer averages
   - Compares company to peers
   - Identifies premium/discount
   - Provides valuation recommendation

**Available Comparisons:**
- Valuation Multiples: ✅ P/E, P/B, P/S, PEG, EV/EBITDA
- Growth: ✅ Revenue growth
- Profitability: ✅ Profit margins
- Peer Analysis: ✅ Compare vs industry peers

---

## Data Availability Summary

### ✅ What We HAVE Access To:
- **Latest Period Financial Data** (most recent fiscal year/quarter)
- **Real-time Price Data** (current trading data)
- **Key Financial Ratios** (calculated from latest data)
- **Valuation Multiples** (P/E, P/B, P/S, PEG, EV/EBITDA)
- **Recent News** (last few articles)
- **Cash Flow Data** (latest operating CF and free CF)
- **Balance Sheet Snapshot** (current cash, debt, equity)
- **Growth Rates** (latest year-over-year growth)

### ❌ What We DON'T Have Access To:
- **Multi-year Historical Statements** (income statement, balance sheet, cash flow over 3-5 years)
  - Reason: Yahoo Finance removed these API endpoints in November 2024
- **Quarterly Historical Trends** (detailed quarterly progressions)
- **Historical Growth Patterns** (multi-year trend analysis)
- **Detailed Segment Data** (business segment breakdowns)
- **Management Guidance** (forward-looking statements from earnings calls)

### 🎯 Workarounds & Alternatives:
1. **For Historical Trends:** Use latest year-over-year growth rates as proxy
2. **For Quarterly Data:** Focus on latest quarter vs prior year quarter
3. **For Valuation:** Use current multiples and peer comparisons
4. **For Growth Analysis:** Emphasize current metrics and forward P/E

---

## Best Practices for Using Workflows

### When to Use Each Workflow:

1. **Equity Analysis Workflow** (`equityAnalysisWorkflow`)
   - Use for: Quick comprehensive analysis
   - Best for: Getting overall investment thesis
   - Returns: Formatted analysis with bull/bear cases

2. **DCF Valuation Workflow** (`dcfValuationWorkflow`)
   - Use for: Intrinsic value calculation
   - Best for: Determining if stock is overvalued/undervalued
   - Returns: Bear/Base/Bull intrinsic values with calculations
   - **Note:** Uses real math, not AI estimates

3. **Comparable Analysis Workflow** (`comparableAnalysisWorkflow`)
   - Use for: Peer comparison and relative valuation
   - Best for: Understanding valuation vs competitors
   - Returns: Peer group analysis with averages
   - **Requires:** List of peer ticker symbols

### Example Usage:

```typescript
// Quick analysis
const analysis = await equityAnalysisWorkflow.execute({ ticker: 'AAPL' });

// DCF valuation
const dcf = await dcfValuationWorkflow.execute({ ticker: 'AAPL' });

// Peer comparison
const comp = await comparableAnalysisWorkflow.execute({ 
  ticker: 'AAPL',
  peers: ['MSFT', 'GOOGL', 'META']
});
```

---

## Validation Checklist

Before running workflows, ensure:
- ✅ Ticker symbol is valid and traded on supported exchange
- ✅ Company is publicly traded (not private)
- ✅ Financial data is available (some OTC stocks may have limited data)
- ✅ For peer comparison: peers are in same/similar industry
- ✅ API is accessible (check Yahoo Finance availability)

## Common Data Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| All `null` values | Ticker not found or delisted | Verify ticker symbol |
| Missing cash flow data | Limited reporting for small caps | Use with caution, note in analysis |
| No peer data | Peer ticker invalid | Check peer ticker symbols |
| DCF returns negative value | Negative free cash flow | Flag as high risk, use comparable analysis instead |
| Missing P/E ratio | Company not profitable | Note "N/A - Unprofitable", use P/S ratio |

---

Last Updated: November 2025

