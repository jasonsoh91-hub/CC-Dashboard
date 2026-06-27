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

Return this exact JSON structure (null for missing fields). BE TOLERANT OF TYPOS in field labels (e.g., "Naem"="Name", "Emial"="Email", "Adress"="Address", "Comapny"="Company", "Postion"="Position", "Religon"="Religion", "Maried"="Married", "Maly"="Malay", "Bechelors"="Bachelors"):
{
  "name": "applicant name",
  "salutation": "title - MUST be one of: 'Dr', 'Haji', 'Hajjah', 'Mr', 'Mrs', 'Ms', 'Prof'. null if missing",
  "gender": "MUST be 'Male' or 'Female'. Infer from salutation/name only if explicitly hinted (Mr/Encik=Male, Mrs/Ms/Puan/Cik=Female). Otherwise null",
  "date_of_birth": "DOB in DD/MM/YYYY format. Can derive from IC: first 6 digits of 12-digit Malaysian IC = YYMMDD (YY 00-30 → 20YY, else 19YY)",
  "ic_number": "12-digit IC number (digits only)",
  "phone": "APPLICANT'S mobile phone ONLY - from 'HP:', 'HP No:', 'Mobile:', 'Mobile No:', 'Tel:' - DO NOT extract emergency contact numbers",
  "email": "PERSONAL email address from 'Email:' field (NOT work/HR email)",
  "address": "residential address",
  "nationality": "nationality - infer 'Malaysian' if address contains Malaysian states (Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya) or Malaysian postcodes, otherwise 'Singaporean' for Singapore addresses",
  "race": "MUST be one of: 'Malay', 'Chinese', 'Indian', 'Punjabi', 'Others'. Normalize typos: 'Maly'/'Melayu'→'Malay', 'Chinise'/'Cina'→'Chinese', 'Indien'/'India'→'Indian'",
  "religion": "MUST be one of: 'Islam', 'Christian', 'Buddhist', 'Hindu', 'Sikhism', 'Atheist', 'Others'. Normalize: 'Muslim'/'Islamic'→'Islam', 'Christianity'/'Kristian'/'Catholic'/'Protestant'→'Christian', 'Buddhism'/'Buddha'→'Buddhist', 'Hinduism'/'Hindu'→'Hindu', 'Sikh'→'Sikhism', 'No religion'/'None'→'Atheist'",
  "marital_status": "MUST be one of: 'Single', 'Married', 'Divorced', 'Others'. Normalize typos: 'Maried'/'Marred'→'Married', 'Singel'→'Single', 'Divored'/'Divorce'→'Divorced'. 'Widowed' maps to 'Others'",
  "residence_status": "residential status - MUST be one of: 'Owned', 'Rented', 'With Parents', 'Others'. Convert: 'Own' → 'Owned', 'Rent' → 'Rented'",
  "education_level": "education level - MUST be one of: 'Primary Education', 'Secondary Education', 'Diploma', 'Degree', 'Masters', 'Doctorate', 'Professional Qualification'. Normalize: SPM/STPM/high school→'Secondary Education', Bachelor/Bachelors/Bechelors→'Degree', Master/MBA/MSc→'Masters', PhD/Dr→'Doctorate', ACCA/CFA/professional cert→'Professional Qualification'",
  "name_on_card": "name to be embossed on card - usually same as name unless explicitly different",
  "mother_name": "mother's maiden name",
  "employer_name": "company/employer name from 'Company name:' field",
  "employer_address": "office address from 'Company address:' field",
  "position": "job position from 'Position:' field - EXPAND abbreviations: MD=Managing Director, GM=General Manager, CEO=Chief Executive Officer, CFO=Chief Financial Officer, COO=Chief Operating Officer, CTO=Chief Technology Officer, snr/sr=Senior, jr=Junior, engr=Engineer, mgr=Manager, exec=Executive, asst=Assistant, sup=Supervisor",
  "occupation": "occupation type from 'Occupation:' or 'Nature of business:' field",
  "office_phone": "office phone from 'Office Number:' field (digits only)",
  "work_since": "length of service - extract the raw date value (e.g., 'June 2024', 'January 2023', '06/2024')",
  "work_email": "HR/Work email from 'HR Email:' or 'Work Email:' field - this is SEPARATE from personal email",
  "employment_status": "MUST be one of: 'Permanent', 'Contract', 'Pensioner', 'Part Timer', 'Others'. Normalize: 'Permanant'→'Permanent', 'Contractor'→'Contract', 'Pension'/'Retired'→'Pensioner', 'Part-time'/'Parttime'→'Part Timer'",
  "business_classification": "MUST be one of: 'Private Limited', 'Limited', 'Partnership', 'Public Listed', 'Multinational Corporation', 'Government', 'Sole Proprietorship', 'Others'. Normalize: 'Sdn Bhd'/'Pte Ltd'/'Private'→'Private Limited', 'Bhd'/'Public'→'Public Listed', 'MNC'/'Multinational'→'Multinational Corporation', 'Govt'/'Civil Service'→'Government', 'Sole Prop'/'Sole-prop'→'Sole Proprietorship'",
  "employment_type": "MUST be one of: 'Employer', 'Government Employee', 'Private Employee', 'Self Employed'. Normalize: 'Owner'/'Founder'/'Director'→'Employer', 'Govt Employee'/'Civil Servant'→'Government Employee', 'Salaried'/'Employee'→'Private Employee', 'Freelance'/'Self-Employed'/'Self-emp'→'Self Employed'",
  "monthly_income": "monthly income in RM - DIGITS ONLY (strip 'RM', commas, decimals). e.g., 'RM 12,000' → '12000', 'RM5500.00' → '5500'",
  "monthly_commitment": "monthly commitment/expenses in RM - DIGITS ONLY (same formatting as monthly_income)",
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

    const matchEnum = (val: string | null, enumList: string[]): string | null => {
      if (!val) return null;
      const v = val.toString().trim();
      if (!v) return null;
      const lower = v.toLowerCase();
      // exact case-insensitive match first
      const exact = enumList.find(e => e.toLowerCase() === lower);
      if (exact) return exact;
      // substring match
      const sub = enumList.find(e => lower.includes(e.toLowerCase()) || e.toLowerCase().includes(lower));
      return sub || null;
    };

    const normalizeRace = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (['maly', 'melayu', 'malay'].includes(v)) return 'Malay';
      if (['chinise', 'cina', 'chinese', 'cinese'].includes(v)) return 'Chinese';
      if (['indien', 'india', 'indian'].includes(v)) return 'Indian';
      if (['punjabi', 'punjab'].includes(v)) return 'Punjabi';
      return matchEnum(val, ['Malay', 'Chinese', 'Indian', 'Punjabi', 'Others']) || 'Others';
    };

    const normalizeReligion = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (['muslim', 'islam', 'islamic'].includes(v)) return 'Islam';
      if (['christianity', 'christian', 'kristian', 'catholic', 'protestant'].includes(v)) return 'Christian';
      if (['buddhism', 'buddha', 'buddhist', 'budha'].includes(v)) return 'Buddhist';
      if (['hinduism', 'hindu', 'hindi'].includes(v)) return 'Hindu';
      if (['sikh', 'sikhism'].includes(v)) return 'Sikhism';
      if (['none', 'no religion', 'atheist', 'atheism'].includes(v)) return 'Atheist';
      return matchEnum(val, ['Islam', 'Christian', 'Buddhist', 'Hindu', 'Sikhism', 'Atheist', 'Others']) || 'Others';
    };

    const normalizeMarital = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (['singel', 'single'].includes(v)) return 'Single';
      if (['maried', 'marred', 'married'].includes(v)) return 'Married';
      if (['divored', 'divorce', 'divorced'].includes(v)) return 'Divorced';
      if (['widowed', 'widow'].includes(v)) return 'Others';
      return matchEnum(val, ['Single', 'Married', 'Divorced', 'Others']) || 'Others';
    };

    const normalizeEducation = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (v.includes('primary')) return 'Primary Education';
      if (v.includes('secondary') || v.includes('spm') || v.includes('stpm') || v.includes('high school') || v.includes('o-level') || v.includes('a-level')) return 'Secondary Education';
      if (v.includes('diploma')) return 'Diploma';
      if (v.includes('phd') || v.includes('doctor') || v.includes('doctorate')) return 'Doctorate';
      if (v.includes('master') || v.includes('mba') || v.includes('msc')) return 'Masters';
      if (v.includes('professional') || v.includes('acca') || v.includes('cfa') || v.includes('cpa') || v.includes('aca')) return 'Professional Qualification';
      if (v.includes('degree') || v.includes('bachelor') || v.includes('bechelor') || v.includes('bsc') || v.includes('ba ')) return 'Degree';
      return matchEnum(val, ['Primary Education', 'Secondary Education', 'Diploma', 'Degree', 'Masters', 'Doctorate', 'Professional Qualification']);
    };

    const normalizeEmpStatus = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (v.includes('permanent') || v.includes('permanant')) return 'Permanent';
      if (v.includes('contract')) return 'Contract';
      if (v.includes('pension') || v.includes('retire')) return 'Pensioner';
      if (v.includes('part')) return 'Part Timer';
      return matchEnum(val, ['Permanent', 'Contract', 'Pensioner', 'Part Timer', 'Others']) || 'Others';
    };

    const normalizeBusinessClass = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (v.includes('sdn bhd') || v.includes('pte ltd') || v.includes('private limited')) return 'Private Limited';
      if (v.includes('public listed') || v === 'bhd' || v.includes('public')) return 'Public Listed';
      if (v.includes('mnc') || v.includes('multinational')) return 'Multinational Corporation';
      if (v.includes('govt') || v.includes('government') || v.includes('civil service')) return 'Government';
      if (v.includes('sole prop')) return 'Sole Proprietorship';
      if (v.includes('partnership')) return 'Partnership';
      if (v === 'limited' || v === 'ltd') return 'Limited';
      return matchEnum(val, ['Private Limited', 'Limited', 'Partnership', 'Public Listed', 'Multinational Corporation', 'Government', 'Sole Proprietorship', 'Others']) || 'Others';
    };

    const normalizeEmpType = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (v.includes('owner') || v.includes('founder') || v.includes('director') || v === 'employer') return 'Employer';
      if (v.includes('government') || v.includes('govt') || v.includes('civil')) return 'Government Employee';
      if (v.includes('self') || v.includes('freelance')) return 'Self Employed';
      if (v.includes('private') || v.includes('salaried') || v.includes('employee')) return 'Private Employee';
      return matchEnum(val, ['Employer', 'Government Employee', 'Private Employee', 'Self Employed']);
    };

    const normalizeGender = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().toLowerCase().trim();
      if (['m', 'male', 'lelaki'].includes(v)) return 'Male';
      if (['f', 'female', 'perempuan'].includes(v)) return 'Female';
      return null;
    };

    const normalizeSalutation = (val: string | null): string | null => {
      if (!val) return null;
      const v = val.toString().trim();
      const map: Record<string, string> = {
        'dr': 'Dr', 'dr.': 'Dr',
        'haji': 'Haji', 'hj': 'Haji', 'hj.': 'Haji',
        'hajjah': 'Hajjah', 'hjh': 'Hajjah', 'hjh.': 'Hajjah',
        'mr': 'Mr', 'mr.': 'Mr', 'en': 'Mr', 'encik': 'Mr',
        'mrs': 'Mrs', 'mrs.': 'Mrs', 'pn': 'Mrs', 'puan': 'Mrs',
        'ms': 'Ms', 'ms.': 'Ms', 'cik': 'Ms',
        'prof': 'Prof', 'prof.': 'Prof', 'professor': 'Prof',
      };
      return map[v.toLowerCase()] || null;
    };

    const normalizeMoney = (val: string | null): string | null => {
      if (!val) return null;
      const digits = val.toString().replace(/[^\d.]/g, '').split('.')[0];
      return digits || null;
    };

    const deriveDobFromIc = (ic: string | null): string | null => {
      if (!ic || ic.length !== 12) return null;
      const yy = parseInt(ic.substring(0, 2));
      const mm = ic.substring(2, 4);
      const dd = ic.substring(4, 6);
      const month = parseInt(mm);
      const day = parseInt(dd);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const fullYear = yy <= 30 ? 2000 + yy : 1900 + yy;
      return `${dd}/${mm}/${fullYear}`;
    };

    const deriveGenderFromIc = (ic: string | null): string | null => {
      if (!ic || ic.length !== 12) return null;
      const lastDigit = parseInt(ic.charAt(11));
      if (isNaN(lastDigit)) return null;
      return lastDigit % 2 === 1 ? 'Male' : 'Female';
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

    const ic = cleanPhone(clean(data.ic_number));
    const cleaned = {
      name: clean(data.name),
      salutation: normalizeSalutation(clean(data.salutation)),
      gender: normalizeGender(clean(data.gender)) || deriveGenderFromIc(ic),
      date_of_birth: clean(data.date_of_birth) || deriveDobFromIc(ic),
      ic_number: ic,
      phone: cleanPhone(clean(data.phone)),
      email: clean(data.email),
      address: clean(data.address),
      nationality: clean(data.nationality) || 'Malaysian', // Default to Malaysian
      race: normalizeRace(clean(data.race)),
      religion: normalizeReligion(clean(data.religion)),
      marital_status: normalizeMarital(clean(data.marital_status)),
      residence_status: normalizeResidenceStatus(clean(data.residence_status)),
      education_level: normalizeEducation(clean(data.education_level)),
      name_on_card: clean(data.name_on_card),
      mother_name: clean(data.mother_name),
      employer_name: clean(data.employer_name),
      employer_address: clean(data.employer_address),
      position: clean(data.position),
      occupation: clean(data.occupation),
      office_phone: cleanPhone(clean(data.office_phone)),
      work_since: this.formatWorkSince(clean(data.work_since)),
      work_email: clean(data.work_email),
      employment_status: normalizeEmpStatus(clean(data.employment_status)),
      business_classification: normalizeBusinessClass(clean(data.business_classification)),
      employment_type: normalizeEmpType(clean(data.employment_type)),
      monthly_income: normalizeMoney(clean(data.monthly_income)),
      monthly_commitment: normalizeMoney(clean(data.monthly_commitment)),
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
