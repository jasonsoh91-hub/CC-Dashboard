'use client';

import { useState, useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { ExtractedData, ApplicationFormData } from '@/lib/types';
import { dropdownOptions } from '@/lib/types';
import { BANKS, getCardsByBank } from '@/lib/banks';
import { getMyProfile, getMyBalance, logEvent, submitFeedback, type Role } from '@/lib/applications';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// Helper: Generate name for card (max 19 characters, smart truncate)
// Always removes "BINTI"/"BIN" connectors for cleaner card names
function generateNameOnCard(fullName: string | undefined | null): string {
  if (!fullName) return '';

  const MAX_CHARS = 19;
  const cleanName = fullName.replace(/\s+/g, ' ').trim().toUpperCase();

  // For Malay names: extract First Name + Last Name (skipping "BINTI"/"BIN")
  const parts = cleanName.split(' ');
  const firstName = parts[0];

  // Build name without connector
  let partsWithoutConnector: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'BINTI' || parts[i] === 'BIN') {
      continue; // Skip connector
    }
    partsWithoutConnector.push(parts[i]);
  }

  let cardName = partsWithoutConnector.join(' ');

  // If still too long, try First Name + Last Word only
  if (cardName.length > MAX_CHARS && partsWithoutConnector.length > 1) {
    const lastWord = partsWithoutConnector[partsWithoutConnector.length - 1];
    const shortName = `${firstName} ${lastWord}`;
    if (shortName.length <= MAX_CHARS) {
      cardName = shortName;
    } else {
      cardName = firstName;
    }
  }

  // First name too long? Truncate
  if (cardName.length > MAX_CHARS) {
    cardName = firstName.substring(0, MAX_CHARS);
  }

  return cardName;
}

// Helper: Check if address is in Singapore
function isSingaporeAddress(address: string | null | undefined): boolean {
  if (!address) return false;

  const lowerAddress = address.toLowerCase();

  // Check for Singapore
  if (lowerAddress.includes('singapore') || lowerAddress.includes('s singapore')) {
    return true;
  }

  // Check for Singapore postcode (6 digits)
  const singaporePostcode = /\b\d{6}\b/;
  if (singaporePostcode.test(address)) {
    return true;
  }

  return false;
}

export default function Dashboard() {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedBank, setSelectedBank] = useState<string>('bank_muamalat');
  const [availableCards, setAvailableCards] = useState<readonly string[]>(getCardsByBank('bank_muamalat'));
  const [formData, setFormData] = useState<ApplicationFormData>({
    bank_id: 'bank_muamalat',
    nationality: '',
    related_to_bmm_staff: false,
    agree_tawarruq: true,
    agree_unspecified: true,
    fatca_decl_1: true,  // No (1) - default checked
    fatca_decl_2: true,  // No (2) - default checked
    tax_fatca_decl: true,
    agree_declaration: true,
  });

  const [profile, setProfile] = useState<{ role: Role; email: string } | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ balance: number; source: 'team' | 'user' } | null>(null);

  const refreshBalance = () => {
    getMyBalance().then(setBalance).catch(() => {});
  };

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => {});
    refreshBalance();
  }, []);

  // Report an extraction issue / error, linked to the last saved application if any.
  const handleReportIssue = async () => {
    const message = window.prompt(
      'Describe the extraction error or issue:'
    );
    if (!message || !message.trim()) return;
    try {
      await submitFeedback(message.trim(), lastSavedId ?? undefined);
      alert('Thanks — feedback logged.');
    } catch (e) {
      console.error('[Feedback] failed:', e);
      alert('Could not submit feedback. Check console.');
    }
  };

  // Hydrate form from a saved application picked on the History page.
  useEffect(() => {
    const stash = sessionStorage.getItem('cc-reload-application');
    if (!stash) return;
    sessionStorage.removeItem('cc-reload-application');
    try {
      const saved = JSON.parse(stash) as ApplicationFormData;
      setFormData(saved);
      const bankId = saved.bank_id || 'bank_muamalat';
      setSelectedBank(bankId);
      setAvailableCards(getCardsByBank(bankId));
    } catch (e) {
      console.error('[Reload] Failed to hydrate saved application:', e);
    }
  }, []);

  // Handle bank change - update available cards and reset card_type
  const handleBankChange = (bankId: string) => {
    setSelectedBank(bankId);
    setAvailableCards(getCardsByBank(bankId));
    setFormData(prev => ({ ...prev, bank_id: bankId as any, card_type: null }));
  };

  const handleExtract = async () => {
    if (!rawText.trim()) return;

    setIsLoading(true);
    console.log('🔍 Starting extraction...');
    try {
      const response = await fetch('/api/agents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      });

      const result = await response.json();
      console.log('📥 API Response:', result);
      if (result.success && result.data) {
        console.log('✅ Extraction successful!');
        console.log('📊 Extracted data:', result.data);
        console.log('📊 employer_name:', result.data.employer_name);
        console.log('📊 position:', result.data.position);
        console.log('📊 office_phone:', result.data.office_phone);
        setExtractedData(result.data);

        // Map extracted data to form fields
        const mappedData: ApplicationFormData = {
          card_type: formData.card_type,
          salutation: result.data.salutation || (result.data.name?.includes('Binti') ? 'Ms' : result.data.name?.includes('Bin') ? 'Mr' : undefined),
          name_as_per_ic: result.data.name,
          mykad_number: result.data.ic_number,
          hp_number: result.data.phone,
          email_address: result.data.email,
          residential_address: result.data.address,
          name_on_card: generateNameOnCard(result.data.name), // Smart truncated for card
          mother_name: result.data.mother_name,
          employer_name: result.data.employer_name,
          position: result.data.position,
          occupation: result.data.occupation,
          office_number: result.data.office_phone,
          office_address: result.data.employer_address,
          length_of_service: result.data.work_since,
          emergency_full_name: result.data.emergency_name,
          emergency_contact_number: result.data.emergency_phone,
          emergency_relation: result.data.emergency_relation,
          nationality: result.data.nationality || 'Malaysian',
          education_level: result.data.education_level,
          hr_email: result.data.work_email,
          // Income + attributes now captured by extraction (route normalises
          // enum-ish values to app enums; income is already a numeric string).
          monthly_income: result.data.monthly_income,
          other_income_source: result.data.other_income,
          monthly_commitment: result.data.monthly_commitment,
          residence_status: result.data.residence_status,
          business_classification: result.data.business_classification,
          employment_sector: result.data.employment_sector,
          employment_type: result.data.employment_type,
          employment_status: result.data.employment_status,
          marital_status: result.data.marital_status,
          race: result.data.race,
          religion: result.data.religion,
          related_to_bmm_staff: false,
          agree_tawarruq: true,
          agree_unspecified: true,
          fatca_decl_1: true,
          fatca_decl_2: true,
          tax_fatca_decl: true,
          agree_declaration: true,
        };

        // Set gender based on salutation
        if (mappedData.salutation === 'Mr') {
          mappedData.gender = 'Male';
        } else if (mappedData.salutation === 'Ms' || mappedData.salutation === 'Mrs') {
          mappedData.gender = 'Female';
        }

        // Parse IC for date of birth
        if (result.data.ic_number && result.data.ic_number.length === 12) {
          const year = parseInt(result.data.ic_number.substring(0, 2));
          const month = result.data.ic_number.substring(2, 4);
          const day = result.data.ic_number.substring(4, 6);
          const fullYear = year > 30 ? `19${year}` : `20${year}`;
          mappedData.date_of_birth = `${day}/${month}/${fullYear}`;
        }

        // Gender from MyKad (last digit: odd=male, even=female) — authoritative
        // when a 12-digit IC exists; else fall back to what extraction inferred.
        if (result.data.ic_number && result.data.ic_number.length === 12) {
          const cleanIc = result.data.ic_number.replace(/[^0-9]/g, '');
          const lastDigit = parseInt(cleanIc.charAt(11));
          mappedData.gender = (lastDigit % 2 === 1) ? 'Male' : 'Female';
          console.log('[Extraction] MyKad Gender - IC:', cleanIc, 'Last digit:', lastDigit, 'Gender:', mappedData.gender);
        } else if (!mappedData.gender && result.data.gender) {
          mappedData.gender = result.data.gender as 'Male' | 'Female';
        }

        // Race — only detect from name if extraction didn't already state it.
        if (!mappedData.race && result.data.name) {
          const detectedRace = detectRaceFromName(result.data.name);
          if (detectedRace) {
            mappedData.race = detectedRace;
            console.log('[Extraction] Race Detection - Name:', result.data.name, 'Race:', detectedRace);
          }
        }
        // Auto-set religion Islam for Malay when religion not already known.
        if (!mappedData.religion && mappedData.race === 'Malay') {
          mappedData.religion = 'Islam';
          console.log('[Extraction] Race→Religion: Malay → Islam');
        }

        // Marital status — fall back to emergency relation only if not stated.
        if (!mappedData.marital_status && result.data.emergency_relation) {
          const lowerRelation = result.data.emergency_relation.toLowerCase();
          if (lowerRelation.includes('spouse') || lowerRelation.includes('husband') || lowerRelation.includes('wife')) {
            mappedData.marital_status = 'Married';
            console.log('[Extraction] Emergency Relation:', result.data.emergency_relation, '→ Marital Status: Married');
          }
        }

        // Auto-detect nationality from Malaysian IC + Malaysian address
        const hasMalaysianIC = result.data.ic_number && result.data.ic_number.replace(/[^0-9]/g, '').length === 12;
        const isMalaysianAddress = mappedData.residential_address && isMalaysianAddressCheck(mappedData.residential_address);

        if (hasMalaysianIC && isMalaysianAddress) {
          mappedData.nationality = 'Malaysian';
          console.log('[Extraction] Malaysian IC + Malaysian Address → Nationality: Malaysian');
        }

        // Auto-parse addresses after extraction
        if (mappedData.residential_address) {
          const parsed = parseMalaysianAddress(mappedData.residential_address);
          console.log('[Extraction] Parsed residential address:', parsed);
          mappedData.postcode = parsed.postcode;
          mappedData.city = parsed.city;
          mappedData.state = parsed.state;
        }
        if (mappedData.office_address) {
          const parsed = parseMalaysianAddress(mappedData.office_address);
          console.log('[Extraction] Parsed office address:', parsed);
          mappedData.office_postcode = parsed.postcode;
          mappedData.office_city = parsed.city;
          mappedData.office_state = parsed.state;
        }

        setFormData(mappedData);
        logEvent('extract'); // track extraction usage
        console.log('📝 Form data updated:', mappedData);
        console.log('🏢 Mapped employer_name:', mappedData.employer_name);
        console.log('🏢 Mapped hr_email:', mappedData.hr_email);
        console.log('🏢 Mapped position:', mappedData.position);
        console.log('🏢 Mapped office_phone:', mappedData.office_number);
      }
    } catch (error) {
      console.error('Extraction error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    console.log('[PDF] Sending formData:', formData);

    // Clean data: remove undefined/null values that would fail Zod validation
    const cleanData = Object.fromEntries(
      Object.entries(formData).filter(([_, v]) => v !== undefined && v !== null)
    );
    console.log('[PDF] Cleaned data keys:', Object.keys(cleanData));
    console.log('[PDF] Cleaned data sample:', {
      bank_id: cleanData.bank_id,
      mykad_number: cleanData.mykad_number,
      employer_name: cleanData.employer_name,
      agree_tawarruq: cleanData.agree_tawarruq,
    });

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cc-application-${formData.mykad_number || 'draft'}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Application + PDF are saved server-side (atomic with the charge).
        const savedId = response.headers.get('X-Application-Id') || undefined;
        if (savedId) setLastSavedId(savedId);
        logEvent('download', savedId); // track PDF download/generation
        refreshBalance(); // RM2 was deducted server-side
      } else if (response.status === 402) {
        const err = await response.json();
        alert(
          `Not enough credit to generate this form.\n\nCost: RM${err.cost}\nYour balance: RM${Number(err.balance).toFixed(2)}\n\nTop up on the Credits page.`
        );
        refreshBalance();
      } else {
        const errorText = await response.text();
        console.error('[PDF] Server error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { rawResponse: errorText };
        }
        console.error('[PDF] Server error parsed:', errorData);
        alert(`PDF generation failed: ${errorData?.error || errorData?.details || 'Unknown error'}\n\nCheck console for details.`);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if address is Malaysian (contains Malaysian state)
  function isMalaysianAddressCheck(address: string): boolean {
    const states = [
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
      'Pulau Pinang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
      'Kuala Lumpur', 'Labuan', 'Putrajaya'
    ];
    const upperAddress = address.toUpperCase();
    return states.some(state => upperAddress.includes(state.toUpperCase()));
  }

  const updateField = (field: any, value: any) => {
    // Skip null values (can happen with Select components)
    if (value === null) return;

    // Debug logging for boolean fields (checkboxes)
    if (typeof value === 'boolean') {
      console.log(`[updateField] ${field} = ${value}, type: ${typeof value}`);
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      console.log(`[updateField] ${field} updated:`, value);

      // Auto-link salutation to gender
      if (field === 'salutation' && typeof value === 'string') {
        if (value === 'Mr') {
          updated.gender = 'Male';
        } else if (value === 'Ms' || value === 'Mrs') {
          updated.gender = 'Female';
        } else if (value === 'Dr' || value === 'Prof' || value === 'Haji' || value === 'Hajjah') {
          // Keep existing gender or leave blank
        }
      }

      // Auto-expand abbreviations for occupation and position
      if ((field === 'occupation' || field === 'position') && typeof value === 'string') {
        if (field === 'occupation') {
          updated.occupation = expandAbbreviations(value);
        } else if (field === 'position') {
          updated.position = expandAbbreviations(value);
        }
      }

      // Auto-detect nationality from Malaysian IC + Malaysian address
      // Only run when mykad_number or residential_address is being updated
      if (field === 'mykad_number' || field === 'residential_address') {
        const hasMalaysianIC = (updated.mykad_number || prev.mykad_number) && (updated.mykad_number || prev.mykad_number)!.replace(/[^0-9]/g, '').length === 12;
        const address = updated.residential_address || prev.residential_address;
        const isMalaysianAddress = address && isMalaysianAddressCheck(address);

        // Auto-fill from MyKad when mykad_number is updated
        if (field === 'mykad_number' && value) {
          const cleanIc = value.replace(/[^0-9]/g, '');
          if (cleanIc.length === 12) {
            // Extract date of birth from MyKad (YYMMDD format)
            const year = parseInt(cleanIc.substring(0, 2));
            const month = cleanIc.substring(2, 4);
            const day = cleanIc.substring(4, 6);
            const fullYear = year > 30 ? `19${year}` : `20${year}`;
            updated.date_of_birth = `${day}/${month}/${fullYear}`;
            console.log('[MyKad] Auto-filled date_of_birth:', updated.date_of_birth);

            // Extract gender from last digit (odd=male, even=female)
            const lastDigit = parseInt(cleanIc.charAt(11));
            updated.gender = (lastDigit % 2 === 1) ? 'Male' : 'Female';
            console.log('[MyKad] Auto-filled gender:', updated.gender);

            // Set nationality as Malaysian for 12-digit IC
            updated.nationality = 'Malaysian';
            console.log('[MyKad] Auto-filled nationality: Malaysian');
          }
        }

        // Only set nationality to Malaysian if we have both IC and address
        if (hasMalaysianIC && isMalaysianAddress && !updated.nationality) {
          updated.nationality = 'Malaysian';
          console.log('[Nationality] Malaysian IC + Malaysian Address detected → Nationality: Malaysian');
        }
      }

      return updated;
    });
  };

  // Parse Malaysian or Singapore address to extract postcode, city, and state
  function parseMalaysianAddress(address: string): { postcode?: string; city?: string; state?: string } {
    if (!address) return {};

    const lowerAddress = address.toLowerCase();

    // Check for Singapore address (6-digit postcode or "Singapore" in address)
    const singaporePostcodeMatch = address.match(/\b(\d{6})\b/);
    const hasSingaporeKeyword = lowerAddress.includes('singapore');

    if (singaporePostcodeMatch || hasSingaporeKeyword) {
      // Singapore address parsing
      const postcode = singaporePostcodeMatch ? singaporePostcodeMatch[1] : undefined;

      // Extract city (area name) from Singapore address
      // Format: "60 Pioneer Rd, Singapore 628509" -> city = "Pioneer"
      let city: string | undefined;
      if (postcode) {
        const parts = address.split(postcode)[0].trim();
        // Remove "Singapore" and common suffixes, then extract area name
        const cleaned = parts.replace(/,\s*singapore\s*$/i, '').replace(/,\s*$/i, '');
        // Extract area name (typically the word before Rd/Road/Street/etc)
        const areaMatch = cleaned.match(/(\w+)\s+(?:Rd|Road|St|Street|Dr|Drive|Ave|Avenue|Crescent|Close|Walk|Lane)$/i);
        if (areaMatch) {
          city = areaMatch[1];
        } else if (cleaned) {
          // Fallback: use the last word of the cleaned address
          const words = cleaned.split(/\s+/);
          city = words[words.length - 1];
        }
      }

      return { postcode, city, state: 'Singapore' };
    }

    // Malaysian address parsing (5-digit postcode)
    const postcodeMatch = address.match(/\b(\d{5})\b/);
    const postcode = postcodeMatch ? postcodeMatch[1] : undefined;

    // Malaysian states list
    const states = [
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
      'Pulau Pinang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
      'Kuala Lumpur', 'Labuan', 'Putrajaya'
    ];

    // Find state in address
    let state: string | undefined;
    let stateIndex = -1;
    for (const s of states) {
      const idx = address.toLowerCase().indexOf(s.toLowerCase());
      if (idx !== -1) {
        state = s;
        stateIndex = idx;
        break;
      }
    }

    // Extract city (text between postcode and state)
    let city: string | undefined;
    if (postcodeMatch && stateIndex !== -1) {
      const afterPostcode = address.substring(postcodeMatch.index! + postcodeMatch[0].length);
      const beforeState = afterPostcode.substring(0, afterPostcode.toLowerCase().indexOf(state!.toLowerCase()));
      city = beforeState.trim().replace(/^\s+/, '').replace(/\s+$/, '');
    }

    return { postcode, city, state };
  }

  // Detect race from Malaysian name patterns
  function detectRaceFromName(name: string): 'Malay' | 'Chinese' | 'Indian' | 'Others' | null {
    if (!name) return null;

    const upperName = name.toUpperCase();

    // Check for Malay names (contain "BIN" or "BINTI")
    if (/\bBIN\b|\bBINTI\b/.test(upperName)) {
      return 'Malay';
    }

    // Common Chinese surnames (first word typically)
    const chineseSurnames = [
      'LEE', 'TAN', 'LIM', 'NG', 'WONG', 'GOH', 'ONG', 'CHIN', 'CHEW', 'KOAY',
      'TEH', 'CHONG', 'CHAN', 'TAY', 'YEO', 'YAP', 'LOW', 'TOH', 'SIM', 'KOH',
      'HAU', 'PANG', 'CHAI', 'THONG', 'KOK', 'LIEW', 'HOON', 'KUAN',
      'PHUA', 'CHIA', 'SEE', 'MAH', 'CHOO', 'WU', 'TSENG', 'PEH', 'TOE',
      'FONG', 'POH', 'DING', 'MOK', 'SIANG', 'HENG', 'LEONG', 'LAM', 'LUM',
      'LAI', 'TIO', 'TUAN', 'NIU', 'YUEN', 'SIA', 'SOH', 'TENG', 'SIU',
      'WEI', 'HEN', 'LIN', 'WANG', 'ZHANG', 'LIU', 'CHEN', 'YANG', 'HUANG',
      'ZHAO', 'WU', 'ZHOU', 'XU', 'SUN', 'ZHU', 'MA', 'GAO', 'HE', 'CAI'
    ];

    const firstWord = upperName.split(/\s+/)[0];
    if (chineseSurnames.includes(firstWord)) {
      return 'Chinese';
    }

    // Check for Indian names (contain "A/P", "S/O", "D/O" or common Indian surnames)
    if (/\bA\/P\b|\bS\/O\b|\bD\/O\b/.test(upperName)) {
      return 'Indian';
    }

    // Common Indian surnames
    const indianSurnames = [
      'A/L', 'ANAK', 'MUTHU', 'KUMAR', 'RAJ', 'SINGAM', 'NADAR',
      'PILLAY', 'NAIDU', 'REDDY', 'MENON', 'IYER', 'LYER', 'SHARMA',
      'GUPTA', 'AGRAWAL', 'JAIN', 'SINGH', 'KAUR', 'PATHMANATHAN',
      'SIVANESAN', 'SIVAPPAN', 'SUBRAMANIAM', 'RAMAN', 'KRISHNAN',
      'VIGNESWARAN', 'THESIGAN', 'MURUGAN', 'KALIAMMAH', 'LETCHUMI',
      'GANDHI', 'KUMARI', 'DEVI', 'LAL', 'VERMA'
    ];

    // Check each word in the name
    const nameWords = upperName.split(/\s+/);
    for (const word of nameWords) {
      if (indianSurnames.includes(word)) {
        return 'Indian';
      }
    }

    // If no pattern matches, return null (don't override existing value)
    return null;
  }

  // Abbreviation expansion (same as in n8n.ts)
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
      const regex = new RegExp(`\\b${abbr}\\.?\\b`, 'gi');
      result = result.replace(regex, abbreviations[abbr]);
    }

    return result;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Bank Muamalat Credit Card Application
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              AI-powered credit card application processing dashboard
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {profile && (
              <span className="text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                {profile.email} · {profile.role}
              </span>
            )}
            {balance && (
              <span
                className={
                  'text-xs px-2 py-1 rounded-md font-semibold ' +
                  (balance.balance < 2
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-700')
                }
                title={balance.source === 'team' ? 'Team pool balance' : 'Your balance'}
              >
                RM{balance.balance.toFixed(2)}
                {balance.source === 'team' ? ' (pool)' : ''}
              </span>
            )}
            <Link href="/credits" className={buttonVariants({ variant: 'outline' })}>
              Credits
            </Link>
            {(profile?.role === 'admin' || profile?.role === 'manager') && (
              <Link href="/team" className={buttonVariants({ variant: 'outline' })}>
                Teams
              </Link>
            )}
            {profile?.role === 'admin' && (
              <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
                Admin
              </Link>
            )}
            <Link href="/history" className={buttonVariants({ variant: 'outline' })}>
              History
            </Link>
            <Link href="/account" className={buttonVariants({ variant: 'outline' })}>
              Account
            </Link>
            <Button variant="outline" onClick={handleReportIssue}>
              Report issue
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await createClient().auth.signOut();
                window.location.href = '/login';
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - Input */}
          <Card className="lg:col-span-2 shadow-lg h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Paste Customer Information</CardTitle>
              <CardDescription className="text-sm">
                Paste the raw customer data in any format below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste messy customer data here...

Example:
Name : Siti Rahmah Binti Zulkifli
Identical number: 960823045188
Hp number : 0173896769
..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="min-h-[250px] font-mono text-sm"
              />
              <Button
                onClick={handleExtract}
                disabled={isLoading || !rawText.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Extracting with AI...' : 'Extract Information'}
              </Button>
            </CardContent>
          </Card>

          {/* Right Panel - Form */}
          <Card className="lg:col-span-3 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Application Form</CardTitle>
              <CardDescription className="text-sm">
                Verify extracted data and fill in missing fields
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[700px] overflow-y-auto">
              {extractedData ? (
                <FormFields
                  formData={formData}
                  updateField={updateField}
                  selectedBank={selectedBank}
                  availableCards={availableCards}
                  onBankChange={handleBankChange}
                />
              ) : (
                <div className="text-center py-16 text-slate-500">
                  <p>Paste customer data and click &quot;Extract Information&quot; to begin</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Generate PDF Button */}
        {extractedData && (
          <>
            {/* Info message for OCBC */}
            {formData.bank_id === 'ocbc' && (
              <Card className="mt-6 shadow-lg border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
                <CardContent className="pt-6">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    ✅ <strong>OCBC Form:</strong> Auto-fill enabled using fillable form fields.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="mt-6 shadow-lg border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <Button
                  onClick={handleGeneratePDF}
                  disabled={isGenerating}
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isGenerating ? 'Generating PDF...' : 'Generate PDF Application'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function FormFields({
  formData,
  updateField,
  selectedBank,
  availableCards,
  onBankChange,
}: any) {
  return (
    <div className="space-y-6 pr-2">
      {/* Bank Selection */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">Bank</h3>
        <Select
          value={formData.bank_id || ''}
          onValueChange={(v) => v != null && (updateField('bank_id', v), onBankChange(v))}
        >
          <SelectTrigger id="bank_id">
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BANKS).map(([id, bank]) => (
              <SelectItem key={id} value={id}>{bank.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Card Type */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">Card Type</h3>
        <Select
          value={formData.card_type || ''}
          onValueChange={(v) => v != null && updateField('card_type', v)}
        >
          <SelectTrigger id="card_type">
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            {availableCards.map((type: string) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* A. Personal Details */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          A. Personal Details
        </h3>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="salutation">Salutation</Label>
            <Select
              value={formData.salutation || ''}
              onValueChange={(v) => v != null && updateField('salutation', v)}
            >
              <SelectTrigger id="salutation">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Dr">Dr</SelectItem>
                <SelectItem value="Haji">Haji</SelectItem>
                <SelectItem value="Hajjah">Hajjah</SelectItem>
                <SelectItem value="Mr">Mr</SelectItem>
                <SelectItem value="Mrs">Mrs</SelectItem>
                <SelectItem value="Ms">Ms</SelectItem>
                <SelectItem value="Prof">Prof</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3 space-y-2">
            <Label htmlFor="name_as_per_ic">Name as per IC</Label>
            <Input
              id="name_as_per_ic"
              value={formData.name_as_per_ic || ''}
              onChange={(e) => updateField('name_as_per_ic', e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={formData.gender || ''}
              onValueChange={(v) => v != null && updateField('gender', v)}
            >
              <SelectTrigger id="gender">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="nationality">Nationality</Label>
            <Input
              id="nationality"
              value={formData.nationality || ''}
              onChange={(e) => updateField('nationality', e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="mykad_number">MyKad Number (without -)</Label>
            <Input
              id="mykad_number"
              value={formData.mykad_number || ''}
              onChange={(e) => updateField('mykad_number', e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input
              id="date_of_birth"
              value={formData.date_of_birth || ''}
              onChange={(e) => updateField('date_of_birth', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="race">Race</Label>
            <Select
              value={formData.race || ''}
              onValueChange={(v) => v != null && updateField('race', v)}
            >
              <SelectTrigger id="race">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.race.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="religion">Religion</Label>
            <Select
              value={formData.religion || ''}
              onValueChange={(v) => v != null && updateField('religion', v)}
            >
              <SelectTrigger id="religion">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.religion.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="marital_status">Marital Status</Label>
            <Select
              value={formData.marital_status || ''}
              onValueChange={(v) => v != null && updateField('marital_status', v)}
            >
              <SelectTrigger id="marital_status">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.maritalStatus.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="hp_number">HP Number</Label>
            <Input
              id="hp_number"
              value={formData.hp_number || ''}
              onChange={(e) => updateField('hp_number', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="email_address">Email Address</Label>
            <Input
              id="email_address"
              type="email"
              value={formData.email_address || ''}
              onChange={(e) => updateField('email_address', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="education_level">Education Level</Label>
            <Select
              value={formData.education_level || ''}
              onValueChange={(v) => v != null && updateField('education_level', v)}
            >
              <SelectTrigger id="education_level">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.educationLevel.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="mother_name">Mother&apos;s Name</Label>
            <Input
              id="mother_name"
              value={formData.mother_name || ''}
              onChange={(e) => updateField('mother_name', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name_on_card" className="flex items-center gap-1">
              Name to appear on Card
              <span className="text-xs text-slate-500 font-normal">(Max 19 characters)</span>
            </Label>
            <Input
              id="name_on_card"
              value={formData.name_on_card || ''}
              onChange={(e) => updateField('name_on_card', e.target.value.slice(0, 19))}
              placeholder=""
              maxLength={19}
              className="font-mono"
            />
            <p className="text-xs text-slate-500">
              {formData.name_on_card?.length || 0}/19 chars • Will auto-truncate from full name
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="residential_address">Residential/Correspondence Address</Label>
          <Textarea
            id="residential_address"
            value={formData.residential_address || ''}
            onChange={(e) => updateField('residential_address', e.target.value)}
            placeholder=""
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="residence_status">Residential Status</Label>
            <Select
              value={formData.residence_status || ''}
              onValueChange={(v) => v != null && updateField('residence_status', v)}
            >
              <SelectTrigger id="residence_status">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.residenceStatus.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end space-y-2 pb-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="related_to_bmm_staff"
                checked={formData.related_to_bmm_staff ?? false}
                onChange={(e) => updateField('related_to_bmm_staff', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
              />
              <Label htmlFor="related_to_bmm_staff" className="text-sm">
                Related to BMMB Staff
              </Label>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* B. Employment Details */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          B. Employment Details
        </h3>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <Label htmlFor="employer_name">Employer&apos;s Name</Label>
            <Input
              id="employer_name"
              value={formData.employer_name || ''}
              onChange={(e) => updateField('employer_name', e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="occupation" className="flex items-center gap-1">
              Occupation / Pekerjaan
              <span className="text-xs text-slate-500 font-normal">(Type of work - MD, GM, etc. will auto-expand)</span>
            </Label>
            <Input
              id="occupation"
              value={formData.occupation || ''}
              onChange={(e) => updateField('occupation', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position" className="flex items-center gap-1">
              Position / Jawatan
              <span className="text-xs text-slate-500 font-normal">(Rank/level - MD, GM, etc. will auto-expand)</span>
            </Label>
            <Input
              id="position"
              value={formData.position || ''}
              onChange={(e) => updateField('position', e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="employment_status">Employment Status</Label>
            <Select
              value={formData.employment_status || ''}
              onValueChange={(v) => v != null && updateField('employment_status', v)}
            >
              <SelectTrigger id="employment_status">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.employmentStatus.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="business_classification">Business Classification</Label>
            <Select
              value={formData.business_classification || ''}
              onValueChange={(v) => v != null && updateField('business_classification', v)}
            >
              <SelectTrigger id="business_classification">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.businessClassification.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="office_number">Office Number</Label>
            <Input
              id="office_number"
              value={formData.office_number || ''}
              onChange={(e) => updateField('office_number', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="employment_type">Employment Type</Label>
            <Select
              value={formData.employment_type || ''}
              onValueChange={(v) => v != null && updateField('employment_type', v)}
            >
              <SelectTrigger id="employment_type">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.employmentType.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="length_of_service">Length of Service</Label>
            <Input
              id="length_of_service"
              value={formData.length_of_service || ''}
              onChange={(e) => updateField('length_of_service', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="employment_sector">Employment Sector</Label>
            <Select
              value={formData.employment_sector || ''}
              onValueChange={(v) => v != null && updateField('employment_sector', v)}
            >
              <SelectTrigger id="employment_sector">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {dropdownOptions.employmentSector.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="office_address">Office Address</Label>
          <Textarea
            id="office_address"
            value={formData.office_address || ''}
            onChange={(e) => updateField('office_address', e.target.value)}
            placeholder=""
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hr_email" className="flex items-center gap-1">
            HR Email (For Malaysian working in Singapore)
            {formData.nationality === 'Malaysian' && isSingaporeAddress(formData.office_address) && (
              <span className="text-xs text-orange-600 font-normal">⚠️ Required</span>
            )}
          </Label>
          <Input
            id="hr_email"
            type="email"
            value={formData.hr_email || ''}
            onChange={(e) => updateField('hr_email', e.target.value)}
            placeholder="hr@company.com"
            className={formData.nationality === 'Malaysian' && isSingaporeAddress(formData.office_address) && !formData.hr_email ? 'border-orange-500' : ''}
          />
          {formData.nationality === 'Malaysian' && isSingaporeAddress(formData.office_address) && !formData.hr_email && (
            <p className="text-xs text-orange-600">HR Email is required for Malaysians working in Singapore</p>
          )}
        </div>
      </div>

      <Separator />

      {/* C. Applicant's Income */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          C. Applicant&apos;s Income
        </h3>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="monthly_income">Monthly Income (RM)</Label>
            <Input
              id="monthly_income"
              value={formData.monthly_income || ''}
              onChange={(e) => updateField('monthly_income', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="other_income_source">Other Income Source (RM)</Label>
            <Input
              id="other_income_source"
              value={formData.other_income_source || ''}
              onChange={(e) => updateField('other_income_source', e.target.value)}
              placeholder=""
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* D. Emergency Contact Details */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          D. Emergency Contact Details
        </h3>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="emergency_full_name">Full Name</Label>
            <Input
              id="emergency_full_name"
              value={formData.emergency_full_name || ''}
              onChange={(e) => updateField('emergency_full_name', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="emergency_contact_number">Contact Number</Label>
            <Input
              id="emergency_contact_number"
              value={formData.emergency_contact_number || ''}
              onChange={(e) => updateField('emergency_contact_number', e.target.value)}
              placeholder=""
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="emergency_relation">Relation</Label>
            <Input
              id="emergency_relation"
              value={formData.emergency_relation || ''}
              onChange={(e) => updateField('emergency_relation', e.target.value)}
              placeholder=""
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* I. Credit Card-i Financing - Tawarruq Concept */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          I. Credit Card-i Financing - Tawarruq Concept
        </h3>

        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="agree_tawarruq"
              checked={formData.agree_tawarruq ?? false}
              onChange={(e) => updateField('agree_tawarruq', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <Label htmlFor="agree_tawarruq" className="text-sm">
              I Agree
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="agree_unspecified"
              checked={formData.agree_unspecified ?? false}
              onChange={(e) => updateField('agree_unspecified', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <Label htmlFor="agree_unspecified" className="text-sm">
              Unspecified
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* J. Self FATCA/CRS Declaration */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          J. Self FATCA/CRS Declaration
        </h3>

        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="fatca_decl_1"
              checked={formData.fatca_decl_1 ?? false}
              onChange={(e) => updateField('fatca_decl_1', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <Label htmlFor="fatca_decl_1" className="text-sm">
              No (1)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="fatca_decl_2"
              checked={formData.fatca_decl_2 ?? false}
              onChange={(e) => updateField('fatca_decl_2', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <Label htmlFor="fatca_decl_2" className="text-sm">
              No (2)
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* K. Tax and FATCA Declaration */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          K. Tax and FATCA Declaration
        </h3>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="tax_fatca_decl"
            checked={formData.tax_fatca_decl ?? false}
            onChange={(e) => updateField('tax_fatca_decl', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
          />
          <Label htmlFor="tax_fatca_decl" className="text-sm">
            I have accessed, read, and understood the Tax & FATCA Declaration
          </Label>
        </div>
      </div>

      <Separator />

      {/* L. Declaration & Personal Data Protection Act 2010 */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">
          L. Declaration & Personal Data Protection Act 2010
        </h3>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="agree_declaration"
            checked={formData.agree_declaration ?? false}
            onChange={(e) => updateField('agree_declaration', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
          />
          <Label htmlFor="agree_declaration" className="text-sm">
            I agree to the Declaration & Personal Data Protection Act 2010
          </Label>
        </div>
      </div>
    </div>
  );
}
