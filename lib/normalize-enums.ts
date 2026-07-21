// Standardise messy extracted values to the app's enum values BEFORE Zod
// validation. Without this, the route's sanitizeAndParse() blanks any value
// that isn't an exact enum member (e.g. "cina", "self-employed", "spm"), so the
// corresponding PDF dropdown ends up empty instead of nearest-matched.
//
// Pipeline per field: exact enum → synonym (whole word) → fuzzy (Levenshtein)
// → "Others" (only if that enum offers it) → leave untouched (Zod will blank).
//
// The bilingual PDF option is chosen later in lib/pdf-muamalat-v3.ts; this file
// only concerns the canonical app enum.

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const similarity = (a: string, b: string): number =>
  !a || !b ? 0 : 1 - levenshtein(a, b) / Math.max(a.length, b.length);

const FUZZY_THRESHOLD = 0.72;

interface FieldSpec {
  enums: string[];
  synonyms: Record<string, string>; // normalised input -> enum value
}

// Canonical app enums (mirror lib/types.ts).
const SPECS: Record<string, FieldSpec> = {
  salutation: {
    enums: ['Dr', 'Haji', 'Hajjah', 'Mr', 'Mrs', 'Ms', 'Prof'],
    synonyms: {
      encik: 'Mr', en: 'Mr', mister: 'Mr', puan: 'Mrs', madam: 'Mrs', mdm: 'Mrs',
      cik: 'Ms', miss: 'Ms', doctor: 'Dr', professor: 'Prof',
      hj: 'Haji', hjh: 'Hajjah',
    },
  },
  gender: {
    enums: ['Male', 'Female'],
    synonyms: { lelaki: 'Male', m: 'Male', perempuan: 'Female', f: 'Female' },
  },
  race: {
    enums: ['Malay', 'Chinese', 'Indian', 'Punjabi', 'Others'],
    synonyms: { cina: 'Chinese', china: 'Chinese', melayu: 'Malay', india: 'Indian', punjab: 'Punjabi' },
  },
  religion: {
    enums: ['Islam', 'Christian', 'Buddhist', 'Hindu', 'Sikhism', 'Atheist', 'Others'],
    synonyms: {
      muslim: 'Islam', islamic: 'Islam', christianity: 'Christian', kristian: 'Christian',
      catholic: 'Christian', protestant: 'Christian', buddha: 'Buddhist', buddhism: 'Buddhist',
      hinduism: 'Hindu', sikh: 'Sikhism', 'free thinker': 'Atheist', freethinker: 'Atheist', none: 'Atheist',
    },
  },
  marital_status: {
    enums: ['Single', 'Married', 'Divorced', 'Others'],
    synonyms: {
      bujang: 'Single', spinster: 'Single', bachelor: 'Single', unmarried: 'Single',
      berkahwin: 'Married', kahwin: 'Married', wedded: 'Married',
      bercerai: 'Divorced', divorcee: 'Divorced', duda: 'Divorced', janda: 'Divorced',
      widow: 'Others', widower: 'Others', separated: 'Others',
    },
  },
  residence_status: {
    enums: ['Owned', 'Rented', 'With Parents', 'Others'],
    synonyms: {
      own: 'Owned', self: 'Owned', sendiri: 'Owned', 'own house': 'Owned', 'milik sendiri': 'Owned',
      rent: 'Rented', rental: 'Rented', sewa: 'Rented', tenant: 'Rented', menyewa: 'Rented',
      parents: 'With Parents', family: 'With Parents', 'staying with parents': 'With Parents',
      'ibu bapa': 'With Parents',
    },
  },
  education_level: {
    enums: ['Primary Education', 'Secondary Education', 'Diploma', 'Degree', 'Masters', 'Doctorate', 'Professional Qualification'],
    synonyms: {
      primary: 'Primary Education', 'sekolah rendah': 'Primary Education',
      secondary: 'Secondary Education', spm: 'Secondary Education', stpm: 'Secondary Education',
      'sekolah menengah': 'Secondary Education', 'high school': 'Secondary Education', 'o level': 'Secondary Education',
      degree: 'Degree', bachelor: 'Degree', ijazah: 'Degree', graduate: 'Degree', bsc: 'Degree', ba: 'Degree',
      master: 'Masters', mba: 'Masters', msc: 'Masters', postgraduate: 'Masters',
      phd: 'Doctorate', doktor: 'Doctorate',
      professional: 'Professional Qualification', acca: 'Professional Qualification',
      cpa: 'Professional Qualification', cfa: 'Professional Qualification',
    },
  },
  employment_status: {
    enums: ['Permanent', 'Contract', 'Pensioner', 'Part Timer', 'Others'],
    synonyms: {
      tetap: 'Permanent', confirmed: 'Permanent', 'full time': 'Permanent', fulltime: 'Permanent',
      kontrak: 'Contract', pesara: 'Pensioner', retired: 'Pensioner', retiree: 'Pensioner',
      'part time': 'Part Timer', parttime: 'Part Timer', sambilan: 'Part Timer',
    },
  },
  employment_type: {
    enums: ['Employer', 'Government Employee', 'Private Employee', 'Self Employed'],
    synonyms: {
      owner: 'Employer', boss: 'Employer', majikan: 'Employer',
      government: 'Government Employee', govt: 'Government Employee', gov: 'Government Employee',
      kerajaan: 'Government Employee', 'civil servant': 'Government Employee', 'public sector': 'Government Employee',
      private: 'Private Employee', swasta: 'Private Employee', 'private sector': 'Private Employee', employee: 'Private Employee',
      'self employed': 'Self Employed', 'self-employed': 'Self Employed', selfemployed: 'Self Employed',
      freelance: 'Self Employed', freelancer: 'Self Employed', 'own business': 'Self Employed',
      'sole prop': 'Self Employed', berniaga: 'Self Employed',
    },
  },
  business_classification: {
    enums: ['Private Limited', 'Limited', 'Partnership', 'Public Listed', 'Multinational Corporation', 'Government', 'Sole Proprietorship', 'Others'],
    synonyms: {
      'sdn bhd': 'Private Limited', 'sendirian berhad': 'Private Limited', 'pte ltd': 'Private Limited',
      berhad: 'Limited', bhd: 'Limited',
      plc: 'Public Listed', listed: 'Public Listed',
      perkongsian: 'Partnership', llp: 'Partnership',
      mnc: 'Multinational Corporation', multinational: 'Multinational Corporation',
      kerajaan: 'Government',
      'sole prop': 'Sole Proprietorship', 'sole proprietor': 'Sole Proprietorship',
      enterprise: 'Sole Proprietorship', trading: 'Sole Proprietorship', 'milik tunggal': 'Sole Proprietorship',
    },
  },
  employment_sector: {
    enums: ['Banking', 'Education', 'Healthcare', 'Manufacturing', 'Retail', 'Services', 'Technology', 'Others'],
    synonyms: {
      bank: 'Banking', finance: 'Banking', financial: 'Banking',
      teaching: 'Education', school: 'Education', university: 'Education',
      medical: 'Healthcare', hospital: 'Healthcare', clinic: 'Healthcare', pharmaceutical: 'Healthcare',
      factory: 'Manufacturing', production: 'Manufacturing',
      retailer: 'Retail', 'f b': 'Retail', wholesale: 'Retail',
      service: 'Services', consulting: 'Services',
      tech: 'Technology', it: 'Technology', software: 'Technology', 'information technology': 'Technology',
    },
  },
};

// Return the enum value for a raw input, or null to leave the field as-is.
function matchEnum(raw: string, spec: FieldSpec): string | null {
  const v = norm(raw);
  if (!v) return null;

  // 1. already a valid enum (case-insensitive)
  const exact = spec.enums.find((e) => norm(e) === v);
  if (exact) return exact;

  // 2. synonym on whole words/phrases (avoid "rent" hitting "parents")
  const vPad = ` ${v} `;
  for (const [k, canon] of Object.entries(spec.synonyms)) {
    const kPad = ` ${k} `;
    if (v === k || vPad.includes(kPad) || kPad.includes(vPad)) return canon;
  }

  // 3. fuzzy nearest enum
  let best: string | null = null;
  let score = 0;
  for (const e of spec.enums) {
    if (norm(e) === 'others') continue; // don't let "Others" win on fuzz
    const s = similarity(v, norm(e));
    if (s > score) { score = s; best = e; }
  }
  if (best && score >= FUZZY_THRESHOLD) return best;

  // 4. Others fallback when the enum has it
  if (spec.enums.includes('Others')) return 'Others';

  // 5. give up — let Zod blank it rather than guess wrong
  return null;
}

// Returns a shallow copy with enum fields standardised.
export function normalizeApplicationEnums<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = { ...body };
  for (const [field, spec] of Object.entries(SPECS)) {
    const raw = out[field];
    if (raw == null || String(raw).trim() === '') continue;
    const matched = matchEnum(String(raw), spec);
    if (matched) out[field] = matched;
  }
  return out as T;
}

// exported for unit testing
export const __test = { matchEnum, SPECS };
