// Smart extraction using Google Gemini as AI fallback
// This handles varying formats, spacing, and structures

export class SmartExtractionAgent {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extract(rawText: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }

    console.log('[SmartExtractionAgent] Input text length:', rawText.length);
    console.log('[SmartExtractionAgent] Input preview:', rawText.substring(0, 300));

    const prompt = `You are a data extraction expert for Malaysian credit card applications.

Extract information from this text and return ONLY valid JSON.

Text to process:
${rawText}

Return this exact JSON structure (null for missing fields):
{
  "name": "applicant name",
  "ic_number": "12-digit IC number (digits only)",
  "phone": "APPLICANT'S mobile phone ONLY - from 'HP:', 'HP No:', 'Mobile:', 'Mobile No:', 'Tel:' - DO NOT extract emergency contact numbers",
  "email": "PERSONAL email address from 'Email:' field (NOT work/HR email)",
  "address": "residential address",
  "nationality": "nationality - infer 'Malaysian' if address contains Malaysian states (Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya) or Malaysian postcodes, otherwise 'Singaporean' for Singapore addresses",
  "residence_status": "residential status - MUST be one of: 'Owned', 'Rented', 'With Parents', 'Others'. Convert: 'Own' → 'Owned', 'Rent' → 'Rented'",
  "mother_name": "mother's maiden name",
  "employer_name": "company/employer name from 'Company name:' field",
  "employer_address": "office address from 'Company address:' field",
  "position": "job position from 'Position:' field - EXPAND abbreviations: MD=Managing Director, GM=General Manager, CEO=Chief Executive Officer",
  "occupation": "occupation type from 'Occupation:' or 'Nature of business:' field",
  "office_phone": "office phone from 'Office Number:' field (digits only)",
  "work_since": "length of service - extract the raw date value (e.g., 'June 2024', 'January 2023', '06/2024')",
  "work_email": "HR/Work email from 'HR Email:' or 'Work Email:' field - this is SEPARATE from personal email",
  "education_level": "education level from 'Education Level:' or 'Education:' field - (Primary Education, Secondary Education, Diploma, Degree, Masters, Doctorate, Professional Qualification)",
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

CRITICAL FIELD MAPPINGS - Look for these specific patterns:
- "Name:" or "Applicant Information Name" or "Name :" → name
- "Identical number:" or "IC/Passport:" or "IC:" → ic_number
- "Hp number :" or "HP:" or "Mobile:" → phone (applicant's phone only, NOT emergency)
- "Email:" or "Email :" (NOT "HR Email:" or "Work email address:") → email (personal email only)
- "HR Email:" or "Work Email:" or "Work email address:" → work_email
- "Residential Address:" → address
- "Current of staying" or "Current of staying (Own/Rent)" or "Residence Status:" → residence_status (normalize: Own→Owned, Rent→Rented)
- "Company name:" or "Name Employer :" or "Name Employer:" → employer_name
- "Address Employer :" or "Company address:" or "Employer Address:" → employer_address
- "Office Number :" or "Office Number:" or "Office number :" → office_phone
- "Position:" → position (expand MD to Managing Director)
- IMPORTANT: "Date joined:", "Length in Service:", "Lenght of services:", "Length of Service:", "How many year working:" → ALL map to work_since field - extract the date value
- "Emergency contact Name:" or "Emergency Name:" → emergency_name
- "No Hp :" (under Emergency section) → emergency_phone
- "Relation:" or "Relation :" → emergency_relation

HANDLING FORMATTING:
- Forms with empty sections: Skip empty fields, extract filled ones only
- Multiple sections: Look for the FIRST occurrence of each field with actual data
- Empty lines after colons: The field is empty, return null
- Spaces in values: Keep the actual value, don't modify

EXAMPLE INPUT/OUTPUT:
Input: "Name: Tan Pai Joo\\nCompany name:Bumimas Food\\nPosition: MD\\nDate joined: June 2023"
Output: {"name": "Tan Pai Joo", "employer_name": "Bumimas Food", "position": "Managing Director", "work_since": "June 2023", ...}

Input: "Company name:\\nPosition:"
Output: {"employer_name": null, "position": null, ...}

Return ONLY the JSON object, no explanation text, no markdown formatting.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const result = await response.json();
    console.log('[SmartExtractionAgent] Gemini raw response status:', response.status);
    console.log('[SmartExtractionAgent] Gemini response keys:', Object.keys(result || {}));

    const aiText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[SmartExtractionAgent] Extracted text length:', aiText.length);
    console.log('[SmartExtractionAgent] Extracted text preview:', aiText.substring(0, 500));

    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extractedData = JSON.parse(jsonMatch[0]);
      console.log('[SmartExtractionAgent] Parsed data:', JSON.stringify(extractedData, null, 2));
      const cleaned = this.cleanData(extractedData);
      console.log('[SmartExtractionAgent] Cleaned data:', JSON.stringify(cleaned, null, 2));
      return cleaned;
    }

    console.error('[SmartExtractionAgent] No JSON found in response');
    throw new Error('Failed to parse AI response');
  }

  private cleanData(data: any): any {
    const clean = (val: string | null): string | null => {
      if (!val || val === 'null' || val === '""') return null;
      const trimmed = val.toString().trim();
      return trimmed === '' ? null : trimmed;
    };

    const cleanPhone = (phone: string | null): string | null => {
      if (!phone) return null;
      return phone.replace(/[^\d]/g, '');
    };

    const normalizeResidenceStatus = (status: string | null): string | null => {
      if (!status) return null;
      const normalized = status.toString().toLowerCase().trim();
      switch (normalized) {
        case 'own':
        case 'owned':
          return 'Owned';
        case 'rent':
        case 'rented':
          return 'Rented';
        case 'with parents':
        case 'with parent':
          return 'With Parents';
        default:
          // If it's already a valid value, return it; otherwise return Others
          const validValues = ['Owned', 'Rented', 'With Parents', 'Others'];
          if (validValues.includes(status.toString())) {
            return status.toString();
          }
          return 'Others';
      }
    };

    const cleaned = {
      name: clean(data.name),
      ic_number: cleanPhone(clean(data.ic_number)),
      phone: cleanPhone(clean(data.phone)),
      email: clean(data.email),
      address: clean(data.address),
      nationality: clean(data.nationality) || 'Malaysian', // Default to Malaysian
      residence_status: normalizeResidenceStatus(clean(data.residence_status)),
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

    console.log('[SmartExtractionAgent] Employment fields in cleaned data:', {
      employer_name: cleaned.employer_name,
      position: cleaned.position,
      office_phone: cleaned.office_phone,
      work_since: cleaned.work_since,
      residence_status: cleaned.residence_status,
    });

    return cleaned;
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
        return dateString; // Future date, return original
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
}
