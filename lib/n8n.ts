import { N8nResponse, N8nResponseSchema, ExtractedData } from './types';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

// Extract data using Google Gemini AI
async function extractDataWithAI(rawText: string): Promise<ExtractedData | null> {
  if (!GOOGLE_API_KEY) {
    console.log('GOOGLE_API_KEY not configured');
    return null;
  }

  try {
    const prompt = `You are a data extraction assistant for credit card applications. Extract customer information from the text below and return ONLY valid JSON.

Customer Data:
${rawText}

Return this exact JSON structure:
{
  "name": "full name from 'Name:' or 'Applicant Information Name'",
  "ic_number": "12-digit IC number from 'IC/Passport:'",
  "phone": "mobile phone from 'Contact number:' - remove spaces",
  "email": "email from 'Email address:'",
  "address": "residential address from 'Residential Address:'",
  "mother_name": "mother's maiden name (null if not found)",
  "employer_name": "company name from 'Company name:' (look for value after colon)",
  "employer_address": "office address from 'Company address:'",
  "position": "position from 'Position:' - expand MD=Managing Director, GM=General Manager, CEO=Chief Executive Officer",
  "occupation": "occupation type (e.g., Business, Engineer, Doctor) - NOT 'Nature of business'",
  "office_phone": "office phone from 'Office Number:' - remove spaces",
  "work_since": "length of service from 'Length in Service:' or 'work since'",
  "emergency_name": "emergency contact name (null if not found)",
  "emergency_phone": "emergency phone (null if not found)",
  "emergency_relation": "relationship to emergency contact (null if not found)"
}

CRITICAL Rules:
- For "Company name:Bumimas Food" → employer_name = "Bumimas Food"
- For "Position: MD" → position = "Managing Director"
- For "Contact number:012 7806816" → phone = "0127806816"
- For "Office Number : 07 9435866" → office_phone = "079435866"
- "Occupation Business" means occupation is "Business"
- "Nature of business: Frozen food" describes the business type, NOT the occupation
- Return null (not empty string) for truly missing fields
- Return ONLY JSON, no explanation, no markdown formatting`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      console.error('Google API error:', response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const aiText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from AI response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extractedData = JSON.parse(jsonMatch[0]);

      // Map and validate the response
      return {
        name: extractedData.name || null,
        ic_number: extractedData.ic_number || null,
        phone: extractedData.phone || null,
        email: extractedData.email || null,
        address: extractedData.address || null,
        mother_name: extractedData.mother_name || null,
        employer_name: extractedData.employer_name || null,
        employer_address: extractedData.employer_address || null,
        position: extractedData.position || null,
        occupation: extractedData.occupation || null,
        office_phone: extractedData.office_phone || null,
        work_since: extractedData.work_since || null,
        emergency_name: extractedData.emergency_name || null,
        emergency_phone: extractedData.emergency_phone || null,
        emergency_relation: extractedData.emergency_relation || null,
      };
    }

    return null;
  } catch (error) {
    console.error('Error calling Google AI:', error);
    return null;
  }
}

export async function extractDataFromN8n(rawText: string): Promise<ExtractedData | null> {
  // Try Google AI first if configured
  if (GOOGLE_API_KEY) {
    console.log('Using Google Gemini AI for extraction');
    const aiResult = await extractDataWithAI(rawText);
    if (aiResult && (aiResult.name || aiResult.email || aiResult.phone)) {
      return aiResult;
    }
    console.log('AI extraction incomplete, falling back to parser');
  }

  // Try n8n webhook if configured
  if (N8N_WEBHOOK_URL) {
    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw_text: rawText }),
      });

      if (response.ok) {
        const rawData: unknown = await response.json();
        const validatedData = N8nResponseSchema.parse(rawData);
        if (validatedData.data) {
          return validatedData.data;
        }
      }
    } catch (error) {
      console.error('Error calling n8n, using fallback parser:', error);
    }
  } else {
    console.log('N8N_WEBHOOK_URL not configured, using built-in parser');
  }

  // Fallback: use built-in parser
  return parseCustomerData(rawText);
}

// Built-in parser for credit card application data
function parseCustomerData(rawText: string): ExtractedData {
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

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
  let inEmergencySection = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Skip empty lines
    if (!line) continue;

    // Handle emergency contact name on same line as section marker (before section detection)
    if (/emergency\s*contact\s*name|emergency\s*name/i.test(lowerLine)) {
      data.emergency_name = extractAfterColon(line);
      inEmergencySection = true; // Still mark that we're in emergency section
      continue;
    }

    // Detect emergency section
    if (/^emergency\s*(contact)?/i.test(lowerLine)) {
      inEmergencySection = true;
      continue;
    }

    // ===== NAME =====
    // Match "Name : xxx" at the start of line, but NOT in emergency section or mother
    if (/^name\s*[:=]/i.test(line) && !inEmergencySection && !/mother/i.test(lowerLine)) {
      if (!data.name) {
        data.name = extractAfterColon(line);
      }
    }

    // ===== IC NUMBER =====
    // Look for 12-digit number (with or without dashes)
    const digits = line.replace(/\D/g, '').match(/\d{12}/);
    if (digits) {
      data.ic_number = digits[0];
    }

    // ===== PHONE NUMBERS =====
    // HP number / Contact number (mobile) - not in emergency section
    if ((/^hp\s*[:=]/i.test(line) || /hp\s*number|contact\s*number/i.test(lowerLine)) && !inEmergencySection) {
      data.phone = extractPhone(line);
    }
    // Office number
    if (/office\s*[:=]/i.test(line) || /office\s*number|office\s*no/i.test(lowerLine)) {
      data.office_phone = extractPhone(line);
    }
    // Generic phone that's not hp or office
    if (/^phone\s*[:=]/i.test(line) && !data.phone && !inEmergencySection) {
      data.phone = extractPhone(line);
    }

    // ===== EMAIL =====
    // Only extract email if the line is actually about email
    if (/email\s*[:=]/i.test(line) || /email\s*address/i.test(lowerLine)) {
      const emailMatch = line.match(/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
      if (emailMatch) {
        // Decide if it's work email or personal email based on context
        if (/work|office/i.test(lowerLine)) {
          data.work_email = emailMatch[1];
        } else {
          data.email = emailMatch[1];
        }
      }
    }

    // ===== ADDRESS =====
    // Matches: "Residential Address:", "Mailing Address:", etc.
    // Only capture if there's content after the colon (don't overwrite with empty values)
    if (/(?:residential\s+|mailing\s+|residential\s+|mailing\s+)?address\s*[:=]\s*\S/i.test(line) && !/employer|office|company|email/i.test(lowerLine)) {
      data.address = extractAfterColon(line);
    }

    // ===== MOTHER'S NAME =====
    if (/^mother\s*[:=]/i.test(line) || /mother\s*name/i.test(lowerLine)) {
      data.mother_name = extractAfterColon(line);
    }

    // ===== EMPLOYER / COMPANY NAME =====
    // Matches: "Employer Name:", "Company Name:", "Name of Company:", "Name Employer:", "Employer:", "Company:", etc.
    if (/employer\s+name|company\s+name|name\s+of\s+(?:company|employer)|^employer\s*[:=]|^company\s*[:=]|name\s+employer/i.test(line)) {
      data.employer_name = extractAfterColon(line);
    }

    // ===== EMPLOYER ADDRESS =====
    // Matches: "Employer Address:", "Company address:", "Office Address:", "Address Employer:", etc.
    if (/employer\s*address|company\s*address|office\s*address|address\s*employer/i.test(lowerLine)) {
      data.employer_address = extractAfterColon(line);
    }

    // ===== POSITION =====
    if (/position\s*[:=]/i.test(line)) {
      data.position = extractAfterColon(line);
    }

    // ===== OCCUPATION =====
    // Matches: "Occupation:", "Occupation Business", "Nature of business:", etc.
    if (/^occupation\s*[:\s]/i.test(lowerLine) || /nature\s+of\s+business/i.test(lowerLine)) {
      const value = extractAfterColon(line);
      // If line contains "Occupation Business", extract the business part
      if (/occupation\s+business/i.test(lowerLine)) {
        data.occupation = value || 'Business';
      } else {
        data.occupation = value;
      }
    }

    // ===== WORK SINCE / LENGTH OF SERVICE =====
    if (/how\s*many\s*year|work\s*since|length\s*of|year\s*working|working\s*since/i.test(lowerLine)) {
      data.work_since = extractAfterColon(line);
    }

    // ===== EMERGENCY CONTACT =====
    if (inEmergencySection) {
      // Emergency name
      if (/^name\s*[:=]/i.test(line)) {
        data.emergency_name = extractAfterColon(line);
      }
      // Emergency phone
      if (/no\s*hp|hp\s*[:=]|phone|telefon/i.test(lowerLine)) {
        data.emergency_phone = extractPhone(line);
      }
      // Emergency relation
      if (/relation|hubungan/i.test(lowerLine)) {
        data.emergency_relation = extractAfterColon(line);
      }
      // Emergency address
      if (/address/i.test(lowerLine)) {
        // Skip for now
      }
    }

    // Handle "Emergency contact Name:" on same line (outside of section)
    if (/emergency\s*contact\s*name|emergency\s*name/i.test(lowerLine)) {
      data.emergency_name = extractAfterColon(line);
    }
  }

  // Second pass: If name still not found, get from first meaningful line
  if (!data.name && lines.length > 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      // Line with letters and spaces, at least 2 words, not an email, reasonable length
      if (/^[A-Za-z\s\.]+$/.test(trimmed) && trimmed.split(/\s+/).length >= 2 && trimmed.length >= 5 && trimmed.length <= 50 && !trimmed.includes('@')) {
        // Make sure it's not a label line
        if (!/^name|email|phone|address|mother|employer|position|office|emergency|hp|ic|identical/i.test(trimmed.toLowerCase())) {
          data.name = trimmed;
          break;
        }
      }
    }
  }

  // Clean up phone numbers
  if (data.phone) data.phone = data.phone.replace(/[^\d]/g, '');
  if (data.office_phone) data.office_phone = data.office_phone.replace(/[^\d]/g, '');
  if (data.emergency_phone) data.emergency_phone = data.emergency_phone.replace(/[^\d]/g, '');

  // Expand abbreviations for position and occupation
  if (data.position) data.position = expandAbbreviations(data.position);
  if (data.occupation) data.occupation = expandAbbreviations(data.occupation);

  // Infer nationality from address
  if (data.address) {
    data.nationality = inferNationality(data.address);
  }

  // Convert work_since from date to years/months format
  if (data.work_since) {
    data.work_since = formatWorkSince(data.work_since);
  }

  return data;
}

// Expand common abbreviations for position, occupation, and titles
function expandAbbreviations(text: string): string {
  if (!text) return text;

  // Common abbreviations map (ordered by specificity - longer matches first)
  const abbreviations: Record<string, string> = {
    // C-Level executives
    'CEO': 'Chief Executive Officer',
    'CFO': 'Chief Financial Officer',
    'COO': 'Chief Operating Officer',
    'CTO': 'Chief Technology Officer',
    'CMO': 'Chief Marketing Officer',
    'CIO': 'Chief Information Officer',
    'CSO': 'Chief Security Officer',
    'CLO': 'Chief Legal Officer',
    'CHRO': 'Chief Human Resources Officer',
    'CXO': 'Chief Executive Officer',

    // VP levels
    'EVP': 'Executive Vice President',
    'SVP': 'Senior Vice President',
    'AVP': 'Assistant Vice President',
    'VP': 'Vice President',

    // Management levels
    'MD': 'Managing Director',
    'GM': 'General Manager',
    'DGM': 'Deputy General Manager',
    'AGM': 'Assistant General Manager',
    'HOD': 'Head of Department',
    'MGR': 'Manager',
    'MNGR': 'Manager',

    // Common ranks
    'SR': 'Senior',
    'JR': 'Junior',
    'ASST': 'Assistant',
    'ASSOC': 'Associate',
    'EXEC': 'Executive',
    'DIR': 'Director',
    'DEPT': 'Department',

    // Departments/Functions
    'HR': 'Human Resources',
    'IT': 'Information Technology',
    'PR': 'Public Relations',
    'R&D': 'Research and Development',
    'MKTG': 'Marketing',
    'SALES': 'Sales',
    'ADMIN': 'Administration',
    'OPS': 'Operations',
    'FIN': 'Finance',
    'ACCT': 'Accounting',
    'ENG': 'Engineer',
    'DEV': 'Developer',
    'QA': 'Quality Assurance',

    // Professional titles
    'DR': 'Doctor',
    'PROF': 'Professor',
    'REV': 'Reverend',
    'HON': 'Honorable',

    // Business terms
    'BHD': 'Berhad',
    'SDN': 'Sendirian',
    'PLC': 'Public Limited Company',
    'LTD': 'Limited',
    'INC': 'Incorporated',
    'CORP': 'Corporation',
    'CO': 'Company',
  };

  let result = text;

  // Sort abbreviations by length (longest first) to avoid partial replacements
  const sortedAbbrs = Object.keys(abbreviations).sort((a, b) => b.length - a.length);

  // Replace abbreviations with word boundaries, case-insensitive
  for (const abbr of sortedAbbrs) {
    // Match the abbreviation as a whole word, with optional period, case-insensitive
    const regex = new RegExp(`\\b${abbr}\\.?\\b`, 'gi');
    result = result.replace(regex, abbreviations[abbr]);
  }

  return result;
}

// Extract value after colon or equals
function extractAfterColon(line: string): string {
  // Try colon first
  const colonMatch = line.match(/:\s*(.+)/);
  if (colonMatch) {
    let value = colonMatch[1].trim();
    // Remove any trailing field labels
    value = value.split(/\s+(?:email|address|phone|hp|no)\s*[:=]/i)[0];
    return value;
  }

  // Try equals
  const equalsMatch = line.match(/=\s*(.+)/);
  if (equalsMatch) {
    let value = equalsMatch[1].trim();
    value = value.split(/\s+(?:email|address|phone|hp|no)\s*[:=]/i)[0];
    return value;
  }

  return '';
}

// Extract phone number from line
function extractPhone(line: string): string {
  // Match Malaysian phone formats: 01X-XXXXXXXX, 01X XXXXXXXX, or 03-XXXXXXXX
  const match = line.match(/(0\d{1,2}[-\s]?\d{7,8})/);
  return match ? match[1] : '';
}

// Infer nationality from address
function inferNationality(address: string): string | null {
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

// Format work_since from date to years/months format
function formatWorkSince(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if already in years/months format
  if (/(\d+)\s*(year|month|years|months)/i.test(trimmed)) {
    return trimmed;
  }

  // Try to parse as date and calculate duration
  const duration = calculateDuration(trimmed);
  if (duration) {
    return duration;
  }

  // Return original if can't parse
  return trimmed;
}

// Calculate duration from date string to years/months
function calculateDuration(dateString: string): string | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

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

  // Match "DD/MM/YYYY" or "D/M/YYYY" format (Malaysian format: day/month/year)
  const slashMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1]);
    joinedMonth = parseInt(slashMatch[2]);
    joinedYear = parseInt(slashMatch[3]);
    // Only accept if day is valid (1-31)
    if (day < 1 || day > 31) {
      joinedMonth = null;
      joinedYear = null;
    }
  }

  // Match "MM/YYYY" format
  const monthYearOnlyMatch = dateString.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYearOnlyMatch && !slashMatch) {
    joinedMonth = parseInt(monthYearOnlyMatch[1]);
    joinedYear = parseInt(monthYearOnlyMatch[2]);
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
