# Bank Muamalat Credit Card Application Dashboard

AI-powered credit card application processing dashboard with multi-agent system.

## Features

- **AI-Powered Extraction**: Extract customer data from messy text (WhatsApp, email, forms)
- **Multi-Agent System**: Claude-powered agents for extraction, validation, fraud detection, and enrichment
- **Smart Form Filling**: Auto-populate fields with extracted data
- **PDF Generation**: Generate completed credit card applications
- **Malaysian IC Support**: Parse MyKad numbers and infer DOB
- **Abbreviation Expansion**: Auto-expand common business abbreviations (MD→Managing Director, etc.)

## Multi-Agent Architecture

This project includes a sophisticated multi-agent system powered by Claude AI:

- **Extraction Agent**: Intelligently parse unstructured text
- **Validation Agent**: Verify data quality and completeness
- **Fraud Detection Agent**: Risk scoring and suspicious pattern detection
- **Enrichment Agent**: Smart field completion and suggestions

See [AGENTS.md](./AGENTS.md) for detailed documentation.

## Quick Start

1. **Install dependencies**
```bash
npm install
```

2. **Configure environment**
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your API keys:
```bash
# For multi-agent system (recommended)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Fallback options
GOOGLE_API_KEY=your-google-api-key
```

3. **Run development server**
```bash
npm run dev
```

4. **Open in browser**
[http://localhost:3000](http://localhost:3000)

## API Endpoints

### Agent-based Extraction (Recommended)
```http
POST /api/agents/extract
Content-Type: application/json

{
  "raw_text": "Name: Tan Pai Joo\nIC: 730307016344\n..."
}
```

### Agent Status
```http
GET /api/agents/status
```

### PDF Generation
```http
POST /api/generate-pdf
Content-Type: application/json

{
  "name": "Tan Pai Joo",
  "ic_number": "730307016344",
  ...
}
```

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── agents/          # Multi-agent endpoints
│   │   ├── extract/         # Legacy extraction endpoint
│   │   └── generate-pdf/    # PDF generation
│   └── page.tsx             # Dashboard UI
├── lib/
│   ├── agents/              # Multi-agent system
│   │   ├── ExtractionAgent.ts
│   │   ├── ValidationAgent.ts
│   │   ├── FraudDetectionAgent.ts
│   │   ├── EnrichmentAgent.ts
│   │   └── AgentOrchestrator.ts
│   ├── n8n.ts               # Fallback extraction
│   ├── pdf.ts               # PDF generation
│   └── types.ts             # Type definitions
└── components/               # UI components
```

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **AI**: Claude AI (Anthropic), Google Gemini (fallback)
- **TypeScript**: Full type safety
- **PDF**: PDF form filling

## Documentation

- [AGENTS.md](./AGENTS.md) - Multi-agent system documentation
- [CLAUDE.md](./CLAUDE.md) - Project instructions for Claude

## License

Private project
