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
  "phone": "mobile phone number (digits only, no spaces/dashes)",
  "email": "email address",
  "address": "residential address",
  "mother_name": "mother's maiden name",
  "employer_name": "company/employer name from 'Company name:' field",
  "employer_address": "office address from 'Company address:' field",
  "position": "job position from 'Position:' field - EXPAND abbreviations: MD=Managing Director, GM=General Manager, CEO=Chief Executive Officer",
  "occupation": "occupation type from 'Occupation:' or 'Nature of business:' field",
  "office_phone": "office phone from 'Office Number:' field (digits only)",
  "work_since": "length of service from 'Length in Service:' or 'Date joined:' field",
  "emergency_name": "emergency contact name",
  "emergency_phone": "emergency contact phone (digits only)",
  "emergency_relation": "relationship to emergency contact"
}

CRITICAL FIELD MAPPINGS - Look for these specific patterns:
- "Name:" or "Applicant Information Name" → name
- "IC/Passport:" or "IC:" → ic_number
- "Contact number:" or "HP:" → phone
- "Email address:" → email
- "Residential Address:" → address
- "Company name:" → employer_name
- "Office Number :" or "Office Number:" → office_phone
- "Position:" → position (expand MD to Managing Director)
- "Date joined:" → work_since

HANDLING FORMATTING:
- Forms with empty sections: Skip empty fields, extract filled ones only
- Multiple sections: Look for the FIRST occurrence of each field with actual data
- Empty lines after colons: The field is empty, return null
- Spaces in values: Keep the actual value, don't modify

EXAMPLE INPUT/OUTPUT:
Input: "Name: Tan Pai Joo\\nCompany name:Bumimas Food\\nPosition: MD"
Output: {"name": "Tan Pai Joo", "employer_name": "Bumimas Food", "position": "Managing Director", ...}

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

    const cleaned = {
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

    console.log('[SmartExtractionAgent] Employment fields in cleaned data:', {
      employer_name: cleaned.employer_name,
      position: cleaned.position,
      office_phone: cleaned.office_phone,
    });

    return cleaned;
  }
}
