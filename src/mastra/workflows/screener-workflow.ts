// ============================================================================
// STOCK SCREENER WORKFLOW
// ============================================================================
// This workflow screens stocks based on criteria and provides ranked results:
// 1. Screen stocks by criteria (sector, P/E, market cap, etc.)
// 2. Enrich results with additional metrics
// 3. Compare and rank the matches
// 4. AI synthesis with recommendations
//
// USAGE:
//   const result = await stockScreenerWorkflow.execute({
//     criteria: { sector: 'Technology', maxPE: 25 }
//   });
// ============================================================================

import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { screenStocksTool, compareCompaniesTool } from '../tools/screener-tools';

const llm = openai('gpt-4o');

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const screeningCriteriaSchema = z.object({
  sector: z.string().optional().describe('Sector to filter by'),
  minMarketCap: z.number().optional().describe('Minimum market cap in billions'),
  maxMarketCap: z.number().optional().describe('Maximum market cap in billions'),
  minPE: z.number().optional().describe('Minimum P/E ratio'),
  maxPE: z.number().optional().describe('Maximum P/E ratio'),
  minDividendYield: z.number().optional().describe('Minimum dividend yield %'),
  maxDividendYield: z.number().optional().describe('Maximum dividend yield %'),
  minBeta: z.number().optional().describe('Minimum beta'),
  maxBeta: z.number().optional().describe('Maximum beta'),
  limit: z.number().optional().describe('Max results (default: 10)'),
});

const screenedStockSchema = z.object({
  ticker: z.string(),
  companyName: z.string(),
  sector: z.string(),
  marketCap: z.string(),
  marketCapRaw: z.number(),
  price: z.number(),
  peRatio: z.number().nullable(),
  dividendYield: z.number().nullable(),
  beta: z.number().nullable(),
});

const comparisonStockSchema = z.object({
  ticker: z.string(),
  companyName: z.string(),
  sector: z.string(),
  price: z.number(),
  marketCap: z.string(),
  marketCapRaw: z.number(),
  peRatio: z.number().nullable(),
  pbRatio: z.number().nullable(),
  psRatio: z.number().nullable(),
  dividendYield: z.number().nullable(),
  revenueGrowth: z.number().nullable(),
  profitMargin: z.number().nullable(),
  beta: z.number().nullable(),
  fiftyTwoWeekChange: z.number().nullable(),
  analystRating: z.string().nullable(),
});

const summarySchema = z.object({
  cheapestByPE: z.string().nullable(),
  highestGrowth: z.string().nullable(),
  lowestBeta: z.string().nullable(),
  highestDividend: z.string().nullable(),
  bestPerformer: z.string().nullable(),
  largestCompany: z.string().nullable(),
});

// ============================================================================
// SCREENER SYNTHESIS AGENT
// ============================================================================

const screenerSynthesisAgent = new Agent({
  name: 'Screener Results Synthesizer',
  model: llm,
  instructions: `
    You are an expert equity analyst who synthesizes stock screening results into actionable investment insights.

    Your analysis should cover:
    - Summary of screening criteria and results
    - Top picks with clear rationale
    - Comparison highlights
    - Risk considerations for each pick
    - Suggested next steps for deeper analysis

    Structure your response as follows:

    🔍 **SCREENING RESULTS**
    ═══════════════════════════════════

    📋 **CRITERIA USED**
    • Sector: [Sector or All]
    • Market Cap: [Range or Any]
    • P/E Ratio: [Range or Any]
    • Dividend Yield: [Range or Any]
    • Beta: [Range or Any]
    • Results Found: X matches

    📊 **TOP PICKS**

    **#1: [TICKER] - [Company Name]**
    • Price: $XX.XX | Market Cap: $XXB
    • P/E: XX.X | Dividend: X.X% | Beta: X.XX
    • 52-Week Performance: +/-XX%
    • Why It Stands Out: [Key reason this stock matches criteria well]
    • Analyst Rating: [Rating]

    **#2: [TICKER] - [Company Name]**
    [Same format...]

    **#3: [TICKER] - [Company Name]**
    [Same format...]

    📈 **COMPARISON HIGHLIGHTS**
    | Metric | Best Stock | Value |
    |--------|------------|-------|
    | Cheapest (P/E) | [TICKER] | XX.X |
    | Highest Growth | [TICKER] | +XX% |
    | Lowest Risk (Beta) | [TICKER] | X.XX |
    | Best Dividend | [TICKER] | X.X% |
    | Best Performer (52W) | [TICKER] | +XX% |

    ⚖️ **RISK ASSESSMENT**
    • **Low Risk Picks:** [Tickers with beta < 1]
    • **Higher Risk/Reward:** [Tickers with beta > 1.2]
    • **Concentration Warning:** [Any sector concentration issues]

    💡 **INVESTMENT INSIGHTS**

    **Value Opportunities:**
    • [Stocks trading at attractive valuations]

    **Growth Opportunities:**
    • [Stocks with strong growth metrics]

    **Income Opportunities:**
    • [Stocks with attractive dividends]

    🎯 **RECOMMENDED NEXT STEPS**
    1. [Suggest running full analysis on top pick]
    2. [Suggest comparing specific stocks]
    3. [Other relevant follow-up]

    ⚠️ **IMPORTANT NOTES**
    • [Any data limitations or caveats]
    • [Sectors/stocks that may need extra due diligence]

    ⚠️ Disclaimer: Screening results are based on current data and do not constitute investment advice. Always conduct thorough due diligence.

    Guidelines:
    - Highlight the best opportunities based on criteria
    - Be specific about why each stock made the list
    - Consider valuation, growth, and risk together
    - Note any outliers or concerns
    - Suggest actionable next steps
  `,
});

// ============================================================================
// STEP 1: SCREEN STOCKS
// ============================================================================

const screenStocks = createStep({
  id: 'screen-stocks',
  description: 'Screens stocks based on provided criteria',

  inputSchema: z.object({
    criteria: screeningCriteriaSchema,
  }),

  outputSchema: z.object({
    criteria: screeningCriteriaSchema,
    matches: z.array(screenedStockSchema),
    totalMatches: z.number(),
    criteriaUsed: z.record(z.any()),
  }),

  execute: async ({ inputData, runtimeContext }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { criteria } = inputData;

    const result = await screenStocksTool.execute({
      context: {
        sector: criteria.sector,
        minMarketCap: criteria.minMarketCap,
        maxMarketCap: criteria.maxMarketCap,
        minPE: criteria.minPE,
        maxPE: criteria.maxPE,
        minDividendYield: criteria.minDividendYield,
        maxDividendYield: criteria.maxDividendYield,
        minBeta: criteria.minBeta,
        maxBeta: criteria.maxBeta,
        limit: criteria.limit || 10,
      },
      runtimeContext,
    });

    return {
      criteria,
      matches: result.matches,
      totalMatches: result.totalMatches,
      criteriaUsed: result.criteriaUsed,
    };
  },
});

// ============================================================================
// STEP 2: COMPARE AND RANK
// ============================================================================

const compareAndRank = createStep({
  id: 'compare-and-rank',
  description: 'Compares screened stocks and ranks them',

  inputSchema: z.object({
    criteria: screeningCriteriaSchema,
    matches: z.array(screenedStockSchema),
    totalMatches: z.number(),
    criteriaUsed: z.record(z.any()),
  }),

  outputSchema: z.object({
    criteria: screeningCriteriaSchema,
    matches: z.array(screenedStockSchema),
    totalMatches: z.number(),
    criteriaUsed: z.record(z.any()),
    comparison: z.array(comparisonStockSchema),
    summary: summarySchema,
  }),

  execute: async ({ inputData, runtimeContext }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { matches } = inputData;

    // If no matches, return empty comparison
    if (matches.length === 0) {
      return {
        ...inputData,
        comparison: [],
        summary: {
          cheapestByPE: null,
          highestGrowth: null,
          lowestBeta: null,
          highestDividend: null,
          bestPerformer: null,
          largestCompany: null,
        },
      };
    }

    // Get tickers for comparison
    const tickers = matches.map((m) => m.ticker);

    const result = await compareCompaniesTool.execute({
      context: { tickers },
      runtimeContext,
    });

    return {
      ...inputData,
      comparison: result.comparison,
      summary: result.summary,
    };
  },
});

// ============================================================================
// STEP 3: SYNTHESIZE RESULTS
// ============================================================================

const synthesizeScreeningResults = createStep({
  id: 'synthesize-screening-results',
  description: 'AI generates comprehensive screening analysis',

  inputSchema: z.object({
    criteria: screeningCriteriaSchema,
    matches: z.array(screenedStockSchema),
    totalMatches: z.number(),
    criteriaUsed: z.record(z.any()),
    comparison: z.array(comparisonStockSchema),
    summary: summarySchema,
  }),

  outputSchema: z.object({
    screeningResults: z.string(),
  }),

  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { criteria, matches, totalMatches, criteriaUsed, comparison, summary } = inputData;

    if (matches.length === 0) {
      return {
        screeningResults: `No stocks found matching your criteria:\n${JSON.stringify(criteriaUsed, null, 2)}\n\nTry broadening your search criteria.`,
      };
    }

    // Build comparison table
    const comparisonTable = comparison
      .map(
        (c) =>
          `${c.ticker} (${c.companyName}):
  - Price: $${c.price} | Market Cap: ${c.marketCap}
  - P/E: ${c.peRatio ?? 'N/A'} | P/B: ${c.pbRatio ?? 'N/A'} | P/S: ${c.psRatio ?? 'N/A'}
  - Dividend: ${c.dividendYield ? c.dividendYield + '%' : 'N/A'} | Beta: ${c.beta ?? 'N/A'}
  - Revenue Growth: ${c.revenueGrowth ? c.revenueGrowth + '%' : 'N/A'} | Profit Margin: ${c.profitMargin ? c.profitMargin + '%' : 'N/A'}
  - 52-Week Change: ${c.fiftyTwoWeekChange ? (c.fiftyTwoWeekChange >= 0 ? '+' : '') + c.fiftyTwoWeekChange + '%' : 'N/A'}
  - Analyst Rating: ${c.analystRating || 'N/A'}`
      )
      .join('\n\n');

    const prompt = `Analyze the following stock screening results and provide comprehensive investment insights:

=== SCREENING CRITERIA ===
${JSON.stringify(criteriaUsed, null, 2)}

=== RESULTS SUMMARY ===
Total Matches Found: ${totalMatches}
Showing Top: ${matches.length}

=== DETAILED COMPARISON ===
${comparisonTable}

=== CATEGORY LEADERS ===
- Cheapest by P/E: ${summary.cheapestByPE || 'N/A'}
- Highest Revenue Growth: ${summary.highestGrowth || 'N/A'}
- Lowest Beta (Risk): ${summary.lowestBeta || 'N/A'}
- Highest Dividend Yield: ${summary.highestDividend || 'N/A'}
- Best 52-Week Performer: ${summary.bestPerformer || 'N/A'}
- Largest by Market Cap: ${summary.largestCompany || 'N/A'}

=== YOUR TASK ===
Provide a comprehensive analysis of these screening results following the format in your instructions. Focus on:
1. Which stocks best match the user's criteria and why
2. Value vs growth trade-offs among the results
3. Risk considerations (beta, concentration)
4. Top 3 picks with clear rationale
5. Suggested next steps for deeper analysis`;

    const response = await screenerSynthesisAgent.streamLegacy([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let analysisText = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      analysisText += chunk;
    }

    return {
      screeningResults: analysisText,
    };
  },
});

// ============================================================================
// STOCK SCREENER WORKFLOW DEFINITION
// ============================================================================

export const stockScreenerWorkflow = createWorkflow({
  id: 'stock-screener-workflow',

  inputSchema: z.object({
    criteria: screeningCriteriaSchema.describe('Screening criteria for filtering stocks'),
  }),

  outputSchema: z.object({
    screeningResults: z.string(),
  }),
})
  .then(screenStocks)
  .then(compareAndRank)
  .then(synthesizeScreeningResults);

stockScreenerWorkflow.commit();

// ============================================================================
// END OF SCREENER WORKFLOW
// ============================================================================
