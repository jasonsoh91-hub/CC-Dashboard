import { BaseAgent } from './BaseAgent';
import { ExtractedData, FraudCheckResult } from './types';

export class FraudDetectionAgent extends BaseAgent {
  private readonly riskFactors = {
    // High risk indicators
    testPatterns: { score: 50, level: 'critical' as const, message: 'Test data detected' },
    invalidIC: { score: 40, level: 'high' as const, message: 'Invalid IC number format' },
    missingEmployer: { score: 30, level: 'high' as const, message: 'No employer information' },
    disposableEmail: { score: 25, level: 'medium' as const, message: 'Disposable email detected' },

    // Medium risk indicators
    incompleteAddress: { score: 20, level: 'medium' as const, message: 'Address appears incomplete' },
    newEmployment: { score: 15, level: 'medium' as const, message: 'Recently employed (less than 3 months)' },
    lowIncome: { score: 15, level: 'medium' as const, message: 'Income below minimum requirement' },

    // Low risk indicators
    genericEmail: { score: 10, level: 'low' as const, message: 'Generic email provider' },
    inconsistentData: { score: 10, level: 'low' as const, message: 'Data inconsistencies detected' },
  };

  private readonly disposableEmailDomains = [
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'throwaway.email',
    'sharklasers.com',
    'mailinator.com',
  ];

  private readonly genericEmailDomains = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
  ];

  constructor(apiKey?: string) {
    super(apiKey, 'claude-3-5-haiku-20241022');
  }

  async process(input: { data: ExtractedData }): Promise<FraudCheckResult> {
    const { data } = input;

    let totalScore = 0;
    const flags: string[] = [];
    const reasons: string[] = [];

    // Check for test data patterns
    if (this.isTestData(data)) {
      const factor = this.riskFactors.testPatterns;
      totalScore += factor.score;
      flags.push('TEST_DATA');
      reasons.push(factor.message);
    }

    // Validate IC number
    if (data.ic_number) {
      const icClean = data.ic_number.replace(/[^\d]/g, '');
      if (icClean.length !== 12) {
        const factor = this.riskFactors.invalidIC;
        totalScore += factor.score;
        flags.push('INVALID_IC');
        reasons.push(factor.message);
      }
    }

    // Check employer information
    if (!data.employer_name || data.employer_name.trim().length < 3) {
      const factor = this.riskFactors.missingEmployer;
      totalScore += factor.score;
      flags.push('NO_EMPLOYER');
      reasons.push(factor.message);
    }

    // Check email type
    if (data.email) {
      const domain = data.email.split('@')[1]?.toLowerCase();
      if (domain && this.disposableEmailDomains.includes(domain)) {
        const factor = this.riskFactors.disposableEmail;
        totalScore += factor.score;
        flags.push('DISPOSABLE_EMAIL');
        reasons.push(factor.message);
      } else if (domain && this.genericEmailDomains.includes(domain)) {
        const factor = this.riskFactors.genericEmail;
        totalScore += factor.score;
        reasons.push(factor.message);
      }
    }

    // Check address completeness
    if (data.address) {
      const addressParts = data.address.split(',').length;
      if (addressParts < 2) {
        const factor = this.riskFactors.incompleteAddress;
        totalScore += factor.score;
        flags.push('INCOMPLETE_ADDRESS');
        reasons.push(factor.message);
      }
    }

    // Check employment length
    if (data.work_since) {
      const months = this.parseEmploymentLength(data.work_since);
      if (months !== null && months < 3) {
        const factor = this.riskFactors.newEmployment;
        totalScore += factor.score;
        flags.push('NEW_EMPLOYMENT');
        reasons.push(factor.message);
      }
    }

    // Check for data inconsistencies
    const inconsistencies = this.checkInconsistencies(data);
    if (inconsistencies.length > 0) {
      const factor = this.riskFactors.inconsistentData;
      totalScore += factor.score;
      flags.push('DATA_INCONSISTENCY');
      reasons.push(...inconsistencies);
    }

    // Determine overall risk level
    const riskLevel = this.getRiskLevel(totalScore);

    return {
      riskScore: Math.min(100, totalScore),
      riskLevel,
      flags: Array.from(new Set(flags)),
      reasons: Array.from(new Set(reasons)),
    };
  }

  private isTestData(data: ExtractedData): boolean {
    const testIndicators = ['test', 'sample', 'dummy', 'example', 'demo', 'xxx', 'n/a'];

    const checkField = (value: string | null): boolean => {
      if (!value) return false;
      const lower = value.toLowerCase();
      return testIndicators.some(indicator => lower.includes(indicator));
    };

    return (
      checkField(data.name) ||
      checkField(data.email) ||
      checkField(data.employer_name) ||
      checkField(data.address)
    );
  }

  private parseEmploymentLength(workSince: string): number | null {
    // Try to parse various formats
    const formats = [
      /since\s+(\d{4})/i,
      /(\d{4})/,
      /(\d+)\s+months?/i,
      /joined\s+(\d{4})/i,
    ];

    for (const regex of formats) {
      const match = workSince.match(regex);
      if (match) {
        const value = match[1];
        if (value.length === 4) {
          // Year format - calculate months from current year
          const year = parseInt(value);
          const currentYear = new Date().getFullYear();
          return (currentYear - year) * 12;
        } else {
          // Already in months
          return parseInt(value);
        }
      }
    }

    return null;
  }

  private checkInconsistencies(data: ExtractedData): string[] {
    const issues: string[] = [];

    // Check if name and employer are the same (suspicious)
    if (data.name && data.employer_name) {
      const nameLower = data.name.toLowerCase();
      const employerLower = data.employer_name.toLowerCase();
      if (nameLower === employerLower) {
        issues.push('Applicant name and employer name are identical');
      }
    }

    // Check if phone numbers are the same
    if (data.phone && data.office_phone) {
      const phoneClean = data.phone.replace(/[^\d]/g, '');
      const officeClean = data.office_phone.replace(/[^\d]/g, '');
      if (phoneClean === officeClean) {
        issues.push('Personal and office phone numbers are identical');
      }
    }

    // Check if email contains numbers that match IC (potential fake)
    if (data.email && data.ic_number) {
      const icLast4 = data.ic_number.substring(8);
      if (data.email.includes(icLast4)) {
        issues.push('Email contains IC number pattern');
      }
    }

    return issues;
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }
}
