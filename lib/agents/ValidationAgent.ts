import { BaseAgent } from './BaseAgent';
import { ExtractedData, ValidationResult } from './types';

export class ValidationAgent extends BaseAgent {
  constructor(apiKey?: string) {
    super(apiKey, 'claude-3-5-haiku-20241022'); // Use Haiku for faster/cheaper validation
  }

  async process(input: { data: ExtractedData }): Promise<ValidationResult> {
    const { data } = input;

    // Required fields for credit card application
    const requiredFields = [
      { name: 'name', label: 'Applicant Name' },
      { name: 'ic_number', label: 'IC Number' },
      { name: 'phone', label: 'Phone Number' },
      { name: 'email', label: 'Email Address' },
      { name: 'employer_name', label: 'Employer Name' },
      { name: 'position', label: 'Position' },
      { name: 'address', label: 'Residential Address' },
    ];

    const missingFields: string[] = [];
    const invalidFields: Record<string, string> = {};
    const warnings: string[] = [];
    const suggestions: Record<string, string> = {};

    // Check required fields
    for (const field of requiredFields) {
      const value = data[field.name as keyof ExtractedData];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field.label);
      }
    }

    // Validate IC number (Malaysian IC: 12 digits)
    if (data.ic_number) {
      const icClean = data.ic_number.replace(/[^\d]/g, '');
      if (icClean.length !== 12) {
        invalidFields.ic_number = 'IC number must be exactly 12 digits';
      } else {
        // Basic IC validation (check if reasonable)
        const yy = icClean.substring(0, 2);
        const month = parseInt(icClean.substring(2, 4));
        const day = parseInt(icClean.substring(4, 6));

        if (month < 1 || month > 12) {
          invalidFields.ic_number = 'Invalid month in IC number';
        }
        if (day < 1 || day > 31) {
          invalidFields.ic_number = 'Invalid day in IC number';
        }

        // Suggest DOB from IC (preserve "00".."99" → 2000..1999 mapping)
        const fullYear = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
        suggestions.date_of_birth = `${day}/${month}/${fullYear}`;
      }
    }

    // Validate phone number (Malaysian mobile: 01X-XXXXXXXX)
    if (data.phone) {
      const phoneClean = data.phone.replace(/[^\d]/g, '');
      if (phoneClean.length < 10 || phoneClean.length > 12) {
        invalidFields.phone = 'Phone number appears invalid';
      }
      if (!phoneClean.startsWith('01')) {
        warnings.push('Phone number may not be a Malaysian mobile number');
      }
    }

    // Validate office phone
    if (data.office_phone) {
      const officeClean = data.office_phone.replace(/[^\d]/g, '');
      if (officeClean.length < 8) {
        invalidFields.office_phone = 'Office phone number appears invalid';
      }
    }

    // Validate email
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        invalidFields.email = 'Email format appears invalid';
      }
    }

    // Validate employer information
    if (data.employer_name && data.employer_name.length < 3) {
      warnings.push('Employer name seems too short');
    }

    // Check for Malaysian working in Singapore - requires HR email
    const isMalaysian = data.nationality === 'Malaysian' || this.isMalaysianAddress(data.address);
    const isSingaporeEmployer = this.isSingaporeAddress(data.employer_address);

    if (isMalaysian && isSingaporeEmployer) {
      if (!data.work_email) {
        missingFields.push('HR Email (required for Malaysian working in Singapore)');
      } else {
        warnings.push('⚠️ Malaysian working in Singapore - HR Email detected: ' + data.work_email);
      }
    }

    // Check for suspicious patterns
    if (data.name && data.ic_number) {
      // Check if name matches common fake patterns
      const lowerName = data.name.toLowerCase();
      if (['test', 'sample', 'dummy', 'example'].some(word => lowerName.includes(word))) {
        warnings.push('Applicant name appears to be test data');
      }
    }

    // Generate suggestions for missing fields
    if (missingFields.includes('Position') && data.occupation) {
      suggestions.position = `Consider using "${data.occupation}" as position`;
    }

    if (data.position && data.position.length <= 5) {
      // Might be abbreviated
      suggestions.position = 'Position appears abbreviated - consider expanding (e.g., MD → Managing Director)';
    }

    return {
      isValid: missingFields.length === 0 && Object.keys(invalidFields).length === 0,
      missingFields,
      invalidFields,
      warnings,
      suggestions,
    };
  }

  private isMalaysianAddress(address: string | null | undefined): boolean {
    if (!address) return false;

    const lowerAddress = address.toLowerCase();
    const malaysianStates = [
      'johor', 'kedah', 'kelantan', 'melaka', 'negeri sembilan',
      'pahang', 'perak', 'perlis', 'pulau pinang', 'penang',
      'sabah', 'sarawak', 'selangor', 'terengganu',
      'kuala lumpur', 'labuan', 'putrajaya'
    ];

    // Check for Malaysian states
    for (const state of malaysianStates) {
      if (lowerAddress.includes(state)) {
        return true;
      }
    }

    // Check for Malaysian postcode (5 digits)
    const malaysianPostcode = /\b\d{5}\b/;
    if (malaysianPostcode.test(address)) {
      return true;
    }

    return false;
  }

  private isSingaporeAddress(address: string | null | undefined): boolean {
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
}
