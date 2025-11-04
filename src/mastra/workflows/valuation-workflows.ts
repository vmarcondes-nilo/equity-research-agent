// ============================================================================
// VALUATION WORKFLOWS
// ============================================================================
// This file contains two major workflows for stock valuation:
// 1. DCF Valuation Workflow - Calculates intrinsic value using Discounted Cash Flow model
// 2. Comparable Analysis Workflow - Values a company relative to its peers
//
// These workflows leverage existing tools from fundamental-tools.ts and
// equity-tools.ts to fetch data, avoiding code duplication and ensuring
// consistency across the application.
// ============================================================================

import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

// Import existing tools instead of duplicating API calls
import { getCashFlowTool, getBalanceSheetTool, getFinancialRatiosTool } from '../tools/fundamental-tools';
import { getStockPriceTool, getFinancialsTool } from '../tools/equity-tools';

// Initialize OpenAI model for AI-powered analysis
const llm = openai('gpt-4o');

// ============================================================================
// VALUATION AGENT
// ============================================================================
// This specialized agent handles the analytical synthesis of valuation data.
// It takes raw financial data and produces human-readable valuation reports.
// ============================================================================
const valuationAgent = new Agent({
  name: 'Valuation Specialist',
  model: llm,
  instructions: `
    You are a valuation expert specializing in DCF models and comparable company analysis.
    
    Provide clear, data-driven valuation analysis with:
    - Intrinsic value estimates
    - Key assumptions and their impact
    - Sensitivity analysis
    - Fair value range (conservative, base, optimistic)
    - Comparison to current market price
    
    Always explain your methodology and be transparent about limitations.
  `,
});

// ============================================================================
// DCF VALUATION WORKFLOW - STEP 1: FETCH DATA
// ============================================================================
// This step gathers all the financial data needed to perform a DCF valuation
// by calling existing tools instead of duplicating API calls.
//
// TOOLS USED:
// - getStockPriceTool: Current price, market cap, shares outstanding
// - getCashFlowTool: Free cash flow, operating cash flow
// - getBalanceSheetTool: Total debt, cash, shares outstanding
// - getFinancialsTool: Revenue growth and other key metrics
// ============================================================================
const fetchDCFData = createStep({
  id: 'fetch-dcf-data',
  description: 'Fetches financial data needed for DCF valuation using existing tools',
  
  // INPUT: Just needs a ticker symbol (e.g., "AAPL")
  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
  }),
  
  // OUTPUT: All the financial metrics needed for DCF calculation
  outputSchema: z.object({
    ticker: z.string(),
    currentPrice: z.number(),                    // Current stock price (for comparison)
    freeCashFlow: z.number().nullable(),         // FCF is core to DCF model
    totalDebt: z.number().nullable(),            // Debt (to calculate equity value)
    cash: z.number().nullable(),                 // Cash (to calculate equity value)
    sharesOutstanding: z.number().nullable(),    // Shares (to get per-share value)
    revenueGrowth: z.number().nullable(),        // Growth rate (to project future FCF)
    marketCap: z.string(),                       // Market cap (for context)
  }),
  
  execute: async ({ inputData, runtimeContext }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const ticker = inputData.ticker.toUpperCase();
    
    try {
      // Call existing tools to fetch data (avoiding code duplication)
      // Each tool returns structured, validated data
      // runtimeContext is passed from the step's execute parameters (Mastra pattern)
      
      // 1. Get price data (current price, market cap, shares)
      const priceData = await getStockPriceTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // 2. Get cash flow data (free cash flow - the key DCF input)
      const cashFlowData = await getCashFlowTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // 3. Get balance sheet data (debt, cash)
      const balanceSheetData = await getBalanceSheetTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // 4. Get financial metrics (revenue growth for projections)
      const financialsData = await getFinancialsTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // Combine data from all tools into the format needed for DCF
      return {
        ticker,
        currentPrice: priceData.price,
        freeCashFlow: cashFlowData.cashFlow.freeCashFlow,
        totalDebt: balanceSheetData.balanceSheet.totalDebt,
        cash: balanceSheetData.balanceSheet.totalCash,
        sharesOutstanding: balanceSheetData.shares.sharesOutstanding,
        revenueGrowth: financialsData.revenueGrowth,
        marketCap: priceData.marketCap,
      };
    } catch (error) {
      throw new Error(`Failed to fetch DCF data for ${ticker}: ${error}`);
    }
  },
});

// ============================================================================
// DCF VALUATION WORKFLOW - STEP 2: CALCULATE & ANALYZE
// ============================================================================
// This step takes the financial data and uses AI to perform DCF analysis.
// The AI agent will:
// 1. Project future free cash flows (typically 5-10 years)
// 2. Calculate terminal value (value beyond projection period)
// 3. Discount all cash flows to present value using WACC
// 4. Adjust for net debt to get equity value
// 5. Divide by shares to get intrinsic value per share
// 6. Provide Bear/Base/Bull scenarios and sensitivity analysis
// ============================================================================
const calculateDCF = createStep({
  id: 'calculate-dcf',
  description: 'Calculates intrinsic value using DCF model',
  
  // INPUT: All the financial data from the previous step
  inputSchema: z.object({
    ticker: z.string(),
    currentPrice: z.number(),
    freeCashFlow: z.number().nullable(),
    totalDebt: z.number().nullable(),
    cash: z.number().nullable(),
    sharesOutstanding: z.number().nullable(),
    revenueGrowth: z.number().nullable(),
    marketCap: z.string(),
  }),
  
  // OUTPUT: A comprehensive valuation analysis as text
  outputSchema: z.object({
    valuation: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    // Build a detailed prompt for the AI valuation agent
    // We format all the financial data clearly and provide DCF methodology
    const prompt = `Perform a DCF (Discounted Cash Flow) valuation for ${inputData.ticker} using the following data:

FINANCIAL DATA:
- Current Stock Price: $${inputData.currentPrice.toFixed(2)}
- Market Cap: ${inputData.marketCap}
- Free Cash Flow (Latest): $${inputData.freeCashFlow ? (inputData.freeCashFlow / 1e9).toFixed(2) : 'N/A'}B
- Total Debt: $${inputData.totalDebt ? (inputData.totalDebt / 1e9).toFixed(2) : 'N/A'}B
- Cash: $${inputData.cash ? (inputData.cash / 1e9).toFixed(2) : 'N/A'}B
- Shares Outstanding: ${inputData.sharesOutstanding ? (inputData.sharesOutstanding / 1e9).toFixed(2) : 'N/A'}B
- Revenue Growth Rate: ${inputData.revenueGrowth?.toFixed(2) || 'N/A'}%

Calculate intrinsic value using DCF with:
1. Project free cash flows for 5-10 years
2. Use reasonable growth assumptions based on historical growth
3. Apply appropriate discount rate (WACC, typically 8-12%)
4. Calculate terminal value
5. Discount to present value
6. Subtract net debt, divide by shares outstanding

Provide:
- Intrinsic Value Estimate (per share)
- Fair Value Range (Bear/Base/Bull scenarios)
- Key Assumptions Used
- Sensitivity Analysis (what if growth is ±2%?)
- Valuation vs Current Price (Upside/Downside %)
- Investment Recommendation

Format the analysis clearly with numbers and explanations.`;

    // Send the prompt to the valuation agent and stream the response
    const response = await valuationAgent.streamLegacy([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // Collect the streamed response chunks into a full text
    let valuationText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);  // Display in real-time
      valuationText += chunk;        // Build the full response
    }

    // Return the complete valuation analysis
    return {
      valuation: valuationText,
    };
  },
});

// ============================================================================
// DCF WORKFLOW DEFINITION
// ============================================================================
// This workflow chains together the two steps above:
// 1. fetchDCFData - Gets financial data from Yahoo Finance
// 2. calculateDCF - AI analyzes data and produces DCF valuation
//
// USAGE: 
//   const result = await dcfValuationWorkflow.execute({ ticker: 'AAPL' });
//   console.log(result.valuation); // Full DCF analysis with intrinsic value
// ============================================================================
export const dcfValuationWorkflow = createWorkflow({
  id: 'dcf-valuation-workflow',
  
  // INPUT: Just a ticker symbol
  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol to value'),
  }),
  
  // OUTPUT: Complete valuation analysis as text
  outputSchema: z.object({
    valuation: z.string(),
  }),
})
  .then(fetchDCFData)      // Step 1: Fetch financial data
  .then(calculateDCF);      // Step 2: Calculate DCF and generate analysis

// Commit the workflow to make it executable
dcfValuationWorkflow.commit();

// ============================================================================
// COMPARABLE COMPANY ANALYSIS WORKFLOW
// ============================================================================
// This workflow values a company relative to its industry peers using
// valuation multiples like P/E, P/B, P/S, PEG, and EV/EBITDA.
//
// Key concept: If similar companies trade at 20x earnings, and our company
// has the same quality metrics, it should also trade at 20x earnings.
// ============================================================================

// Define Zod schemas for type safety and validation
// These schemas ensure data consistency across workflow steps

// Schema for the target company's data (the company we're valuing)
const companyDataSchema = z.object({
  name: z.string(),                            // Company name
  price: z.number(),                           // Current stock price
  marketCap: z.number(),                       // Market capitalization
  peRatio: z.number().nullable(),              // Price-to-Earnings ratio
  pbRatio: z.number().nullable(),              // Price-to-Book ratio
  psRatio: z.number().nullable(),              // Price-to-Sales ratio
  pegRatio: z.number().nullable(),             // PEG ratio (P/E divided by growth)
  evToEbitda: z.number().nullable(),           // Enterprise Value to EBITDA
  revenueGrowth: z.number().nullable(),        // Revenue growth % (for context)
  profitMargin: z.number().nullable(),         // Profit margin % (for quality assessment)
});

// Schema for peer company data (competitors/similar companies)
// Note: This has fewer fields since we only need valuation multiples for comparison
const peerDataSchema = z.object({
  ticker: z.string(),                          // Peer ticker symbol
  name: z.string(),                            // Peer company name
  peRatio: z.number().nullable(),              // Peer P/E ratio
  pbRatio: z.number().nullable(),              // Peer P/B ratio
  psRatio: z.number().nullable(),              // Peer P/S ratio
  pegRatio: z.number().nullable(),             // Peer PEG ratio
  evToEbitda: z.number().nullable(),           // Peer EV/EBITDA
});

// ============================================================================
// COMPARABLE ANALYSIS WORKFLOW - STEP 1: FETCH DATA
// ============================================================================
// This step fetches valuation multiples for the target company and peers
// by calling existing tools instead of duplicating API calls.
//
// TOOLS USED:
// - getStockPriceTool: Current price, market cap
// - getFinancialRatiosTool: All valuation multiples (P/E, P/B, P/S, PEG, EV/EBITDA)
// - getFinancialsTool: Revenue growth and profit margins
// ============================================================================
const fetchComparables = createStep({
  id: 'fetch-comparables',
  description: 'Fetches valuation metrics for company and peers using existing tools',
  
  // INPUT: Target ticker + optional list of peer tickers
  // Example: { ticker: 'AAPL', peers: ['MSFT', 'GOOGL', 'META'] }
  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol'),
    peers: z.array(z.string()).optional().describe('Peer company tickers'),
  }),
  
  // OUTPUT: Company data + array of peer data
  outputSchema: z.object({
    ticker: z.string(),
    companyData: companyDataSchema,      // Full data for target company
    peerData: z.array(peerDataSchema),   // Valuation multiples for each peer
  }),
  
  execute: async ({ inputData, runtimeContext }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const ticker = inputData.ticker.toUpperCase();
    const peers = inputData.peers || [];
    
    try {
      // ========== FETCH TARGET COMPANY DATA ==========
      // Call existing tools to get comprehensive data
      // runtimeContext is passed from the step's execute parameters (Mastra pattern)
      
      // Get price and market cap
      const priceData = await getStockPriceTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // Get all financial ratios (includes valuation multiples)
      const ratiosData = await getFinancialRatiosTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // Get revenue growth and profit margins
      const financialsData = await getFinancialsTool.execute({
        context: { ticker },
        runtimeContext,
      });
      
      // Build the company data object with all valuation multiples
      const companyData = {
        name: financialsData.companyName,
        price: priceData.price,
        marketCap: parseFloat(priceData.marketCap.replace(/[$BTM]/g, '')) * 
                  (priceData.marketCap.includes('T') ? 1e12 : 
                   priceData.marketCap.includes('B') ? 1e9 : 
                   priceData.marketCap.includes('M') ? 1e6 : 1),
        peRatio: ratiosData.valuation.peRatio,
        pbRatio: ratiosData.valuation.pbRatio,
        psRatio: ratiosData.valuation.psRatio,
        pegRatio: ratiosData.valuation.pegRatio,
        evToEbitda: ratiosData.valuation.evToEbitda,
        revenueGrowth: financialsData.revenueGrowth,
        profitMargin: financialsData.profitMargin,
      };
      
      // ========== FETCH PEER COMPANY DATA ==========
      // Use Promise.all to fetch all peer data in parallel (faster)
      const peerData = await Promise.all(
        peers.map(async (peerTicker) => {
          try {
            // Fetch ratios data for each peer using the tool
            const peerRatiosData = await getFinancialRatiosTool.execute({
              context: { ticker: peerTicker },
              runtimeContext,
            });
            
            // Build peer data object (only valuation multiples needed)
            return {
              ticker: peerTicker,
              name: peerRatiosData.companyName,
              peRatio: peerRatiosData.valuation.peRatio,
              pbRatio: peerRatiosData.valuation.pbRatio,
              psRatio: peerRatiosData.valuation.psRatio,
              pegRatio: peerRatiosData.valuation.pegRatio,
              evToEbitda: peerRatiosData.valuation.evToEbitda,
            };
          } catch (error) {
            // If a peer fails to load, log warning but don't crash the workflow
            console.warn(`Failed to fetch data for peer ${peerTicker}:`, error);
            return null;
          }
        })
      );
      
      // Return company data + peer data (filtering out any null peers)
      return {
        ticker,
        companyData,
        peerData: peerData.filter((peer): peer is NonNullable<typeof peer> => peer !== null),
      };
    } catch (error) {
      throw new Error(`Failed to fetch comparable data for ${ticker}: ${error}`);
    }
  },
});

// ============================================================================
// COMPARABLE ANALYSIS WORKFLOW - STEP 2: ANALYZE & COMPARE
// ============================================================================
// This step takes the company and peer data and uses AI to:
// 1. Calculate peer group averages for all valuation multiples
// 2. Compare the target company to peer averages
// 3. Determine if the company is overvalued or undervalued
// 4. Explain any premium/discount based on growth and quality metrics
// 5. Calculate implied fair value using peer multiples
// 6. Provide investment recommendation
// ============================================================================
const analyzeComparables = createStep({
  id: 'analyze-comparables',
  description: 'Analyzes valuation vs peers',
  
  // INPUT: All the data from the previous step
  inputSchema: z.object({
    ticker: z.string(),
    companyData: companyDataSchema,
    peerData: z.array(peerDataSchema),
  }),
  
  // OUTPUT: Comprehensive comparable analysis as text
  outputSchema: z.object({
    analysis: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    // Build a detailed prompt for the AI valuation agent
    // Format company data clearly, then list all peer companies
    const prompt = `Perform a comparable company analysis for ${inputData.ticker}:

COMPANY: ${inputData.companyData.name}
- Price: $${inputData.companyData.price}
- Market Cap: $${(inputData.companyData.marketCap / 1e9).toFixed(2)}B
- P/E Ratio: ${inputData.companyData.peRatio?.toFixed(2) || 'N/A'}
- P/B Ratio: ${inputData.companyData.pbRatio?.toFixed(2) || 'N/A'}
- P/S Ratio: ${inputData.companyData.psRatio?.toFixed(2) || 'N/A'}
- PEG Ratio: ${inputData.companyData.pegRatio?.toFixed(2) || 'N/A'}
- EV/EBITDA: ${inputData.companyData.evToEbitda?.toFixed(2) || 'N/A'}
- Revenue Growth: ${inputData.companyData.revenueGrowth?.toFixed(2) || 'N/A'}%
- Profit Margin: ${inputData.companyData.profitMargin?.toFixed(2) || 'N/A'}%

PEER COMPANIES:
${inputData.peerData.map((peer: any, idx: number) => `
${idx + 1}. ${peer.name} (${peer.ticker})
   P/E: ${peer.peRatio?.toFixed(2) || 'N/A'} | P/B: ${peer.pbRatio?.toFixed(2) || 'N/A'} | P/S: ${peer.psRatio?.toFixed(2) || 'N/A'} | PEG: ${peer.pegRatio?.toFixed(2) || 'N/A'} | EV/EBITDA: ${peer.evToEbitda?.toFixed(2) || 'N/A'}
`).join('')}

Provide a comprehensive comparable company analysis:
1. Calculate peer group averages for each metric
2. Compare company metrics to peer averages
3. Identify if company is overvalued or undervalued vs peers
4. Explain any premium/discount (growth, quality, market position)
5. Calculate implied fair value using peer multiples
6. Provide valuation recommendation

Format clearly with specific numbers and insights.`;

    // Send the prompt to the valuation agent and stream the response
    const response = await valuationAgent.streamLegacy([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // Collect the streamed response chunks into full text
    let analysisText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);  // Display in real-time
      analysisText += chunk;         // Build the full response
    }

    // Return the complete comparable analysis
    return {
      analysis: analysisText,
    };
  },
});

// ============================================================================
// COMPARABLE ANALYSIS WORKFLOW DEFINITION
// ============================================================================
// This workflow chains together the two steps above:
// 1. fetchComparables - Gets valuation multiples for target company and peers
// 2. analyzeComparables - AI compares multiples and determines relative value
//
// USAGE:
//   const result = await comparableAnalysisWorkflow.execute({ 
//     ticker: 'AAPL', 
//     peers: ['MSFT', 'GOOGL', 'META'] 
//   });
//   console.log(result.analysis); // Full peer comparison analysis
//
// NOTE: Peers should be companies in the same industry/sector for accurate
// comparison. For example:
// - Tech: AAPL, MSFT, GOOGL, META, NVDA
// - Retail: WMT, TGT, COST, AMZN
// - Banks: JPM, BAC, WFC, C
// ============================================================================
export const comparableAnalysisWorkflow = createWorkflow({
  id: 'comparable-analysis-workflow',
  
  // INPUT: Target ticker + array of peer tickers
  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol to analyze'),
    peers: z.array(z.string()).optional().describe('Peer company tickers for comparison'),
  }),
  
  // OUTPUT: Complete peer comparison analysis as text
  outputSchema: z.object({
    analysis: z.string(),
  }),
})
  .then(fetchComparables)      // Step 1: Fetch company + peer data
  .then(analyzeComparables);    // Step 2: Compare and analyze

// Commit the workflow to make it executable
comparableAnalysisWorkflow.commit();

// ============================================================================
// END OF VALUATION WORKFLOWS
// ============================================================================
// Summary:
// - dcfValuationWorkflow: Calculates intrinsic value using DCF model
// - comparableAnalysisWorkflow: Values company relative to industry peers
//
// REFACTORING NOTE:
// These workflows now use existing tools from fundamental-tools.ts and
// equity-tools.ts instead of duplicating Yahoo Finance API calls. Benefits:
// 1. ✅ No code duplication - maintains single source of truth
// 2. ✅ Consistency - all data fetching uses the same validated tools
// 3. ✅ Maintainability - changes to data fetching logic only needed in tools
// 4. ✅ Type safety - tools provide structured, validated output schemas
//
// MASTRA PATTERN FOR CALLING TOOLS IN WORKFLOWS:
// Tools are called using: tool.execute({ context: {...}, runtimeContext })
// The runtimeContext is passed from the step's execute function parameters,
// following the official Mastra documentation pattern:
// https://mastra.ai/docs/workflows/agents-and-tools
// ============================================================================

