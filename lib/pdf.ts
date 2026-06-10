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
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  console.log('[PDF] Bank Muamalat form loaded');

  // Debug: List all available fields
  const allFields = form.getFields();
  const fieldNames = allFields.map(f => f.getName());
  console.log('[PDF] Total fields in form:', fieldNames.length);
  console.log('[PDF] All fields in form:', fieldNames);

  // Find gender and nationality related fields
  const genderFields = fieldNames.filter(n => n.toLowerCase().includes('gender') || n.toLowerCase().includes('male') || n.toLowerCase().includes('female'));
  const nationalityFields = fieldNames.filter(n => n.toLowerCase().includes('nationality') || n.toLowerCase().includes('malaysia'));
  console.log('[PDF] Gender-related fields found:', genderFields);
  console.log('[PDF] Nationality-related fields found:', nationalityFields);

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

  const setCheck = (fieldName: string, checked: boolean) => {
    if (!checked) return;
    try {
      const field = form.getField(fieldName);
      console.log(`[PDF] Found field "${fieldName}":`, field.constructor.name);
      if (field instanceof PDFCheckBox) {
        // First uncheck to ensure clean state
        try {
          field.uncheck();
        } catch (e) {
          // Ignore
        }
        // Then check
        field.check();
        console.log(`[PDF] Checked: ${fieldName}`);
      } else {
        console.warn(`[PDF] Field "${fieldName}" is not a checkbox, it's a ${field.constructor.name}`);
      }
    } catch (e) {
      console.warn(`[PDF] Checkbox not found: "${fieldName}"`, e);
    }
  };

  const uncheckField = (fieldName: string) => {
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        field.uncheck();
        console.log(`[PDF] Unchecked: ${fieldName}`);
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

  console.log('[PDF] ==================== GENDER ====================');
  console.log('[PDF] Raw gender value:', data.gender, '(type:', typeof data.gender + ')');
  // First, clear both checkboxes manually
  try {
    const maleField = form.getField('Male Checkbutton');
    if (maleField instanceof PDFCheckBox) {
      maleField.uncheck();
      console.log('[PDF] Unchecked Male Checkbutton manually');
    }
  } catch (e) {
    console.warn('[PDF] Could not uncheck Male:', e);
  }
  try {
    const femaleField = form.getField('Female Checkbutton');
    if (femaleField instanceof PDFCheckBox) {
      femaleField.uncheck();
      console.log('[PDF] Unchecked Female Checkbutton manually');
    }
  } catch (e) {
    console.warn('[PDF] Could not uncheck Female:', e);
  }

  // Now check the appropriate one
  if (data.gender === 'Male') {
    console.log('[PDF] Checking Male Checkbutton');
    try {
      const maleField = form.getField('Male Checkbutton');
      if (maleField instanceof PDFCheckBox) {
        maleField.check();
        console.log('[PDF] SUCCESS: Male checkbox checked');
      }
    } catch (e) {
      console.error('[PDF] ERROR checking Male:', e);
    }
  } else if (data.gender === 'Female') {
    console.log('[PDF] Checking Female Checkbutton');
    try {
      const femaleField = form.getField('Female Checkbutton');
      if (femaleField instanceof PDFCheckBox) {
        femaleField.check();
        console.log('[PDF] SUCCESS: Female checkbox checked');
      }
    } catch (e) {
      console.error('[PDF] ERROR checking Female:', e);
    }
  } else {
    console.log('[PDF] No gender match found for:', data.gender);
  }

  console.log('[PDF] ==================== NATIONALITY ====================');
  console.log('[PDF] Raw nationality value:', data.nationality, '(type:', typeof data.nationality + ')');
  const nationalityLower = String(data.nationality || '').toLowerCase().trim();
  console.log('[PDF] Normalized nationality:', nationalityLower);

  // First, clear both checkboxes manually
  try {
    const malaysiaField = form.getField('Nationality - Malaysia');
    if (malaysiaField instanceof PDFCheckBox) {
      malaysiaField.uncheck();
      console.log('[PDF] Unchecked Nationality - Malaysia manually');
    }
  } catch (e) {
    console.warn('[PDF] Could not uncheck Malaysia:', e);
  }
  try {
    const othersField = form.getField('Nationality - Others');
    if (othersField instanceof PDFCheckBox) {
      othersField.uncheck();
      console.log('[PDF] Unchecked Nationality - Others manually');
    }
  } catch (e) {
    console.warn('[PDF] Could not uncheck Others:', e);
  }

  // Now check the appropriate one
  if (nationalityLower === 'malaysian' || nationalityLower === 'malaysia') {
    console.log('[PDF] Checking Nationality - Malaysia');
    try {
      const malaysiaField = form.getField('Nationality - Malaysia');
      if (malaysiaField instanceof PDFCheckBox) {
        malaysiaField.check();
        console.log('[PDF] SUCCESS: Malaysia checkbox checked');
      }
    } catch (e) {
      console.error('[PDF] ERROR checking Malaysia:', e);
    }
  } else {
    console.log('[PDF] Checking Nationality - Others');
    try {
      const othersField = form.getField('Nationality - Others');
      if (othersField instanceof PDFCheckBox) {
        othersField.check();
        console.log('[PDF] SUCCESS: Others checkbox checked');
      }
    } catch (e) {
      console.error('[PDF] ERROR checking Others:', e);
    }
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
  setText('Postcode', data.postcode || postcode);
  setText('City', data.city || city);
  setText('State', data.state || state);

  // Correspondence Address (if different from residential)
  if (data.correspondence_address) {
    const corrAddressLines = splitAddress(data.correspondence_address, 2);
    setText('Correspondence Address 1', corrAddressLines[0]);
    setText('Correspondence Address 2', corrAddressLines[1]);
    setText('Correspondence Postcode', data.correspondence_postcode);
    setText('Correspondence City', data.correspondence_city);
    setText('Correspondence State', data.correspondence_state);
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
  setText('Office Postcode', data.office_postcode || officeParsed.postcode);
  setText('Office City', data.office_city || officeParsed.city);
  setText('Office State', data.office_state || officeParsed.state);

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

  // ==================== SALES EXECUTIVE INFO (For BMMB Use Only) ====================
  setText('Sales Exec Name', data.sales_exec_name);
  setText('Sales Exec IC', data.sales_exec_ic);
  setText('Sales Exec Staff ID', data.sales_exec_staff_id);
  setText('Sales Exec Email', data.sales_exec_email);
  setText('Branch Name', data.branch_name);
  setText('Branch Tel', data.branch_tel_no);
  setText('Branch Manager Name', data.branch_manager_name);
  setText('Branch Manager Email', data.branch_manager_email);

  // ==================== SIGNATURE DATES ====================
  const today = new Date().toLocaleDateString('en-GB');
  setText('Main Name', data.name_as_per_ic);
  setText('Main Date', today);

  // Before saving, verify checkboxes are set
  try {
    const maleCheck = form.getField('Male Checkbutton');
    console.log('[PDF] Final state - Male checkbox checked:', (maleCheck as any)?.isChecked?.());
  } catch (e) { }

  try {
    const malaysiaCheck = form.getField('Nationality - Malaysia');
    console.log('[PDF] Final state - Malaysia checkbox checked:', (malaysiaCheck as any)?.isChecked?.());
  } catch (e) { }

  // Update field appearances to ensure checkboxes are visible
  try {
    form.updateFieldAppearances();
    console.log('[PDF] Field appearances updated');
  } catch (e) {
    console.warn('[PDF] Could not update field appearances:', e);
  }

  // Flatten the form to "burn in" the field values
  // This makes checkboxes visible in all PDF viewers
  try {
    form.flatten();
    console.log('[PDF] Form flattened - checkboxes should now be visible');
  } catch (e) {
    console.warn('[PDF] Could not flatten form:', e);
  }

  const filledPdfBytes = await pdfDoc.save();
  console.log('[PDF] PDF saved, size:', filledPdfBytes.length);
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
