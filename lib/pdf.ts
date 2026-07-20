import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { ApplicationFormData } from './types';
import { getTemplateByBank } from './banks';
import { fillOCBCFormWithFields } from './pdf-ocbc';
import fs from 'fs';
import path from 'path';

export async function fillPdfForm(data: ApplicationFormData): Promise<Uint8Array> {
  console.log('[PDF] Starting generation with data keys:', Object.keys(data));
  console.log('[PDF] mykad_number:', data.mykad_number);
  console.log('[PDF] employer_name:', data.employer_name);
  console.log('[PDF] bank_id:', data.bank_id);

  // Get template based on bank selection
  const templateName = data.bank_id ? getTemplateByBank(data.bank_id) : 'muamalat application form.pdf';
  const templatePath = path.join(process.cwd(), 'public/templates', templateName);
  console.log('[PDF] Looking for template:', templateName);

  if (!fs.existsSync(templatePath)) {
    console.error('[PDF] Template not found:', templatePath);
    throw new Error(`PDF template not found: ${templateName}`);
  }

  const pdfBytes = fs.readFileSync(templatePath);
  console.log('[PDF] Template loaded, size:', pdfBytes.length);

  // Route to appropriate bank form filler
  if (data.bank_id === 'ocbc') {
    return await fillOCBCFormWithFields(pdfBytes, data);
  }

  // Default to Bank Muamalat
  return await fillBankMuamalatForm(pdfBytes, data);
}

// OCBC form filling
async function fillOCBCForm(pdfBytes: Buffer, data: ApplicationFormData): Promise<Uint8Array> {
  console.log('[PDF] OCBC form detected - returning blank form for manual filling');
  console.log('[PDF] OCBC PDF has no fillable fields - user will need to fill manually');

  // OCBC PDF is static (no form fields), so return it as-is
  // User will need to fill it manually using the extracted data
  return new Uint8Array(pdfBytes);
}

// Bank Muamalat form filling
async function fillBankMuamalatForm(pdfBytes: Buffer, data: ApplicationFormData): Promise<Uint8Array> {
  // Load PDF with options to handle complex forms
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false
  });
  const form = pdfDoc.getForm();
  console.log('[PDF] Bank Muamalat form loaded');

  // Helper functions

  // Helper functions
  const setText = (fieldName: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFTextField) {
        field.setText(value);
      }
    } catch (e) {
      console.warn(`Field not found: ${fieldName}`);
    }
  };

  // Remove commas from city, postcode, state fields
  const sanitizeLocation = (value: string | null | undefined): string => {
    if (!value) return '';
    return String(value).replace(/,/g, '').trim();
  };

  const setCheck = (fieldName: string, checked: boolean) => {
    if (!checked) return;
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        field.check();
      }
    } catch (e) {
      console.warn(`Checkbox field not found: ${fieldName}`);
    }
  };

  const uncheckField = (fieldName: string) => {
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        field.uncheck();
      }
    } catch (e) {
      // Ignore - field might not exist
    }
  };

  // ==================== CARD TYPE ====================
  // Uncheck all card type checkboxes first
  const cardTypeCheckboxes = [
    'Visa Platinum-i Checkbutton',
    'Visa Infinitei Checkbutton',
    'Muamalat Pos Visa Platinum-i Checkbutton',
    'Muamalat Eon Visa Platinum-i Checkbutton',
    'Muamalat Pos Visa Infinite-i Checkbutton',
    'Muamalat AmanahRaya Visa Platinum-i Checkbutton',
    'Muamalat Eon Visa Infinite-i Checkbutton',
  ];
  cardTypeCheckboxes.forEach(cb => uncheckField(cb));

  // Check the selected card type
  if (data.card_type) {
    const cardTypeMapping: Record<string, string> = {
      'Visa Platinum-i': 'Visa Platinum-i Checkbutton',
      'Visa Infinite-i': 'Visa Infinitei Checkbutton',
      'Muamalat Eon Visa Platinum-i': 'Muamalat Eon Visa Platinum-i Checkbutton',
      'Muamalat Eon Visa Infinite-i': 'Muamalat Eon Visa Infinite-i Checkbutton',
      'Muamalat Pos Visa Platinum-i': 'Muamalat Pos Visa Platinum-i Checkbutton',
      'Muamalat Pos Visa Infinite-i': 'Muamalat Pos Visa Infinite-i Checkbutton',
      'Muamalat AmanahRaya Visa Platinum-i': 'Muamalat AmanahRaya Visa Platinum-i Checkbutton',
    };
    const checkboxName = cardTypeMapping[data.card_type];
    if (checkboxName) {
      setCheck(checkboxName, true);
    }
  }

  // ==================== A. PERSONAL DETAILS ====================
  setText('Salutation', data.salutation);
  setText('Name', data.name_as_per_ic);

  // ==================== GENDER ====================
  uncheckField('Male Checkbutton');
  uncheckField('Female Checkbutton');
  if (data.gender === 'Male') {
    setCheck('Male Checkbutton', true);
  } else if (data.gender === 'Female') {
    setCheck('Female Checkbutton', true);
  }

  // ==================== NATIONALITY ====================
  uncheckField('Nationality - Malaysia');
  uncheckField('Nationality - Others');
  const nationalityLower = String(data.nationality || '').toLowerCase().trim();
  if (nationalityLower === 'malaysian' || nationalityLower === 'malaysia') {
    setCheck('Nationality - Malaysia', true);
  } else {
    setCheck('Nationality - Others', true);
    setText('Others - Nationality', data.nationality);
  }

  setText('MyKad', data.mykad_number);
  setText('Date of Birth', data.date_of_birth);
  setText('Mothers Maiden Name', data.mother_name);
  setText('Race', data.race);
  setText('Religion', data.religion);
  setText('Marital Status', data.marital_status);
  setText('House Tel', data.house_tel_no);
  setText('HP', data.hp_number);
  setText('email', data.email_address);

  // Police/Military ID
  setText('Police Military ID', data.police_military_id);

  const nameOnCard = truncateNameForCard(data.name_on_card || data.name_as_per_ic || '');
  setText('Name on Card', nameOnCard);

  const address = data.residential_address || '';
  const addressLines = splitAddress(address, 2);
  setText('Residential Address 1', addressLines[0]);
  setText('Residential Address 2', addressLines[1]);

  // Use explicit fields if provided, otherwise parse from address
  const { postcode, city, state } = parseMalaysianAddress(address);
  setText('Postcode', sanitizeLocation(data.postcode || postcode));
  setText('City', sanitizeLocation(data.city || city));
  setText('State', sanitizeLocation(data.state || state));

  // Correspondence Address (if different from residential)
  if (data.correspondence_address) {
    const corrAddressLines = splitAddress(data.correspondence_address, 2);
    setText('Correspondence Address 1', corrAddressLines[0]);
    setText('Correspondence Address 2', corrAddressLines[1]);
    setText('Correspondence Postcode', sanitizeLocation(data.correspondence_postcode));
    setText('Correspondence City', sanitizeLocation(data.correspondence_city));
    setText('Correspondence State', sanitizeLocation(data.correspondence_state));
  }

  setText('Education Level', data.education_level);

  uncheckField('BMMB Staff Yes');
  uncheckField('BMMB Staff No');
  if (data.related_to_bmm_staff) {
    setCheck('BMMB Staff Yes', true);
    // BMMB Staff details (if related)
    setText('BMM Staff Name', data.bmm_staff_name);
    setText('BMM Staff ID', data.bmm_staff_id);
    setText('BMM Staff Relationship', data.bmm_staff_relationship);
    setText('BMM Staff Department', data.bmm_staff_department);
  } else {
    setCheck('BMMB Staff No', true);
  }

  // ==================== B. EMPLOYMENT DETAILS ====================
  setText('Employer Name', data.employer_name);
  setText('Position', data.position);
  setText('Occupation', data.occupation);
  setText('Employment Status', data.employment_status);
  setText('Business Clasification', data.business_classification);
  setText('Office Tel', data.office_number);
  setText('Employment Type', data.employment_type);
  setText('Length of Service', data.length_of_service);
  setText('Employment Sector', data.employment_sector);

  const officeAddress = data.office_address || '';
  const officeAddressLines = splitAddress(officeAddress, 2);
  setText('Office Address  1', officeAddressLines[0]);
  setText('Office Address  2', officeAddressLines[1]);

  // Use explicit fields if provided, otherwise parse from address
  const officeParsed = parseMalaysianAddress(officeAddress);
  setText('Office Postcode', sanitizeLocation(data.office_postcode || officeParsed.postcode));
  setText('Office City', sanitizeLocation(data.office_city || officeParsed.city));
  setText('Office State', sanitizeLocation(data.office_state || officeParsed.state));

  // ==================== C. APPLICANT'S INCOME ====================
  setText('Monthly Income', data.monthly_income);
  setText('Other Income', data.other_income_source);
  setText('Monthly Commitment', data.monthly_commitment);

  // ==================== D. EMERGENCY CONTACT ====================
  setText('Emergency Contact Name', data.emergency_full_name);
  setText('Emergency Contact Number', data.emergency_contact_number);
  setText('Emergency Relation', data.emergency_relation);

  // ==================== I. CREDIT CARD-i FINANCING ====================
  // Financing limit type
  uncheckField('Financing Specified');
  uncheckField('Financing Unspecified');
  if (data.financing_limit_type === 'specified') {
    setCheck('Financing Specified', true);
    setText('Specified Financing Limit', data.specified_financing_limit);
  } else {
    setCheck('Financing Unspecified', true);
  }

  uncheckField('Agree Aqad');
  if (data.agree_tawarruq) {
    setCheck('Agree Aqad', true);
  }

  // Unspecified checkbox
  if (data.agree_unspecified) {
    setCheck('Agree Unspecified', true);
  }

  // ==================== J. FATCA/CRS DECLARATION ====================
  uncheckField('No US Citizen');
  uncheckField('Yes US Citizen');
  uncheckField('Yes Other Country Tax');
  uncheckField('No Other Country Tax');

  if (data.fatca_decl_1) {
    setCheck('No US Citizen', true);
  } else {
    setCheck('Yes US Citizen', true);
  }

  if (data.fatca_decl_2) {
    setCheck('No Other Country Tax', true);
  } else {
    setCheck('Yes Other Country Tax', true);
  }

  // ==================== K. TAX AND FATCA DECLARATION ====================
  uncheckField('Agree Tax Fatca');
  uncheckField('Disagree');
  if (data.tax_fatca_decl) {
    setCheck('Agree Tax Fatca', true);
  } else {
    setCheck('Disagree', true);
  }

  // ==================== L. DECLARATION ====================
  uncheckField('Agree Declare');
  if (data.agree_declaration) {
    setCheck('Agree Declare', true);
  }

  // ==================== AGENT / SALES EXECUTIVE INFO ====================
  // Field names match the "Agent Name / Agent IC / Staff ID" fields added to
  // the Muamalat template. Values come from the logged-in user's profile,
  // injected server-side in app/api/generate-pdf/route.ts.
  setText('Agent Name', data.agent_name);
  setText('Agent IC', data.agent_ic);
  setText('Staff ID', data.agent_staff_id);

  // ==================== SIGNATURE DATES ====================
  const today = new Date().toLocaleDateString('en-GB');
  setText('Main Name', data.name_as_per_ic);
  setText('Main Date', today);

  // Bake appearance streams so viewers that don't honor NeedAppearances
  // (Preview, Adobe mobile) still render filled values for on-page fields.
  try {
    form.updateFieldAppearances();
  } catch (e) {
    console.warn('[PDF] updateFieldAppearances failed:', e);
  }

  const filledPdfBytes = await pdfDoc.save();
  console.log('[PDF] PDF saved successfully');
  return new Uint8Array(filledPdfBytes);
}

// Helper: Split address into lines
function splitAddress(address: string, maxLines: number): string[] {
  const lines: string[] = [];
  const words = address.split(' ');
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= 50) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        lines.push(currentLine);
        currentLine = '';
        break;
      }
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  while (lines.length < maxLines) {
    lines.push('');
  }

  return lines;
}

// Helper: Parse Malaysian address
function parseMalaysianAddress(address: string): { postcode?: string; city?: string; state?: string } {
  const postcodeMatch = address.match(/\b(\d{5})\b/);
  const postcode = postcodeMatch ? postcodeMatch[1] : undefined;

  const states = [
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
    'Pulau Pinang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
    'Kuala Lumpur', 'Labuan', 'Putrajaya', 'WP Kuala Lumpur', 'WP Labuan', 'WP Putrajaya'
  ];

  let state: string | undefined;
  for (const s of states) {
    if (address.toLowerCase().includes(s.toLowerCase())) {
      state = s.replace('WP ', '');
      break;
    }
  }

  let city: string | undefined;
  if (postcodeMatch && state) {
    const afterPostcode = address.substring(postcodeMatch.index! + postcodeMatch[0].length);
    const beforeState = afterPostcode.substring(0, afterPostcode.toLowerCase().indexOf(state.toLowerCase()));
    city = beforeState.trim().replace(/^\s+/, '').replace(/\s+$/, '');
  }

  return { postcode, city, state };
}

// Helper: Truncate name for card (max 19 characters)
function truncateNameForCard(fullName: string): string {
  if (!fullName) return '';

  const MAX_CHARS = 19;
  const cleanName = fullName.replace(/\s+/g, ' ').trim().toUpperCase();
  const parts = cleanName.split(' ');
  const firstName = parts[0];

  let partsWithoutConnector: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'BINTI' || parts[i] === 'BIN') {
      continue;
    }
    partsWithoutConnector.push(parts[i]);
  }

  let cardName = partsWithoutConnector.join(' ');

  if (cardName.length > MAX_CHARS && partsWithoutConnector.length > 1) {
    const lastWord = partsWithoutConnector[partsWithoutConnector.length - 1];
    const shortName = `${firstName} ${lastWord}`;
    if (shortName.length <= MAX_CHARS) {
      cardName = shortName;
    } else {
      cardName = firstName;
    }
  }

  if (cardName.length > MAX_CHARS) {
    cardName = firstName.substring(0, MAX_CHARS);
  }

  return cardName;
}
