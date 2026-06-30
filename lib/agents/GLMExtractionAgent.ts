import { GLMAgent } from './GLMAgent';
import { GLMModels } from './GLMBaseAgent';
import { ExtractedData, AgentOutput } from './types';

export class GLMExtractionAgent extends GLMAgent {
  constructor(apiKey: string) {
    super(apiKey, GLMModels.FLASH);
  }

  async process(input: { rawData: string; context?: Record<string, unknown> }): Promise<AgentOutput & { data: ExtractedData }> {
    const { rawData: originalRaw } = input;

    if (!originalRaw || originalRaw.trim().length === 0) {
      return {
        success: false,
        data: this.getEmptyData(),
        errors: ['No input data provided'],
      };
    }

    // Strip leading list-numbering (e.g. "1. ", "2) ", "3 - ") from each line
    // so field labels like "Name:" are recognized regardless of bullet style.
    const rawData = this.stripLineNumbering(originalRaw);

    try {
      const systemPrompt = `You are an expert data extraction assistant for Malaysian credit card applications.
Your task is to extract structured customer information from unstructured text and return ONLY valid JSON.

Rules:
1. Extract ALL available fields from the text
2. Handle various formats: WhatsApp messages, emails, forms, bullet points, numbered lists
3. IGNORE leading list numbering on any line ("1.", "2)", "3 -", "4:", etc.) — it is NOT part of the field value. Treat "1. Name: John" identically to "Name: John".
4. IC numbers may be formatted with dashes (e.g., "000823-01-0243") — strip dashes; output exactly 12 digits.
5. Phone numbers: Remove spaces, dashes, parentheses. Strip leading country code "+60" (Malaysia) and replace with "0" (e.g. "+60197703878" → "0197703878"). Strip "+65" (Singapore) entirely (e.g. "+65 6206 1070" → "62061070"). Keep only digits.
6. Expand common abbreviations:
   - MD → Managing Director
   - GM → General Manager
   - CEO → Chief Executive Officer
   - VP → Vice President
7. Return null for truly missing fields (not empty strings)
8. Return ONLY JSON, no explanation, no markdown
9. Common label aliases — map equally:
   - "Comp address" / "Company address" / "Address Employer" / "Employer address" → employer_address
   - "Lenght of services" / "Length in Service" / "Date joined" / "How many year working" → work_since
   - "Nature business" / "Nature of business" → business_classification (NOT occupation)
   - "Residental address" / "Residential Address" → address
   - "Residental status" / "Residence Status" → residence_status
   - "Contact number" under emergency block → emergency_phone (not phone)
   - "Valid HR email" / "HR Email" / "Work Email" → work_email
   - "Mother full name" → mother_name`;

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

  private stripLineNumbering(text: string): string {
    return text
      .split('\n')
      .map(line => line.replace(/^\s*\d+\s*[.)\-:]\s+/, ''))
      .join('\n');
  }

  private buildExtractionPrompt(rawData: string): string {
    return `Extract customer information from this text and return ONLY valid JSON:

${rawData}

Return this exact JSON structure:
{
  "name": "full name from 'Name:', 'Applicant Name', etc.",
  "ic_number": "12-digit Malaysian IC number",
  "phone": "APPLICANT'S mobile phone ONLY - from 'HP:', 'HP No:', 'Mobile:', 'Mobile No:', 'Tel:' - DO NOT extract emergency contact numbers",
  "email": "PERSONAL email from 'Email:' (NOT work/HR email) - prioritize gmail, outlook, hotmail, yahoo over corporate emails",
  "address": "residential address from 'Residential Address:', 'Address:'",
  "nationality": "nationality - infer 'Malaysian' if address contains Malaysian states (Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya) or Malaysian postcodes, otherwise 'Singaporean' for Singapore addresses, etc.",
  "mother_name": "mother's maiden name",
  "employer_name": "company name from 'Company name:', 'Employer:'",
  "employer_address": "office address",
  "position": "job position from 'Position:' - expand abbreviations (MD=Managing Director, GM=General Manager)",
  "occupation": "occupation type (Business, Engineer, Doctor, etc.)",
  "office_phone": "office phone from 'Office Number:', 'Office:', 'Office Tel:' - digits only",
  "work_since": "length of service from 'Length in Service:', 'Since:', 'Date joined:' - EXTRACT the raw date value (e.g., 'June 2024', 'January 2023'). The system will automatically convert this to years/months format.",
  "work_email": "work/HR email from 'HR Email:', 'Work Email:' - this is SEPARATE from personal email",
  "education_level": "education level from 'Education Level:', 'Education:' - (Primary Education, Secondary Education, Diploma, Degree, Masters, Doctorate, Professional Qualification)",
  "emergency_name": "emergency contact name - from 'Emergency Name:', 'Emergency Contact Name:'",
  "emergency_phone": "emergency contact phone - from 'Emergency Contact:', 'Emergency Contact No:', 'Emergency Tel:' ONLY - DO NOT use applicant's HP number",
  "emergency_relation": "relationship to emergency contact"
}

CRITICAL PHONE NUMBER EXTRACTION RULES:
1. APPLICANT'S PHONE (phone field): ONLY extract from 'HP:', 'HP No:', 'Mobile:', 'Mobile No:', 'Tel:', 'Telephone:'
2. EMERGENCY PHONE (emergency_phone field): ONLY extract from 'Emergency Contact:', 'Emergency Contact No:', 'Emergency Tel:', 'Emergency Contact HP:'
3. If a phone number is under an "Emergency" section, it goes to emergency_phone, NOT phone
4. OFFICE PHONE (office_phone field): ONLY extract from 'Office:', 'Office No:', 'Office Tel:', 'Office Number:'
5. If no clear HP/Mobile number is found, leave phone field as null - DO NOT guess or use emergency contact

CRITICAL mappings for Malaysian forms:
- "IC/Passport: XXX" or "Identical number: XXX" → ic_number
- "Company name: XXX" or "Name Employer: XXX" → employer_name
- "Address Employer: XXX" or "Company address: XXX" → employer_address
- "Position: MD" → position = "Managing Director"
- "Office Number : XXX" or "Office number: XXX" → office_phone
- "Nature of business" is NOT occupation - it describes the business type
- For Malaysian addresses containing states like "Sarawak", "Selangor", etc. → nationality = "Malaysian"
- For Singapore addresses (6-digit postcode like 123456) → nationality = "Singaporean"
- EMAIL RULES: "Email: xxx" → personal email, "HR Email: xxx" or "Work email address:" → work_email ONLY
- If multiple emails exist, use the one from "Email:" or "Personal Email:" for 'email' field
- EMERGENCY: "Emergency contact Name:" → emergency_name, "No Hp:" under emergency section → emergency_phone
- "How many year working:" → work_since (extract the raw date value)
- Return null (not empty string) for missing fields`;
  }

  private cleanData(data: ExtractedData): ExtractedData {
    const clean = (val: string | null | undefined): string | null => {
      if (val === null || val === undefined || val === '') return null;
      const trimmed = val.trim();
      return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
    };

    const cleanPhone = (phone: string | null | undefined): string | null => {
      if (!phone) return null;
      return phone.replace(/[^\d]/g, '');
    };

    // Infer nationality from address if not provided
    let nationality = clean(data.nationality);
    if (!nationality && data.address) {
      nationality = this.inferNationality(data.address);
    }

    return {
      name: clean(data.name),
      ic_number: cleanPhone(clean(data.ic_number)),
      phone: cleanPhone(clean(data.phone)),
      email: clean(data.email),
      address: clean(data.address),
      nationality: nationality || 'Malaysian', // Default to Malaysian
      mother_name: clean(data.mother_name),
      employer_name: clean(data.employer_name),
      employer_address: clean(data.employer_address),
      position: clean(data.position),
      occupation: clean(data.occupation),
      office_phone: cleanPhone(clean(data.office_phone)),
      work_since: this.formatWorkSince(clean(data.work_since)),
      work_email: clean(data.work_email),
      education_level: clean(data.education_level),
      emergency_name: clean(data.emergency_name),
      emergency_phone: cleanPhone(clean(data.emergency_phone)),
      emergency_relation: clean(data.emergency_relation),
    };
  }

  private inferNationality(address: string): string | null {
    if (!address) return null;

    const lowerAddress = address.toLowerCase();

    // Malaysian states/territories
    const malaysianStates = [
      'johor', 'kedah', 'kelantan', 'melaka', 'negeri sembilan',
      'pahang', 'perak', 'perlis', 'pulau pinang', 'penang',
      'sabah', 'sarawak', 'selangor', 'terengganu',
      'kuala lumpur', 'labuan', 'putrajaya'
    ];

    // Malaysian postcode patterns (5-digit)
    const malaysianPostcode = /\b\d{5}\b/;

    // Singapore (6-digit postcode)
    const singaporePostcode = /\b\d{6}\b/;

    // Check for Singapore
    if (singaporePostcode.test(address) || lowerAddress.includes('singapore')) {
      return 'Singaporean';
    }

    // Check for Malaysian states
    for (const state of malaysianStates) {
      if (lowerAddress.includes(state)) {
        return 'Malaysian';
      }
    }

    // Check for Malaysian postcode (5 digits)
    if (malaysianPostcode.test(address)) {
      return 'Malaysian';
    }

    return null;
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

  private formatWorkSince(value: string | null): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    // Check if already in years/months format
    if (/(\d+)\s*(year|month|years|months)/i.test(trimmed)) {
      return trimmed;
    }

    // Try to parse as date and calculate duration
    const duration = this.calculateDuration(trimmed);
    if (duration) {
      return duration;
    }

    // Return original if can't parse
    return trimmed;
  }

  private calculateDuration(dateString: string): string | null {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Try to parse various date formats
    // Format: "June 2024", "Jan 2023", "01/2023", "2023-06", "1/8/2023" (DD/MM/YYYY), etc.
    let joinedYear: number | null = null;
    let joinedMonth: number | null = null;

    // Match "Month Year" format (e.g., "June 2024")
    const monthYearMatch = dateString.match(/^([A-Za-z]+)\s+(\d{4})$/i);
    if (monthYearMatch) {
      const monthNames: Record<string, number> = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
        nov: 11, november: 11, dec: 12, december: 12
      };
      joinedMonth = monthNames[monthYearMatch[1].toLowerCase()];
      joinedYear = parseInt(monthYearMatch[2]);
    }

    // Match "DD/MM/YYYY" format (Malaysian format: day/month/year)
    const ddmmyyyyMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1]);
      joinedMonth = parseInt(ddmmyyyyMatch[2]);
      joinedYear = parseInt(ddmmyyyyMatch[3]);
      // Only accept if day is valid (1-31)
      if (day < 1 || day > 31) {
        joinedMonth = null;
        joinedYear = null;
      }
    }

    // Match "MM/YYYY" format (only if not already matched as DD/MM/YYYY)
    const slashMatch = dateString.match(/^(\d{1,2})\/(\d{4})$/);
    if (slashMatch && !ddmmyyyyMatch) {
      joinedMonth = parseInt(slashMatch[1]);
      joinedYear = parseInt(slashMatch[2]);
    }

    // Match "YYYY-MM" format
    const dashMatch = dateString.match(/^(\d{4})-(\d{1,2})$/);
    if (dashMatch) {
      joinedYear = parseInt(dashMatch[1]);
      joinedMonth = parseInt(dashMatch[2]);
    }

    // Match just year (e.g., "2024")
    const yearMatch = dateString.match(/^(\d{4})$/);
    if (yearMatch) {
      joinedYear = parseInt(yearMatch[1]);
      joinedMonth = 1; // Assume January if only year is provided
    }

    if (joinedYear && joinedMonth) {
      const totalMonthsJoined = joinedYear * 12 + joinedMonth;
      const totalMonthsCurrent = currentYear * 12 + currentMonth;
      const monthsDiff = totalMonthsCurrent - totalMonthsJoined;

      if (monthsDiff < 0) {
        // Future date, return original
        return dateString;
      }

      const years = Math.floor(monthsDiff / 12);
      const months = monthsDiff % 12;

      if (years > 0 && months > 0) {
        return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
      } else if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''}`;
      } else if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''}`;
      }
    }

    return null;
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
      nationality: null,
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

    const lines = rawText
      .split('\n')
      .map(l => l.trim().replace(/^\d+\s*[.)\-:]\s+/, ''))
      .filter(l => l);

    let currentSection: 'emergency' | 'employer' | null = null;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Section detection (latches until another section starts)
      if (/emergency/i.test(lowerLine)) {
        currentSection = 'emergency';
      } else if (/^(company|employer|comp\s*address|nature\s*business|position|office)/i.test(lowerLine)) {
        currentSection = 'employer';
      } else if (/^(name|ic|residen|mother|education|email|hp|mobile)/i.test(lowerLine)) {
        currentSection = null;
      }

      // Name
      if (/^name\s*[:=]/i.test(line) && !data.name) {
        data.name = this.extractAfterColon(line);
      }

      // IC number
      const digits = line.replace(/\D/g, '').match(/\d{12}/);
      if (digits && !data.ic_number) {
        data.ic_number = digits[0];
      }

      // Phone numbers - ONLY from HP/Mobile/Tel fields, NOT emergency
      if ((/^hp\s*[:=]|mobile\s*[:=]|tel\s*[:=]|telephone\s*[:=]/i.test(line) ||
          (/hp\s*no|mobile\s*no|tel\s*no/i.test(lowerLine) && !/emergency/i.test(lowerLine))) &&
          currentSection !== 'emergency' && !data.phone) {
        data.phone = this.extractPhone(line);
      }

      // Emergency contact phone — explicit emergency label OR inside emergency section
      const isContactLine = /contact\s*(number|no|phone|hp|tel)|^hp\s*[:=]|^tel\s*[:=]|^phone\s*[:=]/i.test(lowerLine);
      if (!data.emergency_phone && isContactLine && currentSection === 'emergency') {
        data.emergency_phone = this.extractPhone(line);
      }

      // Emergency name
      if (/emergency\s*(full\s*)?name|emergency\s*contact\s*name/i.test(lowerLine) && !data.emergency_name) {
        data.emergency_name = this.extractAfterColon(line);
      }

      // Emergency relation — explicit OR bare "Relation:" inside emergency section
      if (!data.emergency_relation &&
          (/emergency\s*relation/i.test(lowerLine) ||
           (/^relation(ship)?\s*[:=]/i.test(lowerLine) && currentSection === 'emergency'))) {
        data.emergency_relation = this.extractAfterColon(line);
      }

      // Office phone
      if (/office\s*number|office\s*[:=]|office\s*tel/i.test(lowerLine) && !data.office_phone) {
        data.office_phone = this.extractPhone(line);
      }

      // Personal email (from "Email:" label, NOT work/HR email)
      if (/^email\s*[:=]/i.test(line) && !data.email) {
        const emailMatch = line.match(/:\s*([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
        if (emailMatch) data.email = emailMatch[1];
      }

      // Fallback email extraction if no "Email:" label found
      // Only use if not already set and not a work/HR email line
      const emailMatch = line.match(/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
      if (emailMatch && !data.email && !/work\s*email|hr\s*email|office\s*email/i.test(lowerLine)) {
        data.email = emailMatch[1];
      }

      // Address
      if (/address\s*[:=]/i.test(lowerLine) && !data.address) {
        data.address = this.extractAfterColon(line);
      }

      // Company name
      if (/company\s*name|name\s*employer/i.test(lowerLine) && !data.employer_name) {
        data.employer_name = this.extractAfterColon(line);
      }

      // Employer/Company address
      if (/comp\s*address|company\s*address|employer\s*address|address\s*employer/i.test(lowerLine) && !data.employer_address) {
        data.employer_address = this.extractAfterColon(line);
      }

      // Mother name
      if (/mother\s*full?\s*name/i.test(lowerLine) && !data.mother_name) {
        data.mother_name = this.extractAfterColon(line);
      }

      // Position
      if (/position\s*[:=]/i.test(lowerLine) && !data.position) {
        data.position = this.expandAbbreviations(this.extractAfterColon(line));
      }

      // Date joined / work since
      if (/date\s*joined|work\s*since|length|lenght/i.test(lowerLine) && !data.work_since) {
        data.work_since = this.extractAfterColon(line);
      }

      // Work email / HR email
      if (/work\s*email|hr\s*email/i.test(lowerLine) && !data.work_email) {
        const emailMatch = line.match(/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
        if (emailMatch) data.work_email = emailMatch[1];
      }

      // Education level
      if (/education\s*level|education/i.test(lowerLine) && !data.education_level) {
        data.education_level = this.extractAfterColon(line);
      }
    }

    // Infer nationality from address
    if (data.address) {
      data.nationality = this.inferNationality(data.address);
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
    // Malaysian +60 -> 0XXX, Singapore +65 -> strip, plain 0XXXXXXXX, or any 7-12 run of digits
    const intlMy = line.match(/\+60[-\s]?(\d[\d\s-]{6,12}\d)/);
    if (intlMy) return ('0' + intlMy[1]).replace(/[^\d]/g, '');

    const intlSg = line.match(/\+65[-\s]?(\d[\d\s-]{6,12}\d)/);
    if (intlSg) return intlSg[1].replace(/[^\d]/g, '');

    const local = line.match(/(0\d{1,2}[-\s]?\d{6,9})/);
    if (local) return local[1].replace(/[^\d]/g, '');

    // Last resort: any contiguous run of 7-12 digits (after colon)
    const colonIdx = line.indexOf(':');
    const tail = colonIdx >= 0 ? line.slice(colonIdx + 1) : line;
    const generic = tail.replace(/[^\d]/g, '').match(/\d{7,12}/);
    return generic ? generic[0] : '';
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
      nationality: null,
      mother_name: null,
      employer_name: null,
      employer_address: null,
      position: null,
      occupation: null,
      office_phone: null,
      work_since: null,
      work_email: null,
      education_level: null,
      emergency_name: null,
      emergency_phone: null,
      emergency_relation: null,
    };
  }
}
