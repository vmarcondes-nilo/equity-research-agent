import 'dotenv/config';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows';
import { equityAnalysisWorkflow } from './workflows/equity-workflow';
import { dcfValuationWorkflow, comparableAnalysisWorkflow } from './workflows/valuation-workflows';
import { weatherAgent } from './agents';
import { analystAgent } from './agents/analyst-agent';
import { fundamentalAnalyst } from './agents/fundamental-analyst';

export const mastra = new Mastra({
  workflows: { 
    weatherWorkflow,
    equityAnalysisWorkflow,
    dcfValuationWorkflow,
    comparableAnalysisWorkflow,
  },
  agents: { 
    weatherAgent,
    analystAgent,
    fundamentalAnalyst,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  storage: new LibSQLStore({
    url: 'file:mastra-memory.db',
  }),
});
