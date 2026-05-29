import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { ApplicationFormData } from './types';
import fs from 'fs';
import path from 'path';

export async function fillPdfForm(data: ApplicationFormData): Promise<Uint8Array> {
  console.log('[PDF] Starting generation with data keys:', Object.keys(data));
  console.log('[PDF] mykad_number:', data.mykad_number);
  console.log('[PDF] employer_name:', data.employer_name);

  const templatePath = path.join(process.cwd(), 'public/templates/credit-card-application.pdf');

  if (!fs.existsSync(templatePath)) {
    console.error('[PDF] Template not found at:', templatePath);
    throw new Error(`PDF template not found at ${templatePath}`);
  }

  const pdfBytes = fs.readFileSync(templatePath);
  console.log('[PDF] Template loaded, size:', pdfBytes.length);

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  console.log('[PDF] Form loaded');

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
      if (field instanceof PDFCheckBox) {
        field.check();
      }
    } catch (e) {
      console.warn(`Checkbox not found: ${fieldName}`);
    }
  };

  const uncheckField = (fieldName: string) => {
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        field.uncheck();
      }
    } catch (e) {
      // Ignore
    }
  };

  // ==================== CARD TYPE ====================
  // Uncheck all card types first
  uncheckField('Visa Platinum-i Checkbutton');
  uncheckField('Visa Infinitei Checkbutton');
  uncheckField('Muamalat Pos Visa Platinum-i Checkbutton');
  uncheckField('Muamalat Eon Visa Platinum-i Checkbutton');
  uncheckField('Muamalat Pos Visa Infinite-i Checkbutton');
  uncheckField('Muamalat AmanahRaya Visa Platinum-i Checkbutton');
  uncheckField('Muamalat Eon Visa Infinite-i Checkbutton');

  if (data.card_type) {
    if (data.card_type === 'Visa Platinum-i') {
      setCheck('Visa Platinum-i Checkbutton', true);
    } else if (data.card_type === 'Visa Infinite-i') {
      setCheck('Visa Infinitei Checkbutton', true);
    }
    // Add more card type mappings as needed
  }

  // ==================== A. PERSONAL DETAILS ====================
  setText('Salutation', data.salutation);
  setText('Name', data.name_as_per_ic);

  // Gender
  uncheckField('Male Checkbutton');
  uncheckField('Female Checkbutton');
  if (data.gender === 'Male') {
    setCheck('Male Checkbutton', true);
  } else if (data.gender === 'Female') {
    setCheck('Female Checkbutton', true);
  }

  // Nationality
  uncheckField('Nationality - Malaysia');
  uncheckField('Nationality - Others');
  if (data.nationality?.toLowerCase() === 'malaysian') {
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
  setText('HP', data.hp_number);
  setText('email', data.email_address);

  // Name on Card - smart truncate to 19 characters
  const nameOnCard = truncateNameForCard(data.name_on_card || data.name_as_per_ic || '');
  setText('Name on Card', nameOnCard);

  // Address
  const address = data.residential_address || '';
  const addressLines = splitAddress(address, 2);
  setText('Residential Address 1', addressLines[0]);
  setText('Residential Address 2', addressLines[1]);

  // Parse postcode, city, state from address
  const { postcode, city, state } = parseMalaysianAddress(address);
  setText('Postcode', postcode || data.postcode);
  setText('City', city || data.city);
  setText('State', state || data.state);

  setText('Education Level', data.education_level);

  // BMMB Staff (default No)
  uncheckField('BMMB Staff Yes');
  uncheckField('BMMB Staff No');
  if (data.related_to_bmm_staff) {
    setCheck('BMMB Staff Yes', true);
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

  // Office Address
  const officeAddress = data.office_address || '';
  const officeAddressLines = splitAddress(officeAddress, 2);
  setText('Office Address  1', officeAddressLines[0]);
  setText('Office Address  2', officeAddressLines[1]);

  // Parse office postcode, city, state
  const officeParsed = parseMalaysianAddress(officeAddress);
  setText('Office Postcode', officeParsed.postcode);
  setText('Office City', officeParsed.city);
  setText('Office State', officeParsed.state);

  // ==================== C. APPLICANT'S INCOME ====================
  setText('Monthly Income', data.monthly_income);
  setText('Other Income', data.other_income_source);

  // ==================== D. EMERGENCY CONTACT ====================
  setText('Emergency Contact Name', data.emergency_full_name);
  setText('Emergency Contact Number', data.emergency_contact_number);
  setText('Emergency Relation', data.emergency_relation);

  // ==================== I. CREDIT CARD-i FINANCING ====================
  uncheckField('Agree Aqad');
  if (data.agree_tawarruq) {
    setCheck('Agree Aqad', true);
  }

  // ==================== J. FATCA/CRS DECLARATION ====================
  uncheckField('No US Citizen');
  uncheckField('Yes US Citizen');
  uncheckField('Yes Other Country Tax');
  uncheckField('No Other Country Tax');

  // fatca_decl_1 = true means "No" is checked
  if (data.fatca_decl_1) {
    setCheck('No US Citizen', true);
  } else {
    setCheck('Yes US Citizen', true);
  }

  // fatca_decl_2 = true means "No" is checked
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

  // ==================== SIGNATURE DATES ====================
  const today = new Date().toLocaleDateString('en-GB');
  setText('Main Name', data.name_as_per_ic);
  setText('Main Date', today);

  // Save the PDF
  const filledPdfBytes = await pdfDoc.save();
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

  // Pad with empty strings
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

  // Extract city (word after postcode, before state)
  let city: string | undefined;
  if (postcodeMatch && state) {
    const afterPostcode = address.substring(postcodeMatch.index! + postcodeMatch[0].length);
    const beforeState = afterPostcode.substring(0, afterPostcode.toLowerCase().indexOf(state.toLowerCase()));
    city = beforeState.trim().replace(/^\s+/, '').replace(/\s+$/, '');
  }

  return { postcode, city, state };
}

// Helper: Truncate name for card (max 19 characters)
// Smart truncation: tries to keep First Name + Last Name, always removes "Binti"/"Bin"
function truncateNameForCard(fullName: string): string {
  if (!fullName) return '';

  const MAX_CHARS = 19;

  // Remove extra spaces and trim
  const cleanName = fullName.replace(/\s+/g, ' ').trim().toUpperCase();

  // For Malay names: extract First Name + Last Name (skipping "BINTI"/"BIN")
  const parts = cleanName.split(' ');
  const firstName = parts[0];

  // Find last name (part after "BINTI" or "BIN")
  let lastName = '';
  let foundConnector = false;
  let partsWithoutConnector: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'BINTI' || parts[i] === 'BIN') {
      foundConnector = true;
      // Skip this connector, but continue to get the next part as last name
      continue;
    }
    partsWithoutConnector.push(parts[i]);
  }

  // Build name without connector
  let cardName = partsWithoutConnector.join(' ');

  // If still too long, try First Name + Last Word only
  if (cardName.length > MAX_CHARS && partsWithoutConnector.length > 1) {
    const lastWord = partsWithoutConnector[partsWithoutConnector.length - 1];
    const shortName = `${firstName} ${lastWord}`;
    if (shortName.length <= MAX_CHARS) {
      cardName = shortName;
    } else {
      // Still too long? Just use first name
      cardName = firstName;
    }
  }

  // First name too long? Truncate
  if (cardName.length > MAX_CHARS) {
    cardName = firstName.substring(0, MAX_CHARS);
  }

  return cardName;
}
