'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { ExtractedData, ApplicationFormData } from '@/lib/types';
import { dropdownOptions } from '@/lib/types';

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

export default function Dashboard() {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [formData, setFormData] = useState<ApplicationFormData>({
    nationality: 'Malaysian',
    related_to_bmm_staff: false,
    agree_tawarruq: true,
    agree_unspecified: true,
    fatca_decl_1: true,  // No (1) - default checked
    fatca_decl_2: true,  // No (2) - default checked
    tax_fatca_decl: true,
    agree_declaration: true,
  });

  const handleExtract = async () => {
    if (!rawText.trim()) return;

    setIsLoading(true);
    console.log('🔍 Starting extraction...');
    try {
      const response = await fetch('/api/extract', {
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
          salutation: result.data.name?.includes('Binti') ? 'Ms' : result.data.name?.includes('Bin') ? 'Mr' : undefined,
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
          nationality: 'Malaysian',
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

        setFormData(mappedData);
        console.log('📝 Form data updated:', mappedData);
        console.log('🏢 Mapped employer_name:', mappedData.employer_name);
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
    console.log('[PDF] Cleaned data:', cleanData);

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
      } else {
        const errorData = await response.json();
        console.error('[PDF] Server error:', errorData);
        alert(`PDF generation failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateField = (field: keyof ApplicationFormData, value: string | boolean | null) => {
    // Skip null values (can happen with Select components)
    if (value === null) return;

    setFormData(prev => {
      const updated = { ...prev, [field]: value };

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
        updated[field] = expandAbbreviations(value);
      }

      return updated;
    });
  };

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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Bank Muamalat Credit Card Application
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            AI-powered credit card application processing dashboard
          </p>
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
                <FormFields formData={formData} updateField={updateField} />
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
        )}
      </div>
    </div>
  );
}

function FormFields({
  formData,
  updateField,
}: {
  formData: ApplicationFormData;
  updateField: (field: keyof ApplicationFormData, value: string | boolean) => void;
}) {
  return (
    <div className="space-y-6 pr-2">
      {/* Card Type */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-400">Card Type</h3>
        <Select
          value={formData.card_type || ''}
          onValueChange={(v) => v != null && updateField('card_type', v)}
        >
          <SelectTrigger id="card_type">
            <SelectValue placeholder="Select card type" />
          </SelectTrigger>
          <SelectContent>
            {dropdownOptions.cardType.map((type) => (
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
                <SelectValue placeholder="Select" />
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
              placeholder="Siti Rahmah Binti Zulkifli"
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
                <SelectValue placeholder="Select" />
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
              value={formData.nationality || 'Malaysian'}
              onChange={(e) => updateField('nationality', e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="mykad_number">MyKad Number (without -)</Label>
            <Input
              id="mykad_number"
              value={formData.mykad_number || ''}
              onChange={(e) => updateField('mykad_number', e.target.value)}
              placeholder="960823045188"
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
              placeholder="DD/MM/YYYY"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="race">Race</Label>
            <Select
              value={formData.race || ''}
              onValueChange={(v) => v != null && updateField('race', v)}
            >
              <SelectTrigger id="race">
                <SelectValue placeholder="Select" />
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
                <SelectValue placeholder="Select" />
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
                <SelectValue placeholder="Select" />
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
              placeholder="0173896769"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="email_address">Email Address</Label>
            <Input
              id="email_address"
              type="email"
              value={formData.email_address || ''}
              onChange={(e) => updateField('email_address', e.target.value)}
              placeholder="siti.zulkifli2308@gmail.com"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="education_level">Education Level</Label>
            <Select
              value={formData.education_level || ''}
              onValueChange={(v) => v != null && updateField('education_level', v)}
            >
              <SelectTrigger id="education_level">
                <SelectValue placeholder="Select" />
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
              placeholder="Norhayati"
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
              placeholder="SITI RAHMAH"
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
            placeholder="58 jln semerbak 3 taman bukit dahlia 81700 pasir gudang johor"
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
                <SelectValue placeholder="Select" />
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
              <Checkbox
                id="related_to_bmm_staff"
                checked={formData.related_to_bmm_staff || false}
                onCheckedChange={(v) => updateField('related_to_bmm_staff', !!v)}
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
              placeholder="Hong Leong Bank Berhad"
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
              placeholder="e.g., Engineer, Doctor, Teacher"
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
              placeholder="e.g., Manager, Executive, MD"
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
                <SelectValue placeholder="Select" />
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
                <SelectValue placeholder="Select" />
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
              placeholder="078617488"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="employment_type">Employment Type</Label>
            <Select
              value={formData.employment_type || ''}
              onValueChange={(v) => v != null && updateField('employment_type', v)}
            >
              <SelectTrigger id="employment_type">
                <SelectValue placeholder="Select" />
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
              placeholder="Since: 01/08/2023"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="employment_sector">Employment Sector</Label>
            <Select
              value={formData.employment_sector || ''}
              onValueChange={(v) => v != null && updateField('employment_sector', v)}
            >
              <SelectTrigger id="employment_sector">
                <SelectValue placeholder="Select" />
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
            placeholder="35 jln johor 1 tmn Desa cemerlang 81800 ulu tiram johor"
            rows={2}
          />
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
              placeholder="3000"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="other_income_source">Other Income Source (RM)</Label>
            <Input
              id="other_income_source"
              value={formData.other_income_source || ''}
              onChange={(e) => updateField('other_income_source', e.target.value)}
              placeholder="0"
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
              placeholder="Syafiq"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="emergency_contact_number">Contact Number</Label>
            <Input
              id="emergency_contact_number"
              value={formData.emergency_contact_number || ''}
              onChange={(e) => updateField('emergency_contact_number', e.target.value)}
              placeholder="0173896769"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <Label htmlFor="emergency_relation">Relation</Label>
            <Input
              id="emergency_relation"
              value={formData.emergency_relation || ''}
              onChange={(e) => updateField('emergency_relation', e.target.value)}
              placeholder="Spouse"
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
            <Checkbox
              id="agree_tawarruq"
              checked={formData.agree_tawarruq || false}
              onCheckedChange={(v) => updateField('agree_tawarruq', !!v)}
            />
            <Label htmlFor="agree_tawarruq" className="text-sm">
              I Agree
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="agree_unspecified"
              checked={formData.agree_unspecified || false}
              onCheckedChange={(v) => updateField('agree_unspecified', !!v)}
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
            <Checkbox
              id="fatca_decl_1"
              checked={formData.fatca_decl_1 || false}
              onCheckedChange={(v) => updateField('fatca_decl_1', !!v)}
            />
            <Label htmlFor="fatca_decl_1" className="text-sm">
              No (1)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fatca_decl_2"
              checked={formData.fatca_decl_2 || false}
              onCheckedChange={(v) => updateField('fatca_decl_2', !!v)}
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
          <Checkbox
            id="tax_fatca_decl"
            checked={formData.tax_fatca_decl || false}
            onCheckedChange={(v) => updateField('tax_fatca_decl', !!v)}
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
          <Checkbox
            id="agree_declaration"
            checked={formData.agree_declaration || false}
            onCheckedChange={(v) => updateField('agree_declaration', !!v)}
          />
          <Label htmlFor="agree_declaration" className="text-sm">
            I agree to the Declaration & Personal Data Protection Act 2010
          </Label>
        </div>
      </div>
    </div>
  );
}
