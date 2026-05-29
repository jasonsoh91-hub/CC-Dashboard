import { GLMAgent } from './GLMAgent';
import { GLMModels } from './GLMBaseAgent';
import { ExtractedData, AgentOutput } from './types';

export class GLMExtractionAgent extends GLMAgent {
  constructor(apiKey: string) {
    super(apiKey, GLMModels.FLASH);
  }

  async process(input: { rawData: string; context?: Record<string, unknown> }): Promise<AgentOutput & { data: ExtractedData }> {
    const { rawData } = input;

    if (!rawData || rawData.trim().length === 0) {
      return {
        success: false,
        data: this.getEmptyData(),
        errors: ['No input data provided'],
      };
    }

    try {
      const systemPrompt = `You are an expert data extraction assistant for Malaysian credit card applications.
Your task is to extract structured customer information from unstructured text and return ONLY valid JSON.

Rules:
1. Extract ALL available fields from the text
2. Handle various formats: WhatsApp messages, emails, forms, bullet points
3. Malaysian IC numbers are exactly 12 digits
4. Phone numbers: Remove spaces, dashes, parentheses - keep only digits
5. Expand common abbreviations:
   - MD → Managing Director
   - GM → General Manager
   - CEO → Chief Executive Officer
   - VP → Vice President
6. Return null for truly missing fields (not empty strings)
7. Return ONLY JSON, no explanation, no markdown`;

      const userPrompt = this.buildExtractionPrompt(rawData);

      const response = await this.callGLM(systemPrompt, userPrompt);

      const extractedData = this.extractJson<ExtractedData>(response);
      if (extractedData) {
        return {
          success: true,
          data: this.cleanData(extractedData),
          confidence: this.calculateConfidence(extractedData),
          warnings: this.generateWarnings(extractedData),
        };
      }

      // Fallback to regex-based extraction
      return this.fallbackExtraction(rawData);
    } catch (error) {
      console.error('GLMExtractionAgent error:', error);
      return this.fallbackExtraction(rawData);
    }
  }

  private buildExtractionPrompt(rawData: string): string {
    return `Extract customer information from this text and return ONLY valid JSON:

${rawData}

Return this exact JSON structure:
{
  "name": "full name from 'Name:', 'Applicant Name', etc.",
  "ic_number": "12-digit Malaysian IC number",
  "phone": "mobile phone from 'Contact number:', 'HP:', 'Mobile:' - digits only",
  "email": "email address",
  "address": "residential address from 'Residential Address:', 'Address:'",
  "mother_name": "mother's maiden name",
  "employer_name": "company name from 'Company name:', 'Employer:'",
  "employer_address": "office address",
  "position": "job position from 'Position:' - expand abbreviations (MD=Managing Director, GM=General Manager)",
  "occupation": "occupation type (Business, Engineer, Doctor, etc.)",
  "office_phone": "office phone from 'Office Number:', 'Office:' - digits only",
  "work_since": "length of service from 'Length in Service:', 'Since:', 'Date joined:'",
  "work_email": "work email if available",
  "emergency_name": "emergency contact name",
  "emergency_phone": "emergency contact phone - digits only",
  "emergency_relation": "relationship to emergency contact"
}

CRITICAL mappings for Malaysian forms:
- "IC/Passport: XXX" → ic_number
- "Contact number: XXX" → phone
- "Company name: XXX" → employer_name
- "Position: MD" → position = "Managing Director"
- "Office Number : XXX" → office_phone
- "Nature of business" is NOT occupation - it describes the business type
- Return null (not empty string) for missing fields`;
  }

  private cleanData(data: ExtractedData): ExtractedData {
    const clean = (val: string | null): string | null => {
      if (val === null || val === undefined || val === '') return null;
      const trimmed = val.trim();
      return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
    };

    const cleanPhone = (phone: string | null): string | null => {
      if (!phone) return null;
      return phone.replace(/[^\d]/g, '');
    };

    return {
      name: clean(data.name),
      ic_number: cleanPhone(clean(data.ic_number)),
      phone: cleanPhone(clean(data.phone)),
      email: clean(data.email),
      address: clean(data.address),
      mother_name: clean(data.mother_name),
      employer_name: clean(data.employer_name),
      employer_address: clean(data.employer_address),
      position: clean(data.position),
      occupation: clean(data.occupation),
      office_phone: cleanPhone(clean(data.office_phone)),
      work_since: clean(data.work_since),
      work_email: clean(data.work_email),
      emergency_name: clean(data.emergency_name),
      emergency_phone: cleanPhone(clean(data.emergency_phone)),
      emergency_relation: clean(data.emergency_relation),
    };
  }

  private calculateConfidence(data: ExtractedData): number {
    let score = 0;
    const weights = {
      name: 25,
      ic_number: 30,
      phone: 10,
      email: 10,
      employer_name: 10,
      position: 5,
      address: 5,
      office_phone: 5,
    };

    for (const [field, weight] of Object.entries(weights)) {
      if (data[field as keyof ExtractedData]) {
        score += weight;
      }
    }

    return Math.min(100, score);
  }

  private generateWarnings(data: ExtractedData): string[] {
    const warnings: string[] = [];

    if (!data.name) warnings.push('Applicant name not found');
    if (!data.ic_number) warnings.push('IC number not found');
    else if (data.ic_number.length !== 12) warnings.push('IC number may be invalid (not 12 digits)');
    if (!data.phone) warnings.push('Phone number not found');
    if (!data.email) warnings.push('Email not found');
    if (!data.employer_name) warnings.push('Employer name not found');
    if (!data.position) warnings.push('Position not found');

    return warnings;
  }

  private fallbackExtraction(rawData: string): AgentOutput & { data: ExtractedData } {
    // Use built-in parser as fallback
    const data = this.builtInParser(rawData);

    return {
      success: true,
      data,
      confidence: 50,
      warnings: ['Used fallback extraction - some fields may be incomplete'],
    };
  }

  private builtInParser(rawText: string): ExtractedData {
    const data: ExtractedData = {
      name: null,
      ic_number: null,
      phone: null,
      email: null,
      address: null,
      mother_name: null,
      employer_name: null,
      employer_address: null,
      position: null,
      occupation: null,
      office_phone: null,
      work_since: null,
      work_email: null,
      emergency_name: null,
      emergency_phone: null,
      emergency_relation: null,
    };

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Name
      if (/^name\s*[:=]/i.test(line) && !data.name) {
        data.name = this.extractAfterColon(line);
      }

      // IC number
      const digits = line.replace(/\D/g, '').match(/\d{12}/);
      if (digits && !data.ic_number) {
        data.ic_number = digits[0];
      }

      // Phone numbers
      if (/contact\s*number|hp\s*number/i.test(lowerLine) && !data.phone) {
        data.phone = this.extractPhone(line);
      }

      // Office phone
      if (/office\s*number|office\s*[:=]/i.test(lowerLine) && !data.office_phone) {
        data.office_phone = this.extractPhone(line);
      }

      // Email
      const emailMatch = line.match(/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
      if (emailMatch && !data.email) {
        data.email = emailMatch[1];
      }

      // Address
      if (/address\s*[:=]/i.test(lowerLine) && !data.address) {
        data.address = this.extractAfterColon(line);
      }

      // Company name
      if (/company\s*name/i.test(lowerLine) && !data.employer_name) {
        data.employer_name = this.extractAfterColon(line);
      }

      // Position
      if (/position\s*[:=]/i.test(lowerLine) && !data.position) {
        data.position = this.expandAbbreviations(this.extractAfterColon(line));
      }

      // Date joined / work since
      if (/date\s*joined|work\s*since|length/i.test(lowerLine) && !data.work_since) {
        data.work_since = this.extractAfterColon(line);
      }
    }

    // Clean phone numbers
    if (data.phone) data.phone = data.phone.replace(/[^\d]/g, '');
    if (data.office_phone) data.office_phone = data.office_phone.replace(/[^\d]/g, '');

    return data;
  }

  private extractAfterColon(line: string): string {
    const colonMatch = line.match(/:\s*(.+)/);
    if (colonMatch) {
      return colonMatch[1].trim();
    }
    return '';
  }

  private extractPhone(line: string): string {
    const match = line.match(/(0\d{1,2}[-\s]?\d{7,8})/);
    return match ? match[1] : '';
  }

  private expandAbbreviations(text: string): string {
    if (!text) return text;
    const abbreviations: Record<string, string> = {
      'MD': 'Managing Director',
      'GM': 'General Manager',
      'CEO': 'Chief Executive Officer',
      'VP': 'Vice President',
    };
    for (const [abbr, full] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbr}\\.?\\b`, 'gi');
      text = text.replace(regex, full);
    }
    return text;
  }

  private getEmptyData(): ExtractedData {
    return {
      name: null,
      ic_number: null,
      phone: null,
      email: null,
      address: null,
      mother_name: null,
      employer_name: null,
      employer_address: null,
      position: null,
      occupation: null,
      office_phone: null,
      work_since: null,
      work_email: null,
      emergency_name: null,
      emergency_phone: null,
      emergency_relation: null,
    };
  }
}
