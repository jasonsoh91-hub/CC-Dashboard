import { ExtractionAgent } from './ExtractionAgent';
import { ValidationAgent } from './ValidationAgent';
import { FraudDetectionAgent } from './FraudDetectionAgent';
import { EnrichmentAgent } from './EnrichmentAgent';
import { AgentPipelineResult, ExtractedData } from './types';

export class AgentOrchestrator {
  private extractionAgent: ExtractionAgent;
  private validationAgent: ValidationAgent;
  private fraudDetectionAgent: FraudDetectionAgent;
  private enrichmentAgent: EnrichmentAgent;
  private agentsEnabled: boolean;

  constructor(anthropicApiKey?: string) {
    this.agentsEnabled = !!(anthropicApiKey && anthropicApiKey.length > 0);
    this.extractionAgent = new ExtractionAgent(anthropicApiKey);
    this.validationAgent = new ValidationAgent(anthropicApiKey);
    this.fraudDetectionAgent = new FraudDetectionAgent(anthropicApiKey);
    this.enrichmentAgent = new EnrichmentAgent(anthropicApiKey);
  }

  isAgentsEnabled(): boolean {
    return this.agentsEnabled;
  }

  async processApplication(rawData: string): Promise<AgentPipelineResult> {
    const startTime = Date.now();

    try {
      // Step 1: Extract data
      const extractionResult = await this.extractionAgent.process({ rawData });
      let extractedData = extractionResult.data;

      // Step 2: Validate extracted data
      const validationResult = await this.validationAgent.process({ data: extractedData });

      // Step 3: Fraud detection
      const fraudCheckResult = await this.fraudDetectionAgent.process({ data: extractedData });

      // Step 4: Enrich data (only if not high fraud risk)
      let enrichmentResult: import('./types').EnrichmentResult | undefined;
      if (fraudCheckResult.riskLevel !== 'critical') {
        enrichmentResult = await this.enrichmentAgent.process({ data: extractedData });
        // Merge enriched data
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
      console.error('Agent orchestrator error:', error);
      throw error;
    }
  }

  // Process multiple applications in parallel
  async processBatch(rawDataList: string[]): Promise<AgentPipelineResult[]> {
    const promises = rawDataList.map(data => this.processApplication(data));
    return Promise.all(promises);
  }
}

// Singleton instance
let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(apiKey?: string): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator(apiKey);
  }
  return orchestratorInstance;
}
