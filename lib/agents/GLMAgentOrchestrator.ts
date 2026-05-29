import { GLMExtractionAgent } from './GLMExtractionAgent';
import { GLMValidationAgent } from './GLMValidationAgent';
import { FraudDetectionAgent } from './FraudDetectionAgent';
import { EnrichmentAgent } from './EnrichmentAgent';
import { AgentPipelineResult, ExtractedData } from './types';

export class GLMAgentOrchestrator {
  private extractionAgent: GLMExtractionAgent;
  private validationAgent: GLMValidationAgent;
  private fraudDetectionAgent: FraudDetectionAgent;
  private enrichmentAgent: EnrichmentAgent;
  private agentsEnabled: boolean;

  constructor(apiKey: string) {
    this.agentsEnabled = !!(apiKey && apiKey.length > 0);
    this.extractionAgent = new GLMExtractionAgent(apiKey);
    this.validationAgent = new GLMValidationAgent(apiKey);
    this.fraudDetectionAgent = new FraudDetectionAgent();
    this.enrichmentAgent = new EnrichmentAgent();
  }

  isAgentsEnabled(): boolean {
    return this.agentsEnabled;
  }

  async processApplication(rawData: string): Promise<AgentPipelineResult> {
    const startTime = Date.now();

    try {
      // Step 1: Extract data using GLM
      const extractionResult = await this.extractionAgent.process({ rawData });
      let extractedData = extractionResult.data;

      // Step 2: Validate extracted data
      const validationResult = await this.validationAgent.process({ data: extractedData });

      // Step 3: Fraud detection (rule-based, no API needed)
      const fraudCheckResult = await this.fraudDetectionAgent.process({ data: extractedData });

      // Step 4: Enrich data (if not high fraud risk)
      let enrichmentResult: import('./types').EnrichmentResult | undefined;
      if (fraudCheckResult.riskLevel !== 'critical') {
        enrichmentResult = await this.enrichmentAgent.process({ data: extractedData });
        extractedData = { ...extractedData, ...enrichmentResult.enrichedData };
      }

      const processingTime = Date.now() - startTime;

      return {
        extraction: extractionResult,
        validation: validationResult,
        enrichment: enrichmentResult,
        fraudCheck: fraudCheckResult,
        finalData: extractedData,
        processingTime,
      };
    } catch (error) {
      console.error('GLM Agent orchestrator error:', error);
      throw error;
    }
  }

  async processBatch(rawDataList: string[]): Promise<AgentPipelineResult[]> {
    const promises = rawDataList.map(data => this.processApplication(data));
    return Promise.all(promises);
  }
}

// Singleton instance
let glmOrchestratorInstance: GLMAgentOrchestrator | null = null;

export function getGLMOrchestrator(apiKey: string): GLMAgentOrchestrator {
  if (!glmOrchestratorInstance) {
    glmOrchestratorInstance = new GLMAgentOrchestrator(apiKey);
  }
  return glmOrchestratorInstance;
}
