// ============================================================================
// STOCK SCREENER TOOLS
// ============================================================================
// Tools for discovering and comparing stocks based on criteria.
//
// Tools:
// 1. screenStocksTool - Filter stocks by financial criteria
// 2. compareCompaniesTool - Side-by-side comparison of multiple stocks
// ============================================================================

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ============================================================================
// STOCK UNIVERSE
// ============================================================================
// Predefined universe of ~150 popular stocks across sectors.
// Yahoo Finance doesn't have a true screening API, so we filter this list.
// ============================================================================

const STOCK_UNIVERSE: Record<string, string[]> = {
  Technology: [
    'AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE',
    'CSCO', 'IBM', 'NOW', 'INTU', 'AMAT', 'MU', 'LRCX', 'KLAC', 'SNPS', 'CDNS',
    'PANW', 'CRWD', 'FTNT', 'ZS', 'DDOG', 'SNOW', 'PLTR', 'NET', 'UBER', 'ABNB',
  ],
  Healthcare: [
    'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
    'GILD', 'VRTX', 'REGN', 'ISRG', 'MDT', 'SYK', 'BSX', 'ZBH', 'EW', 'DXCM',
    'MRNA', 'BIIB', 'ILMN', 'A', 'DHR',
  ],
  Financials: [
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'V',
    'MA', 'PYPL', 'COF', 'USB', 'PNC', 'TFC', 'AIG', 'MET', 'PRU', 'ALL',
    'TRV', 'CB', 'AFL', 'ICE', 'CME',
  ],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG',
    'MAR', 'HLT', 'CMG', 'YUM', 'DPZ', 'ROST', 'ORLY', 'AZO', 'BBY', 'DHI',
    'LEN', 'PHM', 'NVR', 'GM', 'F',
  ],
  'Consumer Staples': [
    'PG', 'KO', 'PEP', 'WMT', 'COST', 'PM', 'MO', 'CL', 'KHC', 'MDLZ',
    'GIS', 'K', 'HSY', 'SJM', 'CAG', 'KMB', 'CHD', 'EL', 'STZ', 'KDP',
  ],
  Energy: [
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD',
    'DVN', 'HES', 'HAL', 'BKR', 'FANG', 'MRO', 'APA', 'CTRA', 'OVV', 'EQT',
  ],
  Industrials: [
    'CAT', 'BA', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'DE', 'MMM', 'UNP',
    'CSX', 'NSC', 'FDX', 'WM', 'RSG', 'EMR', 'ETN', 'ITW', 'PH', 'ROK',
    'GD', 'NOC', 'TXT', 'LHX', 'AXON',
  ],
  Utilities: [
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'ED', 'PEG',
    'WEC', 'ES', 'AWK', 'DTE', 'AEE', 'CMS', 'CNP', 'FE', 'EVRG', 'NI',
  ],
  'Real Estate': [
    'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'O', 'WELL', 'DLR', 'AVB',
    'EQR', 'VTR', 'ARE', 'MAA', 'UDR', 'ESS', 'INVH', 'SUI', 'ELS', 'PEAK',
  ],
  Materials: [
    'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG',
    'VMC', 'MLM', 'ALB', 'CTVA', 'FMC', 'CE', 'EMN', 'IFF', 'PKG', 'IP',
  ],
  'Communication Services': [
    'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOX',
    'OMC', 'IPG', 'TTWO', 'EA', 'MTCH', 'LYV', 'RBLX', 'SPOT', 'PINS', 'SNAP',
  ],
};

// Flatten universe for screening
const ALL_STOCKS = Object.values(STOCK_UNIVERSE).flat();

// ============================================================================
// TOOL 1: SCREEN STOCKS
// ============================================================================

export const screenStocksTool = createTool({
  id: 'screen-stocks',
  description: 'Screen stocks based on financial criteria like P/E ratio, market cap, sector, dividend yield, and beta',

  inputSchema: z.object({
    sector: z.string().optional().describe('Sector to filter by (e.g., "Technology", "Healthcare")'),
    minMarketCap: z.number().optional().describe('Minimum market cap in billions'),
    maxMarketCap: z.number().optional().describe('Maximum market cap in billions'),
    minPE: z.number().optional().describe('Minimum P/E ratio'),
    maxPE: z.number().optional().describe('Maximum P/E ratio'),
    minDividendYield: z.number().optional().describe('Minimum dividend yield percentage'),
    maxDividendYield: z.number().optional().describe('Maximum dividend yield percentage'),
    minBeta: z.number().optional().describe('Minimum beta (volatility)'),
    maxBeta: z.number().optional().describe('Maximum beta (volatility)'),
    limit: z.number().optional().describe('Maximum number of results to return (default: 10)'),
  }),

  outputSchema: z.object({
    matches: z.array(z.object({
      ticker: z.string(),
      companyName: z.string(),
      sector: z.string(),
      marketCap: z.string(),
      marketCapRaw: z.number(),
      price: z.number(),
      peRatio: z.number().nullable(),
      dividendYield: z.number().nullable(),
      beta: z.number().nullable(),
    })),
    totalMatches: z.number(),
    criteriaUsed: z.record(z.any()),
  }),

  execute: async ({ context }) => {
    const {
      sector,
      minMarketCap,
      maxMarketCap,
      minPE,
      maxPE,
      minDividendYield,
      maxDividendYield,
      minBeta,
      maxBeta,
      limit = 10,
    } = context;

    // Determine which stocks to screen
    let tickersToScreen: string[];
    if (sector) {
      // Find matching sector (case-insensitive)
      const sectorKey = Object.keys(STOCK_UNIVERSE).find(
        (s) => s.toLowerCase() === sector.toLowerCase()
      );
      tickersToScreen = sectorKey ? STOCK_UNIVERSE[sectorKey] : ALL_STOCKS;
    } else {
      tickersToScreen = ALL_STOCKS;
    }

    // Fetch data for all tickers in parallel (in batches to avoid rate limits)
    const batchSize = 20;
    const results: any[] = [];

    for (let i = 0; i < tickersToScreen.length; i += batchSize) {
      const batch = tickersToScreen.slice(i, i + batchSize);
      const batchPromises = batch.map(async (ticker) => {
        try {
          const quote = await yf.quote(ticker);
          if (!quote) return null;

          // Determine sector for this stock
          let stockSector = 'Unknown';
          for (const [sec, tickers] of Object.entries(STOCK_UNIVERSE)) {
            if (tickers.includes(ticker)) {
              stockSector = sec;
              break;
            }
          }

          return {
            ticker,
            companyName: quote.longName || quote.shortName || ticker,
            sector: stockSector,
            marketCap: quote.marketCap || 0,
            price: quote.regularMarketPrice || 0,
            peRatio: quote.trailingPE ?? null,
            dividendYield: quote.dividendYield ? quote.dividendYield * 100 : null,
            beta: quote.beta ?? null,
          };
        } catch {
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r) => r !== null));
    }

    // Apply filters
    let filtered = results;

    if (minMarketCap !== undefined) {
      filtered = filtered.filter((r) => r.marketCap >= minMarketCap * 1e9);
    }
    if (maxMarketCap !== undefined) {
      filtered = filtered.filter((r) => r.marketCap <= maxMarketCap * 1e9);
    }
    if (minPE !== undefined) {
      filtered = filtered.filter((r) => r.peRatio !== null && r.peRatio >= minPE);
    }
    if (maxPE !== undefined) {
      filtered = filtered.filter((r) => r.peRatio !== null && r.peRatio <= maxPE);
    }
    if (minDividendYield !== undefined) {
      filtered = filtered.filter((r) => r.dividendYield !== null && r.dividendYield >= minDividendYield);
    }
    if (maxDividendYield !== undefined) {
      filtered = filtered.filter((r) => r.dividendYield !== null && r.dividendYield <= maxDividendYield);
    }
    if (minBeta !== undefined) {
      filtered = filtered.filter((r) => r.beta !== null && r.beta >= minBeta);
    }
    if (maxBeta !== undefined) {
      filtered = filtered.filter((r) => r.beta !== null && r.beta <= maxBeta);
    }

    // Sort by market cap descending and limit results
    filtered.sort((a, b) => b.marketCap - a.marketCap);
    const totalMatches = filtered.length;
    filtered = filtered.slice(0, limit);

    // Format output
    const matches = filtered.map((r) => ({
      ticker: r.ticker,
      companyName: r.companyName,
      sector: r.sector,
      marketCap: formatMarketCap(r.marketCap),
      marketCapRaw: r.marketCap,
      price: parseFloat(r.price.toFixed(2)),
      peRatio: r.peRatio ? parseFloat(r.peRatio.toFixed(2)) : null,
      dividendYield: r.dividendYield ? parseFloat(r.dividendYield.toFixed(2)) : null,
      beta: r.beta ? parseFloat(r.beta.toFixed(2)) : null,
    }));

    return {
      matches,
      totalMatches,
      criteriaUsed: {
        sector: sector || 'All',
        minMarketCap: minMarketCap ? `$${minMarketCap}B` : undefined,
        maxMarketCap: maxMarketCap ? `$${maxMarketCap}B` : undefined,
        minPE,
        maxPE,
        minDividendYield: minDividendYield ? `${minDividendYield}%` : undefined,
        maxDividendYield: maxDividendYield ? `${maxDividendYield}%` : undefined,
        minBeta,
        maxBeta,
        limit,
      },
    };
  },
});

// ============================================================================
// TOOL 2: COMPARE COMPANIES
// ============================================================================

export const compareCompaniesTool = createTool({
  id: 'compare-companies',
  description: 'Compare multiple companies side-by-side with key financial metrics',

  inputSchema: z.object({
    tickers: z.array(z.string()).min(2).max(10).describe('Array of 2-10 ticker symbols to compare'),
  }),

  outputSchema: z.object({
    comparison: z.array(z.object({
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
    })),
    summary: z.object({
      cheapestByPE: z.string().nullable(),
      highestGrowth: z.string().nullable(),
      lowestBeta: z.string().nullable(),
      highestDividend: z.string().nullable(),
      bestPerformer: z.string().nullable(),
      largestCompany: z.string().nullable(),
    }),
  }),

  execute: async ({ context }) => {
    const { tickers } = context;

    // Fetch data for all tickers in parallel
    const fetchPromises = tickers.map(async (ticker) => {
      const upperTicker = ticker.toUpperCase();
      try {
        const [quote, summary] = await Promise.all([
          yf.quote(upperTicker),
          yf.quoteSummary(upperTicker, {
            modules: ['summaryDetail', 'financialData', 'summaryProfile', 'defaultKeyStatistics'],
          }),
        ]);

        if (!quote) return null;

        // Determine sector
        const sector = summary.summaryProfile?.sector || 'Unknown';
        const keyStats = summary.defaultKeyStatistics;

        return {
          ticker: upperTicker,
          companyName: quote.longName || quote.shortName || upperTicker,
          sector,
          price: parseFloat((quote.regularMarketPrice || 0).toFixed(2)),
          marketCap: formatMarketCap(quote.marketCap || 0),
          marketCapRaw: quote.marketCap || 0,
          peRatio: quote.trailingPE ? parseFloat(quote.trailingPE.toFixed(2)) : null,
          pbRatio: typeof keyStats?.priceToBook === 'number'
            ? parseFloat(keyStats.priceToBook.toFixed(2))
            : null,
          psRatio: typeof summary.summaryDetail?.priceToSalesTrailing12Months === 'number'
            ? parseFloat(summary.summaryDetail.priceToSalesTrailing12Months.toFixed(2))
            : null,
          dividendYield: quote.dividendYield
            ? parseFloat((quote.dividendYield * 100).toFixed(2))
            : null,
          revenueGrowth: summary.financialData?.revenueGrowth
            ? parseFloat((summary.financialData.revenueGrowth * 100).toFixed(2))
            : null,
          profitMargin: summary.financialData?.profitMargins
            ? parseFloat((summary.financialData.profitMargins * 100).toFixed(2))
            : null,
          beta: typeof summary.summaryDetail?.beta === 'number'
            ? parseFloat(summary.summaryDetail.beta.toFixed(2))
            : null,
          fiftyTwoWeekChange: quote.fiftyTwoWeekChangePercent
            ? parseFloat((quote.fiftyTwoWeekChangePercent * 100).toFixed(2))
            : null,
          analystRating: summary.financialData?.recommendationKey || null,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    const comparison = results.filter((r) => r !== null) as NonNullable<typeof results[number]>[];

    // Calculate summary (best in each category)
    const withPE = comparison.filter((c) => c.peRatio !== null && c.peRatio > 0);
    const withGrowth = comparison.filter((c) => c.revenueGrowth !== null);
    const withBeta = comparison.filter((c) => c.beta !== null);
    const withDividend = comparison.filter((c) => c.dividendYield !== null && c.dividendYield > 0);
    const withChange = comparison.filter((c) => c.fiftyTwoWeekChange !== null);

    const summary = {
      cheapestByPE: withPE.length > 0
        ? withPE.reduce((a, b) => (a.peRatio! < b.peRatio! ? a : b)).ticker
        : null,
      highestGrowth: withGrowth.length > 0
        ? withGrowth.reduce((a, b) => (a.revenueGrowth! > b.revenueGrowth! ? a : b)).ticker
        : null,
      lowestBeta: withBeta.length > 0
        ? withBeta.reduce((a, b) => (a.beta! < b.beta! ? a : b)).ticker
        : null,
      highestDividend: withDividend.length > 0
        ? withDividend.reduce((a, b) => (a.dividendYield! > b.dividendYield! ? a : b)).ticker
        : null,
      bestPerformer: withChange.length > 0
        ? withChange.reduce((a, b) => (a.fiftyTwoWeekChange! > b.fiftyTwoWeekChange! ? a : b)).ticker
        : null,
      largestCompany: comparison.length > 0
        ? comparison.reduce((a, b) => (a.marketCapRaw > b.marketCapRaw ? a : b)).ticker
        : null,
    };

    return {
      comparison,
      summary,
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatMarketCap(value: number): string {
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  } else if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

// Export the stock universe for use in workflow
export const SCREENER_STOCK_UNIVERSE = STOCK_UNIVERSE;
export const SCREENER_ALL_STOCKS = ALL_STOCKS;
