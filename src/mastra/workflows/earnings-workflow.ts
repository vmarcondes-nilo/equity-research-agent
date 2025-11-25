// ============================================================================
// EARNINGS EVENT WORKFLOW
// ============================================================================
// This workflow analyzes a company's earnings report and market reaction:
// 1. Fetch earnings data (EPS/revenue actual vs estimates, history)
// 2. Fetch guidance and analyst context (forward estimates, revisions)
// 3. Analyze market reaction (price/volume changes post-earnings)
// 4. AI synthesis of earnings event impact and investment thesis update
//
// USAGE:
//   const result = await earningsEventWorkflow.execute({ ticker: 'AAPL' });
// ============================================================================

import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const llm = openai('gpt-4o');

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const earningsQuarterSchema = z.object({
  quarter: z.string(),
  epsActual: z.number().nullable(),
  epsEstimate: z.number().nullable(),
  epsSurprisePercent: z.number().nullable(),
  revenueActual: z.number().nullable(),
  revenueEstimate: z.number().nullable(),
  revenueSurprisePercent: z.number().nullable(),
  reportDate: z.string().nullable(),
});

const guidanceSchema = z.object({
  currentQuarterEpsEstimate: z.number().nullable(),
  currentYearEpsEstimate: z.number().nullable(),
  nextYearEpsEstimate: z.number().nullable(),
  epsGrowthCurrentYear: z.number().nullable(),
  epsGrowthNextYear: z.number().nullable(),
  revenueGrowthCurrentYear: z.number().nullable(),
});

const analystRevisionsSchema = z.object({
  totalAnalysts: z.number(),
  upgrades: z.number(),
  downgrades: z.number(),
  recentChanges: z.array(z.object({
    firm: z.string(),
    action: z.string(),
    date: z.string(),
  })),
  sentiment: z.string(),
});

const marketReactionSchema = z.object({
  earningsReportDate: z.string().nullable(),
  priceBeforeEarnings: z.number().nullable(),
  priceAfterEarnings: z.number().nullable(),
  currentPrice: z.number(),
  priceChangePostEarnings: z.number().nullable(),
  priceChangePostEarningsPercent: z.number().nullable(),
  volumeOnEarningsDay: z.number().nullable(),
  averageVolume: z.number(),
  volumeRatio: z.number().nullable(),
  reactionAssessment: z.string(),
});

// ============================================================================
// EARNINGS SYNTHESIS AGENT
// ============================================================================

const earningsSynthesisAgent = new Agent({
  name: 'Earnings Event Synthesizer',
  model: llm,
  instructions: `
    You are an expert earnings analyst who synthesizes earnings data into actionable investment insights.

    Your analysis should cover:
    - Earnings beat/miss assessment with context
    - Revenue performance and trends
    - Historical earnings consistency
    - Forward guidance implications
    - Market reaction interpretation
    - Updated investment thesis

    Structure your response as follows:

    📊 **EARNINGS ANALYSIS: [TICKER]**
    ═══════════════════════════════════

    📅 **LATEST QUARTER: [Q# YYYY]**
    • Report Date: [Date]
    • Current Price: $XX.XX

    💰 **EPS PERFORMANCE**
    • Actual: $X.XX vs Estimate: $X.XX
    • Surprise: [Beat/Miss] by X.X% ($X.XX)
    • Assessment: [Strong Beat / Beat / In-Line / Miss / Significant Miss]

    📈 **REVENUE PERFORMANCE**
    • Actual: $X.XXB vs Estimate: $X.XXB
    • Surprise: [Beat/Miss] by X.X%
    • YoY Growth: +X.X%
    • Assessment: [Strong / Solid / Weak / Concerning]

    📜 **EARNINGS HISTORY** (Last 4 Quarters)
    | Quarter | EPS Act | EPS Est | Surprise | Revenue |
    |---------|---------|---------|----------|---------|
    | Q# YY   | $X.XX   | $X.XX   | +X.X%    | $X.XB   |
    | ...     | ...     | ...     | ...      | ...     |

    • Beat Rate: X/4 quarters
    • Trend: [Improving / Stable / Declining]
    • Consistency: [High / Moderate / Low]

    🔮 **FORWARD GUIDANCE**
    • Current Year EPS Estimate: $X.XX (X.X% growth)
    • Next Year EPS Estimate: $X.XX (X.X% growth)
    • Revenue Growth Outlook: X.X%
    • Guidance Assessment: [Raised / Maintained / Lowered / N/A]

    📊 **ANALYST SENTIMENT**
    • Total Analysts: XX
    • Recent Upgrades: X | Downgrades: X
    • Post-Earnings Sentiment: [Bullish / Neutral / Bearish]
    • Notable Changes: [List any significant rating changes]

    📉 **MARKET REACTION**
    • Price Change Post-Earnings: [+/-]X.X% ($X.XX)
    • Volume vs Average: X.Xx normal volume
    • Reaction Type: [Positive / Neutral / Negative]
    • Interpretation: [Why the market reacted this way]

    🎯 **INVESTMENT THESIS UPDATE**

    **Key Takeaways:**
    1. [Most important insight from earnings]
    2. [Second key point]
    3. [Third key point]

    **Bull Case Reinforced/Weakened:**
    • [How earnings affect the bull case]

    **Bear Case Reinforced/Weakened:**
    • [How earnings affect the bear case]

    **Recommendation:**
    • [Buy / Hold / Sell based on earnings]
    • Confidence: [High / Medium / Low]
    • Rationale: [1-2 sentence explanation]

    ⏰ **NEXT EARNINGS**
    • Expected Date: [Date or estimate]
    • Key Metrics to Watch: [What to focus on next quarter]

    ⚠️ Disclaimer: This analysis is based on reported earnings data and does not constitute investment advice.

    Guidelines:
    - Be specific with numbers and percentages
    - Compare to historical performance
    - Explain what the numbers mean for investors
    - Highlight any unusual items or one-time charges
    - Consider both short-term reaction and long-term implications
    - Be balanced - acknowledge both positives and negatives
  `,
});

// ============================================================================
// STEP 1: FETCH EARNINGS DATA
// ============================================================================

const fetchEarningsData = createStep({
  id: 'fetch-earnings-data',
  description: 'Fetches core earnings metrics including EPS and revenue vs estimates',

  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),

  outputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
  }),

  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const ticker = inputData.ticker.toUpperCase();

    try {
      const [quote, summary] = await Promise.all([
        yf.quote(ticker),
        yf.quoteSummary(ticker, {
          modules: ['earnings', 'earningsHistory', 'calendarEvents'],
        }),
      ]);

      const currentPrice = quote.regularMarketPrice || 0;
      const companyName = quote.longName || quote.shortName || ticker;

      // Get earnings history
      const earningsHistoryData = summary.earningsHistory?.history || [];
      const earningsHistory = earningsHistoryData.slice(0, 4).map((q: any) => {
        const epsActual = q.epsActual ?? null;
        const epsEstimate = q.epsEstimate ?? null;
        const epsSurprisePercent = q.surprisePercent ? q.surprisePercent * 100 : null;

        return {
          quarter: q.quarter ? `Q${q.quarter}` : 'N/A',
          epsActual,
          epsEstimate,
          epsSurprisePercent,
          revenueActual: null, // Not available in this module
          revenueEstimate: null,
          revenueSurprisePercent: null,
          reportDate: q.quarterDate || null,
        };
      });

      // Get latest earnings (most recent quarter)
      const latestEarnings = earningsHistory[0] || {
        quarter: 'N/A',
        epsActual: null,
        epsEstimate: null,
        epsSurprisePercent: null,
        revenueActual: null,
        revenueEstimate: null,
        revenueSurprisePercent: null,
        reportDate: null,
      };

      // Get next earnings date
      const calendarEvents = summary.calendarEvents;
      let nextEarningsDate: string | null = null;
      if (calendarEvents?.earnings?.earningsDate) {
        const dates = calendarEvents.earnings.earningsDate;
        if (dates.length > 0) {
          nextEarningsDate = new Date(dates[0]).toLocaleDateString();
        }
      }

      return {
        ticker,
        companyName,
        currentPrice,
        latestEarnings,
        earningsHistory,
        nextEarningsDate,
      };
    } catch (error) {
      console.warn(`Failed to fetch earnings data for ${ticker}:`, error);
      throw new Error(`Failed to fetch earnings data for ${ticker}: ${error}`);
    }
  },
});

// ============================================================================
// STEP 2: FETCH GUIDANCE AND CONTEXT
// ============================================================================

const fetchGuidanceAndContext = createStep({
  id: 'fetch-guidance-context',
  description: 'Fetches forward guidance estimates and analyst revisions',

  inputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
  }),

  outputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
    guidance: guidanceSchema,
    analystRevisions: analystRevisionsSchema,
  }),

  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const ticker = inputData.ticker;

    try {
      const summary = await yf.quoteSummary(ticker, {
        modules: ['earningsTrend', 'upgradeDowngradeHistory', 'financialData'],
      });

      // Extract guidance from earningsTrend
      const earningsTrend = summary.earningsTrend?.trend || [];
      const currentQuarter = earningsTrend.find((t: any) => t.period === '0q');
      const currentYear = earningsTrend.find((t: any) => t.period === '0y');
      const nextYear = earningsTrend.find((t: any) => t.period === '+1y');

      const guidance = {
        currentQuarterEpsEstimate: currentQuarter?.earningsEstimate?.avg ?? null,
        currentYearEpsEstimate: currentYear?.earningsEstimate?.avg ?? null,
        nextYearEpsEstimate: nextYear?.earningsEstimate?.avg ?? null,
        epsGrowthCurrentYear: currentYear?.growth ?? null,
        epsGrowthNextYear: nextYear?.growth ?? null,
        revenueGrowthCurrentYear: summary.financialData?.revenueGrowth
          ? summary.financialData.revenueGrowth * 100
          : null,
      };

      // Extract analyst revisions
      const upgradeDowngradeHistory = summary.upgradeDowngradeHistory?.history || [];
      const recentChanges = upgradeDowngradeHistory.slice(0, 5).map((event: any) => ({
        firm: event.firm || 'Unknown',
        action: event.action || 'Unknown',
        date: event.epochGradeDate
          ? new Date(event.epochGradeDate * 1000).toLocaleDateString()
          : 'Unknown',
      }));

      let upgrades = 0;
      let downgrades = 0;
      recentChanges.forEach((change: any) => {
        const action = change.action.toLowerCase();
        if (action.includes('up') || action.includes('init')) {
          upgrades++;
        } else if (action.includes('down')) {
          downgrades++;
        }
      });

      let sentiment = 'Neutral';
      if (upgrades > downgrades + 1) {
        sentiment = 'Bullish';
      } else if (downgrades > upgrades + 1) {
        sentiment = 'Bearish';
      }

      const analystRevisions = {
        totalAnalysts: summary.financialData?.numberOfAnalystOpinions || 0,
        upgrades,
        downgrades,
        recentChanges,
        sentiment,
      };

      return {
        ...inputData,
        guidance,
        analystRevisions,
      };
    } catch (error) {
      console.warn(`Failed to fetch guidance for ${ticker}:`, error);
      return {
        ...inputData,
        guidance: {
          currentQuarterEpsEstimate: null,
          currentYearEpsEstimate: null,
          nextYearEpsEstimate: null,
          epsGrowthCurrentYear: null,
          epsGrowthNextYear: null,
          revenueGrowthCurrentYear: null,
        },
        analystRevisions: {
          totalAnalysts: 0,
          upgrades: 0,
          downgrades: 0,
          recentChanges: [],
          sentiment: 'Unknown',
        },
      };
    }
  },
});

// ============================================================================
// STEP 3: ANALYZE MARKET REACTION
// ============================================================================

const analyzeMarketReaction = createStep({
  id: 'analyze-market-reaction',
  description: 'Analyzes price and volume reaction to earnings',

  inputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
    guidance: guidanceSchema,
    analystRevisions: analystRevisionsSchema,
  }),

  outputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
    guidance: guidanceSchema,
    analystRevisions: analystRevisionsSchema,
    marketReaction: marketReactionSchema,
  }),

  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const ticker = inputData.ticker;
    const currentPrice = inputData.currentPrice;
    const earningsReportDate = inputData.latestEarnings.reportDate;

    try {
      const quote = await yf.quote(ticker);
      const averageVolume = quote.averageDailyVolume10Day || quote.averageVolume || 0;

      let marketReaction: z.infer<typeof marketReactionSchema> = {
        earningsReportDate,
        priceBeforeEarnings: null,
        priceAfterEarnings: null,
        currentPrice,
        priceChangePostEarnings: null,
        priceChangePostEarningsPercent: null,
        volumeOnEarningsDay: null,
        averageVolume,
        volumeRatio: null,
        reactionAssessment: 'Unknown',
      };

      // Try to get historical data around earnings date
      if (earningsReportDate) {
        try {
          const earningsDate = new Date(earningsReportDate);
          const startDate = new Date(earningsDate);
          startDate.setDate(startDate.getDate() - 5);
          const endDate = new Date(earningsDate);
          endDate.setDate(endDate.getDate() + 5);

          const historical = await yf.chart(ticker, {
            period1: startDate,
            period2: endDate,
            interval: '1d',
          });

          const quotes = historical.quotes || [];
          if (quotes.length >= 2) {
            // Find the closest trading day before and after earnings
            const earningsTime = earningsDate.getTime();
            let beforeIdx = -1;
            let afterIdx = -1;

            for (let i = 0; i < quotes.length; i++) {
              const quoteTime = new Date(quotes[i].date).getTime();
              if (quoteTime <= earningsTime) {
                beforeIdx = i;
              } else if (afterIdx === -1) {
                afterIdx = i;
              }
            }

            if (beforeIdx >= 0 && afterIdx > 0) {
              const beforeQuote = quotes[beforeIdx];
              const afterQuote = quotes[afterIdx];

              const priceBeforeEarnings = beforeQuote.close || 0;
              const priceAfterEarnings = afterQuote.close || 0;
              const priceChangePostEarnings = priceAfterEarnings - priceBeforeEarnings;
              const priceChangePostEarningsPercent =
                priceBeforeEarnings > 0
                  ? (priceChangePostEarnings / priceBeforeEarnings) * 100
                  : 0;

              const volumeOnEarningsDay = afterQuote.volume || null;
              const volumeRatio =
                volumeOnEarningsDay && averageVolume > 0
                  ? volumeOnEarningsDay / averageVolume
                  : null;

              let reactionAssessment = 'Neutral';
              if (priceChangePostEarningsPercent > 5) {
                reactionAssessment = 'Very Positive';
              } else if (priceChangePostEarningsPercent > 2) {
                reactionAssessment = 'Positive';
              } else if (priceChangePostEarningsPercent < -5) {
                reactionAssessment = 'Very Negative';
              } else if (priceChangePostEarningsPercent < -2) {
                reactionAssessment = 'Negative';
              }

              marketReaction = {
                earningsReportDate,
                priceBeforeEarnings: parseFloat(priceBeforeEarnings.toFixed(2)),
                priceAfterEarnings: parseFloat(priceAfterEarnings.toFixed(2)),
                currentPrice,
                priceChangePostEarnings: parseFloat(priceChangePostEarnings.toFixed(2)),
                priceChangePostEarningsPercent: parseFloat(priceChangePostEarningsPercent.toFixed(2)),
                volumeOnEarningsDay,
                averageVolume,
                volumeRatio: volumeRatio ? parseFloat(volumeRatio.toFixed(2)) : null,
                reactionAssessment,
              };
            }
          }
        } catch (histError) {
          console.warn(`Failed to fetch historical data for market reaction:`, histError);
        }
      }

      return {
        ...inputData,
        marketReaction,
      };
    } catch (error) {
      console.warn(`Failed to analyze market reaction for ${ticker}:`, error);
      return {
        ...inputData,
        marketReaction: {
          earningsReportDate,
          priceBeforeEarnings: null,
          priceAfterEarnings: null,
          currentPrice,
          priceChangePostEarnings: null,
          priceChangePostEarningsPercent: null,
          volumeOnEarningsDay: null,
          averageVolume: 0,
          volumeRatio: null,
          reactionAssessment: 'Unknown',
        },
      };
    }
  },
});

// ============================================================================
// STEP 4: SYNTHESIZE EARNINGS ANALYSIS
// ============================================================================

const synthesizeEarningsAnalysis = createStep({
  id: 'synthesize-earnings-analysis',
  description: 'AI generates comprehensive earnings analysis',

  inputSchema: z.object({
    ticker: z.string(),
    companyName: z.string(),
    currentPrice: z.number(),
    latestEarnings: earningsQuarterSchema,
    earningsHistory: z.array(earningsQuarterSchema),
    nextEarningsDate: z.string().nullable(),
    guidance: guidanceSchema,
    analystRevisions: analystRevisionsSchema,
    marketReaction: marketReactionSchema,
  }),

  outputSchema: z.object({
    earningsAnalysis: z.string(),
  }),

  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const {
      ticker,
      companyName,
      currentPrice,
      latestEarnings,
      earningsHistory,
      nextEarningsDate,
      guidance,
      analystRevisions,
      marketReaction,
    } = inputData;

    // Calculate beat rate
    const quartersWithData = earningsHistory.filter((q) => q.epsSurprisePercent !== null);
    const beatCount = quartersWithData.filter((q) => (q.epsSurprisePercent || 0) > 0).length;
    const beatRate = quartersWithData.length > 0 ? `${beatCount}/${quartersWithData.length}` : 'N/A';

    // Build earnings history table
    const historyTable = earningsHistory
      .map(
        (q) =>
          `${q.quarter}: EPS $${q.epsActual?.toFixed(2) || 'N/A'} vs $${q.epsEstimate?.toFixed(2) || 'N/A'} (${q.epsSurprisePercent !== null ? (q.epsSurprisePercent >= 0 ? '+' : '') + q.epsSurprisePercent.toFixed(1) + '%' : 'N/A'})`
      )
      .join('\n');

    const prompt = `Analyze the following earnings data and provide a comprehensive earnings event analysis for ${ticker} (${companyName}):

=== CURRENT PRICE ===
$${currentPrice.toFixed(2)}

=== LATEST EARNINGS ===
Quarter: ${latestEarnings.quarter}
Report Date: ${latestEarnings.reportDate || 'Unknown'}
EPS Actual: $${latestEarnings.epsActual?.toFixed(2) || 'N/A'}
EPS Estimate: $${latestEarnings.epsEstimate?.toFixed(2) || 'N/A'}
EPS Surprise: ${latestEarnings.epsSurprisePercent !== null ? (latestEarnings.epsSurprisePercent >= 0 ? '+' : '') + latestEarnings.epsSurprisePercent.toFixed(2) + '%' : 'N/A'}

=== EARNINGS HISTORY (Last 4 Quarters) ===
${historyTable}
Beat Rate: ${beatRate}

=== FORWARD GUIDANCE ===
Current Quarter EPS Estimate: $${guidance.currentQuarterEpsEstimate?.toFixed(2) || 'N/A'}
Current Year EPS Estimate: $${guidance.currentYearEpsEstimate?.toFixed(2) || 'N/A'}
Next Year EPS Estimate: $${guidance.nextYearEpsEstimate?.toFixed(2) || 'N/A'}
EPS Growth (Current Year): ${guidance.epsGrowthCurrentYear !== null ? (guidance.epsGrowthCurrentYear * 100).toFixed(1) + '%' : 'N/A'}
EPS Growth (Next Year): ${guidance.epsGrowthNextYear !== null ? (guidance.epsGrowthNextYear * 100).toFixed(1) + '%' : 'N/A'}
Revenue Growth: ${guidance.revenueGrowthCurrentYear !== null ? guidance.revenueGrowthCurrentYear.toFixed(1) + '%' : 'N/A'}

=== ANALYST REVISIONS ===
Total Analysts: ${analystRevisions.totalAnalysts}
Recent Upgrades: ${analystRevisions.upgrades}
Recent Downgrades: ${analystRevisions.downgrades}
Overall Sentiment: ${analystRevisions.sentiment}
Recent Changes:
${analystRevisions.recentChanges.map((c) => `- ${c.firm}: ${c.action} (${c.date})`).join('\n') || 'None'}

=== MARKET REACTION ===
Earnings Report Date: ${marketReaction.earningsReportDate || 'Unknown'}
Price Before Earnings: $${marketReaction.priceBeforeEarnings?.toFixed(2) || 'N/A'}
Price After Earnings: $${marketReaction.priceAfterEarnings?.toFixed(2) || 'N/A'}
Price Change: ${marketReaction.priceChangePostEarningsPercent !== null ? (marketReaction.priceChangePostEarningsPercent >= 0 ? '+' : '') + marketReaction.priceChangePostEarningsPercent.toFixed(2) + '% ($' + marketReaction.priceChangePostEarnings?.toFixed(2) + ')' : 'N/A'}
Volume Ratio: ${marketReaction.volumeRatio !== null ? marketReaction.volumeRatio.toFixed(1) + 'x average' : 'N/A'}
Reaction Assessment: ${marketReaction.reactionAssessment}

=== NEXT EARNINGS ===
Expected Date: ${nextEarningsDate || 'Not announced'}

=== YOUR TASK ===
Provide a comprehensive earnings event analysis following the format in your instructions. Focus on:
1. Whether the company beat or missed and by how much
2. Trends in earnings quality over the last 4 quarters
3. What guidance tells us about the future
4. How the market reacted and why
5. Updated investment thesis based on this earnings report`;

    const response = await earningsSynthesisAgent.streamLegacy([
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
      earningsAnalysis: analysisText,
    };
  },
});

// ============================================================================
// EARNINGS EVENT WORKFLOW DEFINITION
// ============================================================================

export const earningsEventWorkflow = createWorkflow({
  id: 'earnings-event-workflow',

  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol to analyze earnings for'),
  }),

  outputSchema: z.object({
    earningsAnalysis: z.string(),
  }),
})
  .then(fetchEarningsData)
  .then(fetchGuidanceAndContext)
  .then(analyzeMarketReaction)
  .then(synthesizeEarningsAnalysis);

earningsEventWorkflow.commit();

// ============================================================================
// END OF EARNINGS WORKFLOW
// ============================================================================
