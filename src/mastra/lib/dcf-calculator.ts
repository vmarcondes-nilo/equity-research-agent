// ============================================================================
// DCF CALCULATOR - QUANTITATIVE VALUATION ENGINE
// ============================================================================
// This module performs actual DCF (Discounted Cash Flow) calculations using
// established financial formulas. No AI guessing - just pure math.
//
// DCF METHODOLOGY:
// 1. Project future free cash flows (FCF) for 5 years
// 2. Calculate terminal value (value of all cash flows beyond year 5)
// 3. Discount all future cash flows to present value using WACC
// 4. Sum discounted cash flows to get enterprise value
// 5. Adjust for net debt (debt - cash) to get equity value
// 6. Divide by shares outstanding to get intrinsic value per share
//
// FORMULAS USED:
// - WACC = (E/V × Re) + (D/V × Rd × (1 - Tax Rate))
// - Terminal Value = FCF(year 5) × (1 + g) / (WACC - g)
// - Present Value = Future Cash Flow / (1 + WACC)^year
// - Equity Value = Enterprise Value - Net Debt
// - Intrinsic Value per Share = Equity Value / Shares Outstanding
// ============================================================================

export interface DCFInputs {
  // Current financial data
  freeCashFlow: number;           // Latest annual free cash flow
  totalDebt: number;              // Total debt (current + long-term)
  cash: number;                   // Total cash and cash equivalents
  sharesOutstanding: number;      // Number of shares outstanding
  marketCap: number;              // Current market capitalization

  // Growth assumptions
  revenueGrowth?: number;         // Historical revenue growth rate (%)

  // Optional overrides (if not provided, we'll use defaults)
  discountRate?: number;          // WACC / discount rate (%)
  terminalGrowthRate?: number;    // Perpetual growth rate for terminal value (%)
  projectionYears?: number;       // Number of years to project (default: 5)
}

export interface DCFOutputs {
  // Core valuation results
  intrinsicValue: number;                    // Fair value per share
  enterpriseValue: number;                   // Total business value
  equityValue: number;                       // Value to shareholders

  // Inputs used (for transparency)
  assumptions: {
    discountRate: number;                    // WACC used (%)
    terminalGrowthRate: number;              // Terminal growth rate (%)
    projectionYears: number;                 // Years projected
    initialFCF: number;                      // Starting FCF
    fcfGrowthRate: number;                   // FCF growth rate used (%)
  };

  // Detailed breakdown
  projectedCashFlows: {
    year: number;
    fcf: number;                             // Projected FCF for that year
    presentValue: number;                    // Discounted to present
    discountFactor: number;                  // (1 + WACC)^year
  }[];

  terminalValue: {
    nominal: number;                         // Terminal value in year N
    presentValue: number;                    // Discounted to present
  };

  // Sensitivity analysis
  sensitivity: {
    scenario: 'bear' | 'base' | 'bull';
    discountRate: number;
    growthRate: number;
    intrinsicValue: number;
  }[];

  // Valuation comparison
  currentPrice?: number;                     // Current market price
  upside?: number;                           // Upside/downside % vs current price
  recommendation?: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}

// ============================================================================
// WACC CALCULATION (Weighted Average Cost of Capital)
// ============================================================================
// WACC is the discount rate used in DCF. It represents the average rate
// the company must pay to finance its assets.
//
// For public companies, we use a simplified approach:
// - Estimate cost of equity using CAPM or use market-implied rate
// - For this implementation, we'll use reasonable defaults based on market cap
//
// Typical WACC ranges:
// - Large cap (>$200B): 8-10%
// - Mid cap ($10B-$200B): 10-12%
// - Small cap (<$10B): 12-15%
// ============================================================================
function calculateWACC(marketCap: number, customRate?: number): number {
  // If user provided custom rate, use it
  if (customRate !== undefined) {
    return customRate;
  }

  // Otherwise, estimate based on market cap size
  // Larger companies = lower cost of capital (less risky)
  if (marketCap > 200e9) {           // > $200B (mega cap)
    return 9.0;
  } else if (marketCap > 50e9) {     // $50B - $200B (large cap)
    return 10.0;
  } else if (marketCap > 10e9) {     // $10B - $50B (mid cap)
    return 11.0;
  } else if (marketCap > 2e9) {      // $2B - $10B (small cap)
    return 12.5;
  } else {                            // < $2B (micro cap)
    return 14.0;
  }
}

// ============================================================================
// FCF GROWTH RATE ESTIMATION
// ============================================================================
// We need to estimate how fast FCF will grow over the projection period.
// Best practice: Use historical revenue growth as a proxy, but apply decay.
//
// Growth decay model:
// - Start with historical revenue growth
// - Apply decay factor to converge toward terminal growth rate
// - Rationale: High growth rarely sustains; companies mature over time
// ============================================================================
function estimateFCFGrowthRate(
  revenueGrowth: number | undefined,
  terminalGrowthRate: number
): number {
  // If no historical growth data, use conservative estimate
  if (revenueGrowth === undefined || revenueGrowth === null) {
    // Use midpoint between terminal growth and moderate growth
    return (terminalGrowthRate + 8) / 2;  // e.g., (3 + 8) / 2 = 5.5%
  }

  // Cap historical growth at 25% (anything higher is likely unsustainable)
  const cappedGrowth = Math.min(revenueGrowth, 25);

  // If historical growth is negative, use terminal growth rate
  if (cappedGrowth < 0) {
    return terminalGrowthRate;
  }

  // Use weighted average: 70% historical growth, 30% terminal growth
  // This provides a smooth transition toward long-term sustainable growth
  return cappedGrowth * 0.7 + terminalGrowthRate * 0.3;
}

// ============================================================================
// MAIN DCF CALCULATION FUNCTION
// ============================================================================
export function calculateDCF(inputs: DCFInputs): DCFOutputs {
  // ========== STEP 1: SET UP ASSUMPTIONS ==========
  const projectionYears = inputs.projectionYears || 5;
  const terminalGrowthRate = inputs.terminalGrowthRate || 3.0;  // Default: 3% (GDP growth)
  const discountRate = calculateWACC(inputs.marketCap, inputs.discountRate);
  const fcfGrowthRate = estimateFCFGrowthRate(inputs.revenueGrowth, terminalGrowthRate);

  // Calculate net debt (debt - cash)
  const netDebt = inputs.totalDebt - inputs.cash;

  // ========== STEP 2: PROJECT FREE CASH FLOWS ==========
  // Project FCF for each year, applying the growth rate
  const projectedCashFlows: DCFOutputs['projectedCashFlows'] = [];

  for (let year = 1; year <= projectionYears; year++) {
    // Calculate FCF for this year: FCF(0) × (1 + g)^year
    const fcf = inputs.freeCashFlow * Math.pow(1 + fcfGrowthRate / 100, year);

    // Calculate discount factor: (1 + WACC)^year
    const discountFactor = Math.pow(1 + discountRate / 100, year);

    // Calculate present value: FCF / discount factor
    const presentValue = fcf / discountFactor;

    projectedCashFlows.push({
      year,
      fcf,
      presentValue,
      discountFactor,
    });
  }

  // ========== STEP 3: CALCULATE TERMINAL VALUE ==========
  // Terminal value represents all cash flows beyond the projection period
  // Formula: TV = FCF(final year) × (1 + g) / (WACC - g)
  // This is the Gordon Growth Model (perpetuity formula)

  const finalYearFCF = projectedCashFlows[projectionYears - 1].fcf;
  const terminalValueNominal =
    (finalYearFCF * (1 + terminalGrowthRate / 100)) /
    (discountRate / 100 - terminalGrowthRate / 100);

  // Discount terminal value back to present
  const terminalDiscountFactor = Math.pow(1 + discountRate / 100, projectionYears);
  const terminalValuePV = terminalValueNominal / terminalDiscountFactor;

  // ========== STEP 4: CALCULATE ENTERPRISE VALUE ==========
  // Enterprise Value = Sum of all discounted cash flows + discounted terminal value
  const sumOfDiscountedCashFlows = projectedCashFlows.reduce(
    (sum, cf) => sum + cf.presentValue,
    0
  );
  const enterpriseValue = sumOfDiscountedCashFlows + terminalValuePV;

  // ========== STEP 5: CALCULATE EQUITY VALUE ==========
  // Equity Value = Enterprise Value - Net Debt
  // If net debt is negative (more cash than debt), equity value increases
  const equityValue = enterpriseValue - netDebt;

  // ========== STEP 6: CALCULATE INTRINSIC VALUE PER SHARE ==========
  // Intrinsic Value = Equity Value / Shares Outstanding
  const intrinsicValue = equityValue / inputs.sharesOutstanding;

  // ========== STEP 7: SENSITIVITY ANALYSIS ==========
  // Calculate bear, base, and bull scenarios by varying discount rate and growth
  const sensitivity = calculateSensitivity(
    inputs,
    discountRate,
    fcfGrowthRate,
    terminalGrowthRate,
    projectionYears,
    netDebt
  );

  // ========== STEP 8: RETURN RESULTS ==========
  return {
    intrinsicValue,
    enterpriseValue,
    equityValue,
    assumptions: {
      discountRate,
      terminalGrowthRate,
      projectionYears,
      initialFCF: inputs.freeCashFlow,
      fcfGrowthRate,
    },
    projectedCashFlows,
    terminalValue: {
      nominal: terminalValueNominal,
      presentValue: terminalValuePV,
    },
    sensitivity,
  };
}

// ============================================================================
// SENSITIVITY ANALYSIS
// ============================================================================
// DCF valuation is sensitive to discount rate and growth assumptions.
// We calculate three scenarios to show the range of possible values:
// - Bear: Higher discount rate (+2%), lower growth (-2%)
// - Base: Our primary assumptions
// - Bull: Lower discount rate (-2%), higher growth (+2%)
// ============================================================================
function calculateSensitivity(
  inputs: DCFInputs,
  baseDiscountRate: number,
  baseFCFGrowth: number,
  baseTerminalGrowth: number,
  projectionYears: number,
  netDebt: number
): DCFOutputs['sensitivity'] {
  const scenarios: DCFOutputs['sensitivity'] = [];

  // Helper function to calculate intrinsic value for a scenario
  const calcIntrinsicValue = (discountRate: number, fcfGrowth: number, terminalGrowth: number): number => {
    // Project cash flows
    let sumPV = 0;
    for (let year = 1; year <= projectionYears; year++) {
      const fcf = inputs.freeCashFlow * Math.pow(1 + fcfGrowth / 100, year);
      const pv = fcf / Math.pow(1 + discountRate / 100, year);
      sumPV += pv;
    }

    // Calculate terminal value
    const finalFCF = inputs.freeCashFlow * Math.pow(1 + fcfGrowth / 100, projectionYears);
    const tv = (finalFCF * (1 + terminalGrowth / 100)) / (discountRate / 100 - terminalGrowth / 100);
    const tvPV = tv / Math.pow(1 + discountRate / 100, projectionYears);

    // Calculate equity value and intrinsic value per share
    const enterpriseValue = sumPV + tvPV;
    const equityValue = enterpriseValue - netDebt;
    return equityValue / inputs.sharesOutstanding;
  };

  // Bear scenario: Higher discount rate, lower growth (conservative)
  scenarios.push({
    scenario: 'bear',
    discountRate: baseDiscountRate + 2,
    growthRate: Math.max(baseFCFGrowth - 2, 0),  // Don't go below 0%
    intrinsicValue: calcIntrinsicValue(
      baseDiscountRate + 2,
      Math.max(baseFCFGrowth - 2, 0),
      Math.max(baseTerminalGrowth - 1, 2)  // Keep terminal growth reasonable
    ),
  });

  // Base scenario: Our primary assumptions
  scenarios.push({
    scenario: 'base',
    discountRate: baseDiscountRate,
    growthRate: baseFCFGrowth,
    intrinsicValue: calcIntrinsicValue(
      baseDiscountRate,
      baseFCFGrowth,
      baseTerminalGrowth
    ),
  });

  // Bull scenario: Lower discount rate, higher growth (optimistic)
  scenarios.push({
    scenario: 'bull',
    discountRate: Math.max(baseDiscountRate - 2, 5),  // Don't go below 5%
    growthRate: Math.min(baseFCFGrowth + 2, 25),      // Cap at 25%
    intrinsicValue: calcIntrinsicValue(
      Math.max(baseDiscountRate - 2, 5),
      Math.min(baseFCFGrowth + 2, 25),
      Math.min(baseTerminalGrowth + 1, 4)  // Cap terminal growth at 4%
    ),
  });

  return scenarios;
}

// ============================================================================
// VALUATION ASSESSMENT FUNCTION
// ============================================================================
// Compares intrinsic value to current market price and provides recommendation
// ============================================================================
export function assessValuation(
  intrinsicValue: number,
  currentPrice: number
): Pick<DCFOutputs, 'currentPrice' | 'upside' | 'recommendation'> {
  const upside = ((intrinsicValue - currentPrice) / currentPrice) * 100;

  let recommendation: DCFOutputs['recommendation'];

  // Recommendation logic based on upside/downside
  if (upside >= 30) {
    recommendation = 'Strong Buy';         // 30%+ upside
  } else if (upside >= 15) {
    recommendation = 'Buy';                // 15-30% upside
  } else if (upside >= -15) {
    recommendation = 'Hold';               // -15% to +15% (fairly valued)
  } else if (upside >= -30) {
    recommendation = 'Sell';               // -15% to -30% downside
  } else {
    recommendation = 'Strong Sell';        // 30%+ downside
  }

  return {
    currentPrice,
    upside,
    recommendation,
  };
}

// ============================================================================
// UTILITY: FORMAT DCF RESULTS FOR DISPLAY
// ============================================================================
// Converts DCF calculation results into human-readable format
// This can be used by the AI agent to explain results to users
// ============================================================================
export function formatDCFResults(results: DCFOutputs): string {
  const billions = (num: number) => (num / 1e9).toFixed(2);
  const millions = (num: number) => (num / 1e6).toFixed(2);

  let output = '=== DCF VALUATION RESULTS ===\n\n';

  // Core valuation
  output += `INTRINSIC VALUE PER SHARE: $${results.intrinsicValue.toFixed(2)}\n\n`;

  // Assumptions
  output += 'ASSUMPTIONS:\n';
  output += `- Initial Free Cash Flow: $${billions(results.assumptions.initialFCF)}B\n`;
  output += `- FCF Growth Rate: ${results.assumptions.fcfGrowthRate.toFixed(2)}%\n`;
  output += `- Discount Rate (WACC): ${results.assumptions.discountRate.toFixed(2)}%\n`;
  output += `- Terminal Growth Rate: ${results.assumptions.terminalGrowthRate.toFixed(2)}%\n`;
  output += `- Projection Period: ${results.assumptions.projectionYears} years\n\n`;

  // Projected cash flows
  output += 'PROJECTED FREE CASH FLOWS:\n';
  results.projectedCashFlows.forEach(cf => {
    output += `Year ${cf.year}: $${millions(cf.fcf)}M → PV: $${millions(cf.presentValue)}M\n`;
  });
  output += '\n';

  // Terminal value
  output += 'TERMINAL VALUE:\n';
  output += `- Nominal (Year ${results.assumptions.projectionYears}): $${billions(results.terminalValue.nominal)}B\n`;
  output += `- Present Value: $${billions(results.terminalValue.presentValue)}B\n\n`;

  // Valuation summary
  output += 'VALUATION SUMMARY:\n';
  output += `- Enterprise Value: $${billions(results.enterpriseValue)}B\n`;
  output += `- Equity Value: $${billions(results.equityValue)}B\n`;
  output += `- Intrinsic Value per Share: $${results.intrinsicValue.toFixed(2)}\n\n`;

  // Sensitivity analysis
  output += 'SENSITIVITY ANALYSIS:\n';
  results.sensitivity.forEach(scenario => {
    const label = scenario.scenario.toUpperCase().padEnd(6);
    output += `${label}: $${scenario.intrinsicValue.toFixed(2)} `;
    output += `(Growth: ${scenario.growthRate.toFixed(1)}%, Discount: ${scenario.discountRate.toFixed(1)}%)\n`;
  });

  // Recommendation
  if (results.currentPrice && results.upside !== undefined && results.recommendation) {
    output += '\n';
    output += 'VALUATION vs MARKET:\n';
    output += `- Current Price: $${results.currentPrice.toFixed(2)}\n`;
    output += `- Upside/Downside: ${results.upside > 0 ? '+' : ''}${results.upside.toFixed(2)}%\n`;
    output += `- Recommendation: ${results.recommendation}\n`;
  }

  return output;
}
