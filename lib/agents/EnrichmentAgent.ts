import { BaseAgent } from './BaseAgent';
import { ExtractedData, EnrichmentResult } from './types';

export class EnrichmentAgent extends BaseAgent {
  constructor(apiKey?: string) {
    super(apiKey, 'claude-3-5-haiku-20241022');
  }

  async process(input: { data: ExtractedData }): Promise<EnrichmentResult> {
    const { data } = input;

    const enrichedData: Partial<ExtractedData> = {};
    const sources: string[] = [];
    let confidence = 0;

    // Enrich name (if partial)
    if (data.name && data.name.length > 0 && data.name.length < 5) {
      enrichedData.name = this.expandName(data.name);
      sources.push('name_expansion');
    }

    // Enrich position (if abbreviated)
    if (data.position && this.isAbbreviated(data.position)) {
      enrichedData.position = this.expandAbbreviation(data.position);
      sources.push('position_expansion');
      confidence += 20;
    }

    // Enrich occupation from position
    if (data.position && !data.occupation) {
      enrichedData.occupation = this.inferOccupation(data.position);
      sources.push('occupation_inference');
      confidence += 15;
    }

    // Enrich business classification
    if (data.occupation || data.position) {
      const classification = this.classifyBusiness(data.occupation, data.position);
      if (classification) {
        enrichedData.business_classification = classification;
        sources.push('business_classification');
        confidence += 10;
      }
    }

    // Enrich employment sector from employer/position (only if extractor did
    // not already derive one from Nature of Business)
    if (!data.employment_sector && (data.employer_name || data.position)) {
      const sector = this.inferSector(data.employer_name, data.position);
      if (sector) {
        enrichedData.employment_sector = sector;
        sources.push('sector_inference');
        confidence += 10;
      }
    }

    // Enrich gender from name/salutation
    if (data.name && !data.gender) {
      const gender = this.inferGender(data.name);
      if (gender) {
        enrichedData.gender = gender;
        sources.push('gender_inference');
        confidence += 5;
      }
    }

    return {
      enrichedData,
      sources: Array.from(new Set(sources)),
      confidence: Math.min(100, confidence + 50), // Base confidence 50
    };
  }

  private expandName(name: string): string {
    // Common Malaysian name abbreviations
    const expansions: Record<string, string> = {
      'Mohd': 'Muhammad',
      'Muhd': 'Muhammad',
      'Ahmad': 'Ahmad',
      'A': 'Ahmad',
      'Md': 'Muhammad',
      'Ain': 'Siti Aina',
      'Z': 'Zulkifli',
    };

    for (const [abbr, full] of Object.entries(expansions)) {
      if (name.toLowerCase().startsWith(abbr.toLowerCase())) {
        return name.replace(new RegExp(`^${abbr}`, 'i'), full);
      }
    }

    return name;
  }

  private isAbbreviated(text: string): boolean {
    // Check if position is likely abbreviated
    const abbreviatedPattern = /\b[A-Z]{2,4}\b/;
    return abbreviatedPattern.test(text) || text.length <= 5;
  }

  private expandAbbreviation(position: string): string {
    // Comprehensive abbreviation expansion
    const abbreviations: Record<string, string> = {
      // C-Level
      'CEO': 'Chief Executive Officer',
      'CFO': 'Chief Financial Officer',
      'COO': 'Chief Operating Officer',
      'CTO': 'Chief Technology Officer',
      'CMO': 'Chief Marketing Officer',
      'CIO': 'Chief Information Officer',
      'CSO': 'Chief Security Officer',
      'CHO': 'Chief Human Resources Officer',
      'CLO': 'Chief Legal Officer',

      // VP
      'VP': 'Vice President',
      'EVP': 'Executive Vice President',
      'SVP': 'Senior Vice President',
      'AVP': 'Assistant Vice President',

      // Management
      'MD': 'Managing Director',
      'GM': 'General Manager',
      'DGM': 'Deputy General Manager',
      'AGM': 'Assistant General Manager',
      'MGR': 'Manager',
      'HOD': 'Head of Department',

      // Common
      'SR': 'Senior',
      'JR': 'Junior',
      'ASST': 'Assistant',
      'ASSOC': 'Associate',
      'EXEC': 'Executive',
      'DIR': 'Director',
      'ENG': 'Engineer',
      'DR': 'Doctor',
      'PROF': 'Professor',
      'REV': 'Reverend',
    };

    const upper = position.toUpperCase();
    if (abbreviations[upper]) {
      return abbreviations[upper];
    }

    // Try partial match
    for (const [abbr, full] of Object.entries(abbreviations)) {
      if (upper.includes(abbr)) {
        return position.replace(new RegExp(abbr, 'gi'), full);
      }
    }

    return position;
  }

  private inferOccupation(position: string): string {
    // Infer occupation from position
    const positionLower = position.toLowerCase();

    const occupationMap: Record<string, string> = {
      'doctor': 'Doctor',
      'dr': 'Doctor',
      'engineer': 'Engineer',
      'eng': 'Engineer',
      'manager': 'Manager',
      'managing director': 'Business Owner',
      'ceo': 'Business Owner',
      'cfo': 'Finance Professional',
      'teacher': 'Teacher',
      'lecturer': 'Education',
      'nurse': 'Nurse',
      'accountant': 'Accountant',
      'developer': 'Software Developer',
      'supervisor': 'Supervisor',
    };

    for (const [key, occupation] of Object.entries(occupationMap)) {
      if (positionLower.includes(key)) {
        return occupation;
      }
    }

    return 'Business'; // Default
  }

  private classifyBusiness(occupation: string | null, position: string | null): string {
    const text = `${occupation || ''} ${position || ''}`.toLowerCase();

    if (text.includes('government') || text.includes('civil service')) {
      return 'Government';
    }
    if (text.includes('bank') || text.includes('financial')) {
      return 'Private Limited';
    }
    if (text.includes('owner') || text.includes('md') || text.includes('ceo')) {
      return 'Sole Proprietorship';
    }
    if (text.includes('doctor') || text.includes('lawyer') || text.includes('accountant')) {
      return 'Partnership';
    }

    return 'Private Limited'; // Default
  }

  private inferSector(employerName: string | null, position: string | null): string {
    const text = `${employerName || ''} ${position || ''}`.toLowerCase();

    const sectorMap: Record<string, string> = {
      'bank': 'Banking',
      'financial': 'Banking',
      'school': 'Education',
      'university': 'Education',
      'hospital': 'Healthcare',
      'clinic': 'Healthcare',
      'factory': 'Manufacturing',
      'manufacturing': 'Manufacturing',
      'retail': 'Retail',
      'shop': 'Retail',
      'store': 'Retail',
      'software': 'Technology',
      'it': 'Technology',
      'tech': 'Technology',
    };

    for (const [key, sector] of Object.entries(sectorMap)) {
      if (text.includes(key)) {
        return sector;
      }
    }

    return 'Others';
  }

  private inferGender(name: string): string | null {
    const nameLower = name.toLowerCase();

    // Malay name patterns
    if (nameLower.includes('binti')) return 'Female';
    if (nameLower.includes('bin')) return 'Male';

    // Common name prefixes
    const malePrefixes = ['muhammad', 'mohd', 'ahmad', 'abdul'];
    const femalePrefixes = ['siti', 'fatimah', 'ain', 'nur', 'zaharah'];

    for (const prefix of malePrefixes) {
      if (nameLower.startsWith(prefix)) return 'Male';
    }
    for (const prefix of femalePrefixes) {
      if (nameLower.startsWith(prefix)) return 'Female';
    }

    return null;
  }
}
