import { z } from 'zod';

// Malaysian race options
const races = ['Malay', 'Chinese', 'Indian', 'Others'] as const;
const religions = ['Islam', 'Buddhism', 'Christianity', 'Hinduism', 'Others'] as const;
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

// Card types
const cardTypes = ['Visa Classic', 'Visa Gold', 'Visa Platinum-i', 'Visa Infinite-i', 'Mastercard Classic', 'Mastercard Gold'] as const;

// Schema for extracted credit card application data
export const ExtractedDataSchema = z.object({
  name: z.string().nullable().optional(),
  ic_number: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
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
  // Card Type
  card_type: z.enum(cardTypes).optional().nullable(),

  // Section A: Personal Details
  salutation: z.enum(['Dr', 'Haji', 'Hajjah', 'Mr', 'Mrs', 'Ms', 'Prof']).optional().nullable(),
  name_as_per_ic: z.string().optional().nullable(),
  gender: z.enum(['Male', 'Female']).optional().nullable(),
  nationality: z.string().default('Malaysian'),
  mykad_number: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(), // DD/MM/YYYY
  mother_name: z.string().optional().nullable(),
  race: z.enum(races).optional().nullable(),
  religion: z.enum(religions).optional().nullable(),
  marital_status: z.enum(maritalStatuses).optional().nullable(),
  hp_number: z.string().optional().nullable(),
  email_address: z.string().optional().nullable().refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), { message: 'Invalid email format' }),
  name_on_card: z.string().optional().nullable(),
  residential_address: z.string().optional().nullable(),
  residence_status: z.enum(residenceStatuses).optional().nullable(),
  education_level: z.enum(educationLevels).optional().nullable(),
  related_to_bmm_staff: z.boolean().optional().nullable(),
  postcode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),

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

  // Section C: Applicant's Income
  monthly_income: z.string().optional().nullable(),
  other_income_source: z.string().optional().nullable(),

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
  race: races as readonly string[],
  religion: religions as readonly string[],
  maritalStatus: maritalStatuses as readonly string[],
  residenceStatus: residenceStatuses as readonly string[],
  educationLevel: educationLevels as readonly string[],
  employmentStatus: employmentStatuses as readonly string[],
  businessClassification: businessClassifications as readonly string[],
  employmentType: employmentTypes as readonly string[],
  employmentSector: employmentSectors as readonly string[],
  occupation: occupations as readonly string[],
  position: positions as readonly string[],
  cardType: cardTypes as readonly string[],
};
