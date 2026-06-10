import { z } from 'zod';
import { BANKS, BankId } from './banks';

// Malaysian race options
const races = ['Malay', 'Chinese', 'Indian', 'Others'] as const;
const religions = ['Islam', 'Buddhism', 'Christianity', 'Hinduism', 'Others'] as const;
const malaysianStates = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
] as const;
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'] as const;
const residenceStatuses = ['Owned', 'Rented', 'With Parents', 'Others'] as const;
const educationLevels = ['SPM', 'STPM', 'Diploma', 'Degree', 'Master', 'PhD', 'Others'] as const;
const employmentStatuses = ['Employed', 'Self-Employed', 'Unemployed', 'Retired', 'Student'] as const;
const businessClassifications = ['Government', 'Private', 'Self-Employed', 'Professional'] as const;
const employmentTypes = ['Permanent', 'Contract', 'Probation'] as const;
const employmentSectors = ['Banking', 'Education', 'Healthcare', 'Manufacturing', 'Retail', 'Services', 'Technology', 'Others'] as const;

// Occupations (job categories / types of work)
const occupations = [
  'Sales Engineer',
  'Doctor',
  'Teacher',
  'Accountant',
  'Software Developer',
  'Nurse',
  'Clerk',
  'Technician',
  'Engineer',
  'Manager',
  'Executive',
  'Supervisor',
  'Driver',
  'Business Owner',
  'Consultant',
  'Others'
] as const;

// Positions (ranks / levels within company)
const positions = [
  'Assistant Manager',
  'Senior Engineer',
  'General Manager',
  'Head of Department',
  'Executive',
  'Supervisor',
  'Intern',
  'Team Leader',
  'Director',
  'Junior Associate',
  'Manager',
  'Senior Executive',
  'Staff',
  'Others'
] as const;

// Card types (now bank-specific - see lib/banks.ts)
// All available cards across all banks
const allCardTypes = [
  'Visa Platinum-i',
  'Visa Infinite-i',
  'Muamalat Eon Visa Infinite-i',
  '90°N Visa Card',
  'Cashflo Mastercard',
  'Titanium Card (Blue)',
  'Titanium Card (Pink)',
  '365 Mastercard',
  'Great Eastern Platinum Mastercard',
] as const;

// Bank options
const bankIds = Object.keys(BANKS) as BankId[];

// Schema for extracted credit card application data
export const ExtractedDataSchema = z.object({
  name: z.string().nullable().optional(),
  ic_number: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  mother_name: z.string().nullable().optional(),
  employer_name: z.string().nullable().optional(),
  employer_address: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  office_phone: z.string().nullable().optional(),
  work_since: z.string().nullable().optional(),
  work_email: z.string().email().nullable().optional(),
  emergency_name: z.string().nullable().optional(),
  emergency_phone: z.string().nullable().optional(),
  emergency_relation: z.string().nullable().optional(),
});

// Full application form data
export const ApplicationFormDataSchema = ExtractedDataSchema.extend({
  // Bank and Card Selection
  bank_id: z.enum(bankIds).optional().nullable(),
  card_type: z.enum(allCardTypes).optional().nullable(),

  // Section A: Personal Details
  salutation: z.enum(['Dr', 'Haji', 'Hajjah', 'Mr', 'Mrs', 'Ms', 'Prof']).optional().nullable(),
  name_as_per_ic: z.string().optional().nullable(),
  gender: z.enum(['Male', 'Female']).optional().nullable(),
  nationality: z.string().default('Malaysian'),
  mykad_number: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(), // DD/MM/YYYY
  mother_name: z.string().optional().nullable(),
  race: z.enum(races).optional().nullable(),
  religion: z.enum(religions).optional().nullable(), // Bank Muamalat specific
  marital_status: z.enum(maritalStatuses).optional().nullable(),
  hp_number: z.string().optional().nullable(),
  email_address: z.string().optional().nullable().refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), { message: 'Invalid email format' }),
  name_on_card: z.string().optional().nullable(),
  residential_address: z.string().optional().nullable(),
  residence_status: z.enum(residenceStatuses).optional().nullable(),
  education_level: z.enum(educationLevels).optional().nullable(),
  related_to_bmm_staff: z.boolean().optional().nullable(), // Bank Muamalat specific
  postcode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),

  // Correspondence Address (separate from residential)
  correspondence_address: z.string().optional().nullable(),
  correspondence_city: z.string().optional().nullable(),
  correspondence_postcode: z.string().optional().nullable(),
  correspondence_state: z.string().optional().nullable(),

  // OCBC specific fields
  passport_number: z.string().optional().nullable(),
  passport_expiry_day: z.string().optional().nullable(),
  passport_expiry_month: z.string().optional().nullable(),
  passport_expiry_year: z.string().optional().nullable(),
  old_nric: z.string().optional().nullable(), // For old NRIC format

  // Additional Personal Details
  house_tel_no: z.string().optional().nullable(), // House telephone number
  police_military_id: z.string().optional().nullable(), // Police/Military ID

  // Related to BMMB Staff (if yes)
  bmm_staff_name: z.string().optional().nullable(),
  bmm_staff_id: z.string().optional().nullable(),
  bmm_staff_relationship: z.string().optional().nullable(),
  bmm_staff_department: z.string().optional().nullable(),

  // Office Address details (separate fields)
  office_city: z.string().optional().nullable(),
  office_postcode: z.string().optional().nullable(),
  office_state: z.string().optional().nullable(),

  // Section B: Employment Details
  employer_name: z.string().optional().nullable(),
  occupation: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  employment_status: z.enum(employmentStatuses).optional().nullable(),
  business_classification: z.enum(businessClassifications).optional().nullable(),
  office_number: z.string().optional().nullable(),
  employment_type: z.enum(employmentTypes).optional().nullable(),
  length_of_service: z.string().optional().nullable(),
  employment_sector: z.enum(employmentSectors).optional().nullable(),
  office_address: z.string().optional().nullable(),
  hr_email: z.string().optional().nullable(), // HR/Work email - required for Malaysian working in Singapore

  // Section C: Applicant's Income
  monthly_income: z.string().optional().nullable(),
  other_income_source: z.string().optional().nullable(),
  monthly_commitment: z.string().optional().nullable(), // Monthly expenses/obligations

  // Supplementary Cardholder (Section F & G)
  supp_salutation: z.string().optional().nullable(),
  supp_name: z.string().optional().nullable(),
  supp_gender: z.enum(['Male', 'Female']).optional().nullable(),
  supp_nationality: z.string().optional().nullable(),
  supp_mykad_number: z.string().optional().nullable(),
  supp_date_of_birth: z.string().optional().nullable(),
  supp_mother_name: z.string().optional().nullable(),
  supp_hp_number: z.string().optional().nullable(),
  supp_name_on_card: z.string().optional().nullable(),
  supp_residential_address: z.string().optional().nullable(),
  supp_city: z.string().optional().nullable(),
  supp_postcode: z.string().optional().nullable(),
  supp_state: z.string().optional().nullable(),
  supp_match_principal_address: z.boolean().optional().nullable(),
  // Supplementary employment (Section G)
  supp_employer_name: z.string().optional().nullable(),
  supp_business_classification: z.enum(businessClassifications).optional().nullable(),
  supp_employment_type: z.enum(employmentTypes).optional().nullable(),
  supp_relation_to_principal: z.string().optional().nullable(),
  supp_share_facility: z.boolean().optional().nullable(), // "My Supplementary Cardholder will share my facility limit"

  // Statement & Card Delivery (Section E)
  statement_delivery_preference: z.enum(['mail', 'email']).optional().nullable(),
  opt_hardcopy_statement: z.boolean().optional().nullable(), // RM5/month fee

  // Financing (Section I)
  financing_limit_type: z.enum(['specified', 'unspecified']).optional().nullable(),
  specified_financing_limit: z.string().optional().nullable(), // RM amount if specified

  // Sales Executive Info (For BMMB Use Only)
  sales_exec_name: z.string().optional().nullable(),
  sales_exec_ic: z.string().optional().nullable(),
  sales_exec_staff_id: z.string().optional().nullable(),
  sales_exec_email: z.string().optional().nullable(),
  branch_name: z.string().optional().nullable(),
  branch_tel_no: z.string().optional().nullable(),
  branch_manager_name: z.string().optional().nullable(),
  branch_manager_email: z.string().optional().nullable(),

  // Section D: Emergency Contact Details
  emergency_full_name: z.string().optional().nullable(),
  emergency_contact_number: z.string().optional().nullable(),
  emergency_relation: z.string().optional().nullable(),

  // Sections I, J, K, L: Agreements (pre-filled)
  agree_tawarruq: z.boolean().optional().nullable(),
  agree_unspecified: z.boolean().optional().nullable(),
  fatca_decl_1: z.boolean().optional().nullable(),
  fatca_decl_2: z.boolean().optional().nullable(),
  tax_fatca_decl: z.boolean().optional().nullable(),
  agree_declaration: z.boolean().optional().nullable(),
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
export type ApplicationFormData = z.infer<typeof ApplicationFormDataSchema>;

// n8n API response schema
export const N8nResponseSchema = z.object({
  success: z.boolean(),
  data: ExtractedDataSchema.optional(),
});

export type N8nResponse = z.infer<typeof N8nResponseSchema>;

// Dropdown options export
export const dropdownOptions = {
  bank: bankIds as readonly string[],
  race: races as readonly string[],
  religion: religions as readonly string[],
  state: malaysianStates as readonly string[],
  maritalStatus: maritalStatuses as readonly string[],
  residenceStatus: residenceStatuses as readonly string[],
  educationLevel: educationLevels as readonly string[],
  employmentStatus: employmentStatuses as readonly string[],
  businessClassification: businessClassifications as readonly string[],
  employmentType: employmentTypes as readonly string[],
  employmentSector: employmentSectors as readonly string[],
  occupation: occupations as readonly string[],
  position: positions as readonly string[],
  cardType: allCardTypes as readonly string[],
};
