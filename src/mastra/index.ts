import 'dotenv/config';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { equityAnalysisWorkflow } from './workflows/equity-workflow';
import { dcfValuationWorkflow } from './workflows/dcf-workflow';
import { comparableAnalysisWorkflow } from './workflows/comparable-workflow';
import { sentimentAnalysisWorkflow } from './workflows/sentiment-workflow';
import { riskAssessmentWorkflow } from './workflows/risk-workflow';
import { fullResearchWorkflow } from './workflows/full-research-workflow';
import { portfolioAnalysisWorkflow } from './workflows/portfolio-workflow';
import { earningsEventWorkflow } from './workflows/earnings-workflow';
import { stockScreenerWorkflow } from './workflows/screener-workflow';
import { analystAgent } from './agents/analyst-agent';
import { fundamentalAnalyst } from './agents/fundamental-analyst';
import { sentimentAnalyst } from './agents/sentiment-analyst';
import { riskAnalyst } from './agents/risk-analyst';
import { masterAnalyst } from './agents/master-analyst';
import { portfolioAnalyst } from './agents/portfolio-analyst';
import { earningsAnalyst } from './agents/earnings-analyst';
import { stockScreenerAgent } from './agents/screener-agent';

export const mastra = new Mastra({
  workflows: {
    equityAnalysisWorkflow,
    dcfValuationWorkflow,
    comparableAnalysisWorkflow,
    sentimentAnalysisWorkflow,
    riskAssessmentWorkflow,
    fullResearchWorkflow,
    portfolioAnalysisWorkflow,
    earningsEventWorkflow,
    stockScreenerWorkflow,
  },
  agents: {
    analystAgent,
    fundamentalAnalyst,
    sentimentAnalyst,
    riskAnalyst,
    masterAnalyst,
    portfolioAnalyst,
    earningsAnalyst,
    stockScreenerAgent,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  storage: new LibSQLStore({
    url: 'file:mastra-memory.db',
  }),
});
