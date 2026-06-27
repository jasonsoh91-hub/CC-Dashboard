import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { ApplicationFormData } from './types';

// OCBC field mappings - maps our extracted data to OCBC PDF field names
const OCBC_FIELD_MAPPINGS = {
  // Personal Information
  name: 'customer_name_principle',
  ic_number: 'NRIC_principle',
  nric_part1: 'new_NRIC_first_6_digit', // First 6 digits
  nric_part2: 'new_NRIC_second_2_digit', // Next 2 digits
  nric_part3: 'new_NRIC_third_4_digit', // Last 4 digits
  full_name: 'Full_Name',
  date_of_birth: ['DOB_DD', 'DOB_MM', 'DOB_YYYY'], // Split DD/MM/YYYY
  mother_name: ['mother_maiden_1', 'mother_maiden_2'], // Split into 2 fields

  // Salutation (checkboxes)
  salutation_mr: 'Mr',
  salutation_mdm: 'Mdm',
  salutation_ms: 'Ms',
  salutation_others: 'others',

  // Gender (checkboxes)
  gender_male: 'male',
  gender_female: 'female',

  // Nationality (checkboxes)
  nationality_malaysia: 'malaysia',

  // Race (checkboxes + fill field)
  race_malay: 'malay',
  race_chinese: 'chinese',
  race_indian: 'indian',
  race_others_fill: 'race_others_fill',
  race_others_check: 'race_others',

  // Bumiputera (checkboxes)
  bumiputera: 'bumiputera',
  non_bumiputera: 'non-bumiputera',

  // Education (checkboxes)
  edu_certificate: 'certificate',
  edu_master: 'master',
  edu_primary: 'primary_school',
  edu_diploma: 'diploma',
  edu_secondary: 'secondary_school',
  edu_degree: 'degree',
  edu_professional: 'professional',

  // Marital Status (checkboxes)
  marital_single: 'marital_single',
  marital_married: 'marital_married',
  marital_divorced: 'marital_divorced',
  marital_widowed: 'marital_widowed',

  // Employment Status (checkboxes)
  emp_salaried: 'salaried',
  emp_government: 'government_employee',
  emp_self_employed: 'self_employed',
  emp_director: 'company_director',
  emp_commission: 'commission',

  // Card Selection (checkboxes)
  card_90n: 'checkbox_90N',
  card_cashflo: 'checkbox_Cashflo',
  card_titanium_blue: 'checkbox_Tita_Blue',
  card_titanium_pink: 'checkbox_Tita_Pink',
  card_365: 'checkbox_365',
  card_great_eastern: 'checkbox_GreatEastern',

  // Contact
  email: 'email',
  hp_first_3: 'hp_first_3',
  hp_second_8: 'hp_second_8',

  // Passport (OCBC specific)
  passport_number: 'passport_number',
  passport_expiry_day: 'passport_expiry_day',
  passport_expiry_month: 'passport_expiry_month',
  passport_expiry_year: 'passport_expiry_year',
  old_nric: 'old_NRIC',

  // Address
  home_address_1: 'home_address_1',
  home_address_2: 'home_address_2',
  postcode: 'postcode',
  city: 'city',
  state: 'state',
  country: 'country',

  // Employment
  employer_name: 'employer_name',
  occupation: 'occupation',
  nature_business: 'nature_business', // Position/nature of business
  office_address_1: 'office_address_1',
  office_address_2: 'office_address_2',
  office_city: 'office_city',
  office_state: 'office_state',
  office_postcode: 'office_postcode',
  office_country: 'office_country',
  gross_monthly_income: 'gross_monthly_income',
  office_tel_1: 'office_tel_1',
  office_tel_2: 'office_tel_2',
  date_joined_mm: 'date_joined_MM',
  date_joined_yyyy: 'Date_join_YYYY',

  // Emergency Contact
  emergency_name: 'emergency_contact_name',
  emergency_relation: 'emergency_contact_relationship',
  emergency_phone1: 'emergency_contact_number1',
  emergency_phone2: 'emergency_contact_number2',

  // Name on Card
  name_on_card: 'Name_on_card',

  // Supplementary Card (if applicable)
  sup_name: 'customer_name_supplement',
  sup_nric: 'NRIC_supplement',

  // Page 8 Declaration fields
  page8_full_name: 'full_name',
  page8_nric: 'NRIC',
};

export async function fillOCBCFormWithFields(pdfBytes: Buffer, data: ApplicationFormData): Promise<Uint8Array> {
  console.log('[PDF] Filling OCBC form with fillable fields');

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  console.log('[PDF] OCBC form loaded with', form.getFields().length, 'fields');

  // Helper to set text field - using native form positioning for accuracy
  const setText = (fieldName: string, value: string | null | undefined) => {
    if (!value || value === 'null' || value === 'undefined') return;
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFTextField) {
        field.setText(value.toString().trim());
        console.log(`[OCBC] Set ${fieldName} = "${value}"`);
      }
    } catch (e) {
      console.warn(`[OCBC] Field not found: ${fieldName}`);
    }
  };

  // Helper to check checkbox
  const setCheck = (fieldName: string, checked: boolean) => {
    if (!checked) {
      // Uncheck if false
      try {
        const field = form.getField(fieldName);
        if (field instanceof PDFCheckBox) {
          field.uncheck();
        }
      } catch (e) {
        // Ignore
      }
      return;
    }
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        field.check();
        console.log(`[OCBC] Checked ${fieldName}`);
      }
    } catch (e) {
      console.warn(`[OCBC] Checkbox not found: ${fieldName}`);
    }
  };

  // ==================== PERSONAL INFORMATION ====================
  setText(OCBC_FIELD_MAPPINGS.name, data.name_as_per_ic);
  setText(OCBC_FIELD_MAPPINGS.ic_number, data.mykad_number);
  setText(OCBC_FIELD_MAPPINGS.full_name, data.name_as_per_ic);
  setText(OCBC_FIELD_MAPPINGS.name_on_card, data.name_on_card || data.name_as_per_ic);

  // NRIC - split into 3 parts (6 digits, 2 digits, 4 digits)
  if (data.mykad_number) {
    const nric = data.mykad_number.replace(/[^\d]/g, '');
    if (nric.length === 12) {
      setText(OCBC_FIELD_MAPPINGS.nric_part1, nric.substring(0, 6)); // First 6 digits (YYMMDD)
      setText(OCBC_FIELD_MAPPINGS.nric_part2, nric.substring(6, 8)); // Next 2 digits (PB)
      setText(OCBC_FIELD_MAPPINGS.nric_part3, nric.substring(8, 12)); // Last 4 digits (###G)
    }
  }

  // Date of Birth - split DD/MM/YYYY
  if (data.date_of_birth) {
    const parts = data.date_of_birth.split('/');
    setText(OCBC_FIELD_MAPPINGS.date_of_birth[0], parts[0]); // DD
    setText(OCBC_FIELD_MAPPINGS.date_of_birth[1], parts[1]); // MM
    setText(OCBC_FIELD_MAPPINGS.date_of_birth[2], parts[2]); // YYYY
  }

  // Mother's Maiden Name - split into 2 fields
  if (data.mother_name) {
    const words = data.mother_name.split(' ');
    const first = words[0] || '';
    const second = words.slice(1).join(' ') || '';
    setText(OCBC_FIELD_MAPPINGS.mother_name[0], first);
    setText(OCBC_FIELD_MAPPINGS.mother_name[1], second);
  }

  // Salutation (OCBC uses Mdm for Mrs)
  setCheck(OCBC_FIELD_MAPPINGS.salutation_mr, data.salutation === 'Mr');
  setCheck(OCBC_FIELD_MAPPINGS.salutation_mdm, data.salutation === 'Mrs');
  setCheck(OCBC_FIELD_MAPPINGS.salutation_ms, data.salutation === 'Ms');
  setCheck(OCBC_FIELD_MAPPINGS.salutation_others, !!data.salutation && !['Mr', 'Mrs', 'Ms'].includes(data.salutation));

  // Gender
  setCheck(OCBC_FIELD_MAPPINGS.gender_male, data.gender === 'Male');
  setCheck(OCBC_FIELD_MAPPINGS.gender_female, data.gender === 'Female');

  // Nationality
  setCheck(OCBC_FIELD_MAPPINGS.nationality_malaysia, data.nationality?.toLowerCase() === 'malaysian');

  // Race
  setCheck(OCBC_FIELD_MAPPINGS.race_malay, data.race === 'Malay');
  setCheck(OCBC_FIELD_MAPPINGS.race_chinese, data.race === 'Chinese');
  setCheck(OCBC_FIELD_MAPPINGS.race_indian, data.race === 'Indian');
  if (data.race && !['Malay', 'Chinese', 'Indian'].includes(data.race)) {
    setCheck(OCBC_FIELD_MAPPINGS.race_others_check, true);
    setText(OCBC_FIELD_MAPPINGS.race_others_fill, data.race);
  }

  // Bumiputera status
  if (data.race === 'Malay') {
    setCheck(OCBC_FIELD_MAPPINGS.bumiputera, true);
  } else {
    setCheck(OCBC_FIELD_MAPPINGS.non_bumiputera, true);
  }

  // Education Level
  const edu = data.education_level?.toLowerCase() || '';
  setCheck(OCBC_FIELD_MAPPINGS.edu_primary, edu.includes('primary'));
  setCheck(OCBC_FIELD_MAPPINGS.edu_secondary, edu.includes('secondary'));
  setCheck(OCBC_FIELD_MAPPINGS.edu_diploma, edu.includes('diploma'));
  setCheck(OCBC_FIELD_MAPPINGS.edu_degree, edu === 'degree');
  setCheck(OCBC_FIELD_MAPPINGS.edu_master, edu.includes('master') || edu.includes('doctorate'));
  setCheck(OCBC_FIELD_MAPPINGS.edu_professional, edu.includes('professional'));

  // Marital Status
  setCheck(OCBC_FIELD_MAPPINGS.marital_single, data.marital_status === 'Single');
  setCheck(OCBC_FIELD_MAPPINGS.marital_married, data.marital_status === 'Married');
  setCheck(OCBC_FIELD_MAPPINGS.marital_divorced, data.marital_status === 'Divorced');
  setCheck(OCBC_FIELD_MAPPINGS.marital_widowed, false);

  // Employment Status
  const emp = data.employment_status?.toLowerCase() || '';
  setCheck(OCBC_FIELD_MAPPINGS.emp_salaried, emp === 'employed' || emp.includes('salaried'));
  setCheck(OCBC_FIELD_MAPPINGS.emp_government, emp.includes('government'));
  setCheck(OCBC_FIELD_MAPPINGS.emp_self_employed, emp === 'self-employed' || emp.includes('self'));
  setCheck(OCBC_FIELD_MAPPINGS.emp_director, emp.includes('director'));

  // Card Selection
  const card = data.card_type || '';
  setCheck(OCBC_FIELD_MAPPINGS.card_90n, card === '90°N Visa Card');
  setCheck(OCBC_FIELD_MAPPINGS.card_cashflo, card === 'Cashflo Mastercard');
  setCheck(OCBC_FIELD_MAPPINGS.card_titanium_blue, card === 'Titanium Card (Blue)');
  setCheck(OCBC_FIELD_MAPPINGS.card_titanium_pink, card === 'Titanium Card (Pink)');
  setCheck(OCBC_FIELD_MAPPINGS.card_365, card === '365 Mastercard');
  setCheck(OCBC_FIELD_MAPPINGS.card_great_eastern, card === 'Great Eastern Platinum Mastercard');

  // Contact
  setText(OCBC_FIELD_MAPPINGS.email, data.email_address);

  // HP Number - split into first 3 and last 8 digits
  if (data.hp_number) {
    const hp = data.hp_number.replace(/[^\d]/g, '');
    setText(OCBC_FIELD_MAPPINGS.hp_first_3, hp.substring(0, 3));
    setText(OCBC_FIELD_MAPPINGS.hp_second_8, hp.substring(3, 11));
  }

  // Passport (OCBC specific)
  setText(OCBC_FIELD_MAPPINGS.passport_number, data.passport_number);
  if (data.passport_expiry_day && data.passport_expiry_month && data.passport_expiry_year) {
    setText(OCBC_FIELD_MAPPINGS.passport_expiry_day, data.passport_expiry_day);
    setText(OCBC_FIELD_MAPPINGS.passport_expiry_month, data.passport_expiry_month);
    setText(OCBC_FIELD_MAPPINGS.passport_expiry_year, data.passport_expiry_year);
  }
  setText(OCBC_FIELD_MAPPINGS.old_nric, data.old_nric);

  // Address
  const address = data.residential_address || '';
  const addressLines = address.split(',').map(s => s.trim());
  setText(OCBC_FIELD_MAPPINGS.home_address_1, addressLines[0] || '');
  setText(OCBC_FIELD_MAPPINGS.home_address_2, addressLines.slice(1).join(', ') || '');

  // Parse postcode, city, state
  const parsedAddress = parseMalaysianAddress(address);
  setText(OCBC_FIELD_MAPPINGS.postcode, parsedAddress.postcode || data.postcode);
  setText(OCBC_FIELD_MAPPINGS.city, parsedAddress.city || data.city);
  setText(OCBC_FIELD_MAPPINGS.state, parsedAddress.state || data.state);
  setText(OCBC_FIELD_MAPPINGS.country, 'Malaysia');

  // Employment
  setText(OCBC_FIELD_MAPPINGS.employer_name, data.employer_name);
  setText(OCBC_FIELD_MAPPINGS.occupation, data.occupation);
  setText(OCBC_FIELD_MAPPINGS.nature_business, data.business_classification); // Nature of business

  // Office Address
  const officeAddress = data.office_address || '';
  const officeLines = officeAddress.split(',').map(s => s.trim());
  setText(OCBC_FIELD_MAPPINGS.office_address_1, officeLines[0] || '');
  setText(OCBC_FIELD_MAPPINGS.office_address_2, officeLines.slice(1).join(', ') || '');
  setText(OCBC_FIELD_MAPPINGS.office_city, data.employer_address?.split(',').map(s => s.trim())[1] || '');
  setText(OCBC_FIELD_MAPPINGS.office_state, data.employer_address?.split(',').map(s => s.trim())[2] || '');

  const officeParsed = parseMalaysianAddress(officeAddress);
  setText(OCBC_FIELD_MAPPINGS.office_postcode, officeParsed.postcode);
  setText(OCBC_FIELD_MAPPINGS.office_country, 'Malaysia');

  // Office Phone - split into 2 fields
  if (data.office_number) {
    const office = data.office_number.replace(/[^\d]/g, '');
    setText(OCBC_FIELD_MAPPINGS.office_tel_1, office.substring(0, 3));
    setText(OCBC_FIELD_MAPPINGS.office_tel_2, office.substring(3));
  }

  // Date Joined - split MM/YYYY
  if (data.length_of_service || data.work_since) {
    const dateStr = data.work_since || data.length_of_service || '';
    const match = dateStr.match(/(\d{1,2})\/(\d{4})/);
    if (match) {
      setText(OCBC_FIELD_MAPPINGS.date_joined_mm, match[1]);
      setText(OCBC_FIELD_MAPPINGS.date_joined_yyyy, match[2]);
    }
  }

  // Income
  setText(OCBC_FIELD_MAPPINGS.gross_monthly_income, data.monthly_income);

  // Emergency Contact
  setText(OCBC_FIELD_MAPPINGS.emergency_name, data.emergency_full_name);
  setText(OCBC_FIELD_MAPPINGS.emergency_relation, data.emergency_relation);

  // Emergency Phone - split into 2 fields
  if (data.emergency_contact_number) {
    const emergency = data.emergency_contact_number.replace(/[^\d]/g, '');
    setText(OCBC_FIELD_MAPPINGS.emergency_phone1, emergency.substring(0, 3));
    setText(OCBC_FIELD_MAPPINGS.emergency_phone2, emergency.substring(3));
  }

  // ==================== PAGE 8 DECLARATION ====================
  setText(OCBC_FIELD_MAPPINGS.page8_full_name, data.name_as_per_ic);
  setText(OCBC_FIELD_MAPPINGS.page8_nric, data.mykad_number);

  const filledPdfBytes = await pdfDoc.save();
  console.log('[PDF] OCBC form filled successfully');
  return new Uint8Array(filledPdfBytes);
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
