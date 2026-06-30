// Base types for the multi-agent system

export interface AgentInput {
  rawData: string;
  context?: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data: unknown;
  errors?: string[];
  warnings?: string[];
  confidence?: number;
}

export interface ExtractedData {
  name: string | null;
  ic_number: string | null;
  passport_number?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nationality?: string | null;
  mother_name: string | null;
  employer_name: string | null;
  employer_address: string | null;
  position: string | null;
  occupation: string | null;
  office_phone: string | null;
  work_since: string | null;
  work_email: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  education_level?: string | null;
  gender?: string;
  business_classification?: string;
  employment_sector?: string;
}

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  invalidFields: Record<string, string>;
  warnings: string[];
  suggestions: Record<string, string>;
}

export interface EnrichmentResult {
  enrichedData: Partial<ExtractedData>;
  sources: string[];
  confidence: number;
}

export interface FraudCheckResult {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  reasons: string[];
}

export interface AgentPipelineResult {
  extraction: AgentOutput & { data: ExtractedData };
  validation: ValidationResult;
  enrichment?: EnrichmentResult;
  fraudCheck?: FraudCheckResult;
  finalData: ExtractedData;
  processingTime?: number;
}
