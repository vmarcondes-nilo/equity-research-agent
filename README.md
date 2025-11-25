# Equity Research Agent

A multi-agent AI system for comprehensive equity research, built with the Mastra framework. Combines fundamental analysis, sentiment analysis, and risk assessment to produce institutional-quality investment research.

## Overview

This project demonstrates how to:

- Build multiple specialized AI agents for different analysis domains
- Orchestrate agents through a master coordinator
- Implement multi-step workflows for complex research tasks
- Integrate with financial APIs for real-time market data
- Generate comprehensive investment recommendations

## Agents

### 1. Master Research Analyst
Senior analyst that orchestrates comprehensive investment research across all domains.

**Capabilities:**
- Coordinates fundamental, sentiment, and risk analysis
- Synthesizes findings into unified research reports
- Generates investment recommendations with target prices
- Handles quick overviews, standard analysis, and deep dives

### 2. Equity Research Analyst
General-purpose equity analysis agent for quick stock lookups.

**Capabilities:**
- Real-time stock prices and market data
- Financial metrics analysis (P/E, EPS, margins, growth rates)
- Company news monitoring
- Multi-stock comparison

**Tools:**
- `getStockPriceTool` - Current price, volume, 52-week range, market cap
- `getFinancialsTool` - Key financial ratios and metrics
- `getCompanyNewsTool` - Recent news articles

### 3. Fundamental Analyst
Specialized agent for deep financial statement analysis and valuation.

**Capabilities:**
- Financial statement analysis (income, balance sheet, cash flow)
- Comprehensive ratio analysis (profitability, liquidity, leverage, valuation)
- DCF valuation with real mathematical calculations
- Comparable company analysis

**Tools:**
- `getLatestFinancialsDetailedTool` - Detailed income metrics and margins
- `getBalanceSheetTool` - Assets, liabilities, cash, debt, liquidity ratios
- `getCashFlowTool` - Operating and free cash flow data
- `getFinancialRatiosTool` - Complete 5-category ratio analysis

**Workflows:**
- `dcfValuationWorkflow` - Intrinsic value calculation with sensitivity analysis
- `comparableAnalysisWorkflow` - Peer comparison valuation

### 4. Sentiment Analyst
Specialized agent for market sentiment and analyst opinion tracking.

**Capabilities:**
- News sentiment analysis
- Analyst ratings and price target tracking
- Insider trading activity monitoring
- Upgrade/downgrade tracking
- Earnings sentiment analysis

**Tools:**
- `getAnalystRatingsTool` - Wall Street ratings distribution, price targets
- `getInsiderTradingTool` - Recent insider buys/sells
- `getUpgradeDowngradeTool` - Analyst rating changes
- `getEarningsSentimentTool` - Earnings beats/misses

**Workflows:**
- `sentimentAnalysisWorkflow` - Complete sentiment analysis pipeline

### 5. Risk Analyst
Specialized agent for risk assessment and volatility analysis.

**Capabilities:**
- Beta and market sensitivity analysis
- Historical drawdown analysis
- Sector and concentration risk
- Short interest and squeeze risk assessment

**Tools:**
- `getBetaVolatilityTool` - Beta, moving averages, trend signals
- `getDrawdownAnalysisTool` - Max drawdown, recovery metrics
- `getSectorExposureTool` - Sector, industry, market cap category
- `getShortInterestTool` - Short interest, squeeze risk assessment

**Workflows:**
- `riskAssessmentWorkflow` - Comprehensive risk analysis

## Workflows

### Full Research Workflow
Complete 4-step research pipeline used by the Master Analyst:

1. **Fetch Company Overview** - Basic context (price, sector, news)
2. **Parallel Specialist Analysis** - Fundamental + Sentiment + Risk (9 tools in parallel)
3. **Synthesize Research Report** - Combine findings, assign scores
4. **Generate Investment Thesis** - Final rating, target price, bull/bear cases

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key
2. Install dependencies: `pnpm install`
3. Run the project: `pnpm dev`
4. Access Mastra Studio at `http://localhost:4111`

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key. [Get one here](https://platform.openai.com/api-keys)

## Project Structure

```
src/mastra/
├── agents/
│   ├── master-analyst.ts         # Master Research Analyst (orchestrator)
│   ├── analyst-agent.ts          # Equity Research Analyst
│   ├── fundamental-analyst.ts    # Fundamental Analyst
│   ├── sentiment-analyst.ts      # Sentiment Analyst
│   └── risk-analyst.ts           # Risk Analyst
├── tools/
│   ├── equity-tools.ts           # Stock price, financials, news
│   ├── fundamental-tools.ts      # Financial statements, ratios
│   ├── sentiment-tools.ts        # Analyst ratings, insider trading
│   └── risk-tools.ts             # Beta, drawdowns, short interest
├── workflows/
│   ├── full-research-workflow.ts # Complete research pipeline
│   ├── equity-workflow.ts        # Quick equity analysis
│   ├── valuation-workflows.ts    # DCF & comparable analysis
│   ├── sentiment-workflow.ts     # Sentiment analysis pipeline
│   └── risk-workflow.ts          # Risk assessment pipeline
├── lib/
│   └── dcf-calculator.ts         # Quantitative DCF calculations
└── index.ts                      # Main Mastra configuration
```

## Example Usage

### Master Analyst (Comprehensive Research)
```
User: "Deep dive on AAPL"
Agent: Runs fullResearchWorkflow → Complete research report + investment thesis

User: "Analyze MSFT"
Agent: Standard analysis → Scores + recommendation + bull/bear cases

User: "Quick look at GOOGL"
Agent: Quick overview → Price, key metrics, recent news summary
```

### Fundamental Analysis
```
User: "What's TSLA's intrinsic value?"
Agent: Runs dcfValuationWorkflow → DCF with bear/base/bull scenarios

User: "Compare NVDA to its peers"
Agent: Runs comparableAnalysisWorkflow → Peer valuation comparison
```

### Sentiment Analysis
```
User: "What do analysts think of META?"
Agent: Uses analyst ratings + upgrades/downgrades → Sentiment summary

User: "Any insider activity on AMZN?"
Agent: Uses insider trading tool → Recent insider transactions
```

### Risk Assessment
```
User: "How risky is COIN?"
Agent: Uses all risk tools → Beta, drawdowns, short interest, risk score
```

## Features

- **Multi-Agent Orchestration**: Master analyst coordinates specialist agents
- **Parallel Processing**: 9 tools run in parallel for efficiency
- **Real Calculations**: DCF uses mathematical formulas, not AI estimation
- **Institutional Quality**: Professional research report format
- **Memory**: Conversation history and user preferences
- **Type Safety**: Full TypeScript with Zod validation

## Technologies

- **Framework**: [Mastra](https://mastra.ai)
- **Language**: TypeScript
- **AI Model**: OpenAI GPT-4o
- **Data API**: Yahoo Finance
- **Storage**: LibSQL (SQLite)
- **Logging**: Pino

## Data Limitations

Due to Yahoo Finance API changes (Nov 2024), historical multi-year financial statements are no longer available. All tools fetch the latest fiscal period data.
