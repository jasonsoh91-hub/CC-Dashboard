# Multi-Agent System for Credit Card Processing

## Overview

This project now includes a multi-agent system powered by Claude AI to intelligently process credit card applications. The system uses specialized agents that work together to extract, validate, enrich, and screen applicant data.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT ORCHESTRATION                          │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  Raw Data    │
    │  (WhatsApp,  │
    │   Email, etc)│
    └──────┬───────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     EXTRACTION AGENT                              │
│  • Parse messy text using Claude AI                              │
│  • Extract structured fields (name, IC, employer, etc.)           │
│  • Expand abbreviations (MD→Managing Director, etc.)              │
│  • Confidence scoring & warnings                                  │
└────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     VALIDATION AGENT                              │
│  • Check required fields completeness                             │
│  • Validate IC number format (12 digits)                          │
│  • Validate phone/email formats                                   │
│  • Generate suggestions for missing data                           │
└────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FRAUD DETECTION AGENT                          │
│  • Risk scoring (0-100)                                            │
│  • Flag test data, suspicious patterns                            │
│  • Check disposable emails, incomplete addresses                   │
│  • Detect data inconsistencies                                     │
└────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼ (if low risk)
┌──────────────────────────────────────────────────────────────────┐
│                      ENRICHMENT AGENT                              │
│  • Infer gender from name                                         │
│  • Expand abbreviations                                           │
│  • Suggest business classification                                │
│  • Infer employment sector                                        │
└────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Final Data  │
                    │ + Metadata  │
                    └─────────────┘
```

## Agents

### 1. Extraction Agent
- **Purpose**: Extract structured data from unstructured text
- **AI Model**: Claude 3.5 Sonnet
- **Features**:
  - Handles various input formats (WhatsApp, email, forms)
  - Malaysian IC validation
  - Phone number cleaning
  - Abbreviation expansion
  - Confidence scoring

### 2. Validation Agent
- **Purpose**: Validate data quality and completeness
- **AI Model**: Claude 3.5 Haiku (faster, cheaper)
- **Features**:
  - Required field checking
  - Format validation (IC, phone, email)
  - Malicious data detection
  - Smart suggestions

### 3. Fraud Detection Agent
- **Purpose**: Assess application risk
- **AI Model**: Rule-based + AI hybrid
- **Risk Levels**: Low, Medium, High, Critical
- **Features**:
  - Test data detection
  - Disposable email detection
  - Data inconsistency checks
  - Employment length analysis

### 4. Enrichment Agent
- **Purpose**: Intelligently fill missing data
- **AI Model**: Claude 3.5 Haiku
- **Features**:
  - Gender inference from name
  - Position expansion
  - Business classification
  - Employment sector inference

## Setup

### 1. Get Anthropic API Key
Visit https://console.anthropic.com/ and create an API key.

### 2. Configure Environment
Add to your `.env.local` file:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Restart Server
```bash
npm run dev
```

## API Endpoints

### Agent-based Extraction
```http
POST /api/agents/extract
Content-Type: application/json

{
  "raw_text": "Name: Tan Pai Joo\nIC: 730307016344\n..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "Tan Pai Joo",
    "ic_number": "730307016344",
    "employer_name": "Bumimas Food",
    "position": "Managing Director",
    ...
  },
  "meta": {
    "extractionConfidence": 95,
    "validation": {
      "isValid": true,
      "missingFields": [],
      "suggestions": {}
    },
    "fraudCheck": {
      "riskScore": 10,
      "riskLevel": "low",
      "flags": [],
      "reasons": []
    },
    "enrichment": {
      "sources": ["position_expansion", "gender_inference"],
      "confidence": 75
    }
  }
}
```

### Agent Status Check
```http
GET /api/agents/status
```

### Legacy Extraction (Fallback)
```http
POST /api/extract
```

## Integration with Dashboard

To use the agent system in your dashboard:

```typescript
const response = await fetch('/api/agents/extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ raw_text: rawData }),
});

const result = await response.json();

// Access extracted data
const formData = result.data;

// Access validation results
const validation = result.meta.validation;

// Access fraud check
const fraudCheck = result.meta.fraudCheck;

// Show warnings if needed
if (result.meta.extractionWarnings.length > 0) {
  // Display warnings to user
}
```

## Benefits

1. **Improved Accuracy**: Claude AI better understands context and variations
2. **Intelligent Validation**: Catches issues before submission
3. **Fraud Prevention**: Early risk detection
4. **Smart Suggestions**: Helps users complete forms faster
5. **Confidence Scoring**: Know when extraction might need review

## Fallback Behavior

If `ANTHROPIC_API_KEY` is not configured:
- System uses Google Gemini AI (if `GOOGLE_API_KEY` is set)
- Falls back to regex-based parser
- Agents are disabled but system remains functional

## File Structure

```
lib/agents/
├── BaseAgent.ts           # Base agent class with Claude integration
├── ExtractionAgent.ts      # Data extraction agent
├── ValidationAgent.ts     # Data validation agent
├── FraudDetectionAgent.ts # Risk assessment agent
├── EnrichmentAgent.ts     # Data enrichment agent
├── AgentOrchestrator.ts   # Orchestration layer
├── types.ts               # Shared types
└── index.ts               # Exports

app/api/agents/
├── extract/route.ts       # Agent extraction endpoint
└── status/route.ts        # System status endpoint
```

## Testing

Test the agent system with sample data:

```bash
curl -X POST http://localhost:3000/api/agents/extract \
  -H "Content-Type: application/json" \
  -d '{
    "raw_text": "Name: Tan Pai Joo\nIC: 730307016344\nPhone: 0127806816\nCompany name: Bumimas Food\nPosition: MD"
  }'
```

## Cost Considerations

- **Extraction Agent**: Uses Claude 3.5 Sonnet (~$0.30/1M input tokens)
- **Validation/Fraud/Enrichment**: Use Claude 3.5 Haiku (~$0.80/1M input tokens)
- Typical application: ~500 tokens input → ~$0.0004 per application

## Next Steps

1. Add ANTHROPIC_API_KEY to .env.local
2. Test with real customer data
3. Customize validation rules for your requirements
4. Add webhook notifications for high-risk applications
5. Implement batch processing for multiple applications
