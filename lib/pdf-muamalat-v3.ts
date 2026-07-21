// Bank Muamalat Credit Card-i Application Form — v3 (May 2026) filler.
//
// The v3 template the bank supplied was auto-fielded, so most field NAMES are
// meaningless ("Text3", "Dropdown19", "House Tel No 3" is actually the e-mail
// box, etc.). Every mapping below was verified by rendering the form with each
// field filled by its own name and reading the resulting page images — trust
// the comment describing the visual slot, NOT the raw field name.
//
// Two structural quirks of the bank's PDF that this file works around:
//   1. Gender / Nationality / BMMB-staff / Yes-No / Agree-Disagree groups are a
//      SINGLE checkbox field carrying TWO widgets, each with its own export
//      state (e.g. Check Box2: Male=/2, Female=/1). We pick the option by
//      writing /V + the matching widget /AS directly (setRadioState).
//   2. "StateCor" is one field displayed in BOTH the Correspondence State and
//      Permanent State slots — they can never hold different values.

import { PDFDocument, PDFTextField, PDFDropdown, PDFName, PDFDict } from 'pdf-lib';
import type { ApplicationFormData } from './types';

// ===========================================================================
// Nearest-option matcher — the whole reason the bank wants dropdowns is to
// STANDARDISE values. Extracted message text is messy ("cina", "sdn bhd",
// "self-employed", "spm"), so we map it to the closest real option via:
//   1. category synonym table   2. exact english/malay part
//   3. substring containment     4. fuzzy (Levenshtein) above threshold
//   5. "Others / Lain-lain" (if the dropdown offers it), else leave blank.
// ===========================================================================

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// bilingual option -> its normalised parts, e.g. "Own / Sendiri" -> ["own","sendiri"]
const optionParts = (opt: string): string[] =>
  opt.split('/').map((p) => norm(p)).filter(Boolean);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
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

const similarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
};

// Synonym tables keyed by category. Keys are normalised input variants; values
// are the normalised english part of the target option. Order matters — put
// more specific keys before shorter substrings that could also match.
const SYNONYMS: Record<string, Record<string, string>> = {
  salutation: {
    encik: 'mr', en: 'mr', mister: 'mr', puan: 'mrs', madam: 'mrs', mdm: 'mrs',
    cik: 'ms', miss: 'ms', doctor: 'dr', professor: 'prof',
    hj: 'tuan haji', haji: 'tuan haji', hjh: 'puan hajjah', hajjah: 'puan hajjah',
  },
  race: { cina: 'chinese', china: 'chinese', melayu: 'malay', india: 'indian', punjab: 'punjabi' },
  religion: {
    muslim: 'islam', islamic: 'islam', christianity: 'christian', kristian: 'christian',
    catholic: 'christian', protestant: 'christian', buddha: 'buddhist', buddhism: 'buddhist',
    hinduism: 'hindu', sikh: 'sikhism', 'free thinker': 'atheist', freethinker: 'atheist',
    none: 'atheist', 'no religion': 'atheist',
  },
  marital: {
    bujang: 'single', spinster: 'single', bachelor: 'single', unmarried: 'single',
    berkahwin: 'married', kahwin: 'married', wedded: 'married',
    bercerai: 'divorced', divorcee: 'divorced', duda: 'divorced', janda: 'divorced',
    widow: 'others', widower: 'others', separated: 'others',
  },
  residence: {
    owned: 'own', self: 'own', sendiri: 'own', 'own house': 'own', 'milik sendiri': 'own',
    rent: 'rental', rented: 'rental', sewa: 'rental', tenant: 'rental', menyewa: 'rental',
    parents: 'parents', 'with parents': 'parents', family: 'parents',
    'staying with parents': 'parents', 'ibu bapa': 'parents',
  },
  education: {
    primary: 'primary', 'sekolah rendah': 'primary',
    secondary: 'secondary', spm: 'secondary', stpm: 'secondary', 'sekolah menengah': 'secondary',
    'high school': 'secondary', 'o level': 'secondary',
    diploma: 'diploma',
    degree: 'degree', bachelor: 'degree', ijazah: 'degree', graduate: 'degree', bsc: 'degree', ba: 'degree',
    master: 'masters', masters: 'masters', mba: 'masters', msc: 'masters', postgraduate: 'masters',
    phd: 'doctorate', doctorate: 'doctorate', doktor: 'doctorate',
    professional: 'professional', acca: 'professional', cpa: 'professional', cfa: 'professional',
  },
  employmentStatus: {
    permanent: 'permanent', tetap: 'permanent', confirmed: 'permanent', 'full time': 'permanent', fulltime: 'permanent',
    contract: 'contract', kontrak: 'contract',
    pensioner: 'pensioner', pesara: 'pensioner', retired: 'pensioner', retiree: 'pensioner',
    'part time': 'part timer', parttime: 'part timer', 'part timer': 'part timer', sambilan: 'part timer',
  },
  employmentType: {
    employer: 'employer', owner: 'employer', boss: 'employer', majikan: 'employer',
    government: 'government', govt: 'government', gov: 'government', kerajaan: 'government',
    'civil servant': 'government', 'public sector': 'government',
    'self employed': 'self', 'self-employed': 'self', selfemployed: 'self', freelance: 'self',
    freelancer: 'self', 'own business': 'self', 'sole prop': 'self', berniaga: 'self',
    private: 'private', swasta: 'private', 'private sector': 'private', employee: 'private',
  },
  business: {
    'sdn bhd': 'private limited', 'sendirian berhad': 'private limited', 'pte ltd': 'private limited',
    berhad: 'limited', bhd: 'limited',
    plc: 'public listed', 'public listed': 'public listed', listed: 'public listed',
    partnership: 'partnership', perkongsian: 'partnership', llp: 'partnership',
    mnc: 'multinational', multinational: 'multinational',
    government: 'government', kerajaan: 'government',
    'sole prop': 'sole proprietorship', 'sole proprietor': 'sole proprietorship',
    enterprise: 'sole proprietorship', trading: 'sole proprietorship', 'milik tunggal': 'sole proprietorship',
  },
};

const FUZZY_THRESHOLD = 0.62;

// Returns a real option string, {others: <opt>} to route to the Others box,
// or null to leave the dropdown untouched (Please Select).
export function matchOption(
  value: string,
  options: string[],
  category?: string,
  allowOthers = true,
): string | { others: string } | null {
  const v = norm(value);
  if (!v) return null;
  const real = options.filter((o) => norm(o) !== 'please select');

  // 1. synonym -> canonical english fragment. Match on whole words/phrases so
  // short keys don't bleed into unrelated words ("rent" in "parents", "ba" in
  // "mba").
  const syn = (category && SYNONYMS[category]) || {};
  const vPad = ` ${v} `;
  let synTarget: string | null = null;
  for (const [k, canon] of Object.entries(syn)) {
    const kPad = ` ${k} `;
    if (v === k || vPad.includes(kPad) || kPad.includes(vPad)) { synTarget = canon; break; }
  }
  const targets = synTarget ? [synTarget, v] : [v];

  // 2. exact part match
  for (const t of targets) {
    const hit = real.find((o) => optionParts(o).some((p) => p === t));
    if (hit) return hit;
  }
  // 3. containment either direction
  for (const t of targets) {
    const hit = real.find((o) => optionParts(o).some((p) => p.includes(t) || t.includes(p)));
    if (hit) return hit;
  }
  // 4. fuzzy over all option parts
  let best: string | null = null;
  let bestScore = 0;
  for (const o of real) {
    for (const p of optionParts(o)) {
      const s = similarity(v, p);
      if (s > bestScore) { bestScore = s; best = o; }
    }
  }
  if (best && bestScore >= FUZZY_THRESHOLD) return best;

  // 5. Others fallback
  if (allowOthers) {
    const others = real.find((o) => norm(o).startsWith('others') || norm(o).includes('lain lain'));
    if (others) return { others };
  }
  return null;
}

export async function fillBankMuamalatV3Form(
  pdfBytes: Buffer,
  data: ApplicationFormData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const form = pdfDoc.getForm();

  // ---- helpers ------------------------------------------------------------
  // pdf-lib's standard fonts encode as WinAnsi (Latin-1). Pasted data often
  // carries smart quotes / en-dashes / non-breaking spaces / non-Latin chars
  // that throw "WinAnsi cannot encode" and crash generation for that applicant
  // ("failed to generate PDF"). Normalise common cases, drop the rest.
  const clean = (v: string | null | undefined): string => {
    if (v == null) return '';
    return String(v)
      .replace(/[\r\n]+/g, ' ')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[   ]/g, ' ')
      .replace(/[^\x20-\xFF]/g, '') // strip anything WinAnsi can't render
      .trim();
  };

  const noComma = (v: string | null | undefined) =>
    clean(v).replace(/,/g, '').trim();

  const setText = (fieldName: string, value: string | null | undefined) => {
    const val = clean(value);
    if (!val) return;
    try {
      const f = form.getField(fieldName);
      if (f instanceof PDFTextField) f.setText(val);
    } catch {
      console.warn(`[PDFv3] text field missing: ${fieldName}`);
    }
  };

  // Pick a specific widget of a multi-state checkbox field. `state` is the
  // export name WITHOUT a leading slash (e.g. '2', '1', 'Yes'); null clears.
  const setRadioState = (fieldName: string, state: string | null) => {
    try {
      const af = form.getField(fieldName).acroField;
      af.dict.set(PDFName.of('V'), PDFName.of(state ?? 'Off'));
      for (const w of af.getWidgets()) {
        let hasState = false;
        if (state) {
          try {
            const ap = w.dict.lookupMaybe(PDFName.of('AP'), PDFDict);
            const n = ap?.lookupMaybe(PDFName.of('N'), PDFDict);
            if (n) {
              for (const k of n.keys()) {
                if (k.toString() === `/${state}`) hasState = true;
              }
            }
          } catch {
            /* AP/N may be a raw stream on single-state widgets — ignore */
          }
        }
        w.dict.set(PDFName.of('AS'), PDFName.of(hasState && state ? state : 'Off'));
      }
    } catch {
      console.warn(`[PDFv3] radio field missing: ${fieldName}`);
    }
  };

  // Simple single-widget checkbox on/off.
  const setCheck = (fieldName: string, checked: boolean) => {
    try {
      const f = form.getField(fieldName);
      // @ts-expect-error pdf-lib checkbox
      if (checked) f.check?.();
      // @ts-expect-error pdf-lib checkbox
      else f.uncheck?.();
    } catch {
      console.warn(`[PDFv3] checkbox missing: ${fieldName}`);
    }
  };

  // Map a (possibly messy) value to the nearest dropdown option. `category`
  // selects the synonym table; when no confident option is found and the
  // dropdown has an "Others" entry, route the raw value to `othersField`.
  const setDropdown = (
    fieldName: string,
    value: string | null | undefined,
    opts?: { category?: string; othersField?: string; allowOthers?: boolean },
  ) => {
    const val = clean(value);
    if (!val) return;
    try {
      const f = form.getField(fieldName);
      if (!(f instanceof PDFDropdown)) return;
      const allowOthers = opts?.allowOthers ?? opts?.othersField !== undefined;
      const result = matchOption(val, f.getOptions(), opts?.category, allowOthers);
      if (!result) {
        console.warn(`[PDFv3] no dropdown match for "${val}" in ${fieldName}`);
        return;
      }
      if (typeof result === 'string') {
        f.select(result);
      } else {
        f.select(result.others);
        if (opts?.othersField) setText(opts.othersField, val);
      }
    } catch {
      console.warn(`[PDFv3] dropdown missing: ${fieldName}`);
    }
  };

  const splitAddr = (address: string): [string, string] => {
    const words = clean(address).split(/\s+/).filter(Boolean);
    let l1 = '';
    let i = 0;
    for (; i < words.length; i++) {
      if ((l1 + ' ' + words[i]).trim().length <= 45) l1 = (l1 + ' ' + words[i]).trim();
      else break;
    }
    return [l1, words.slice(i).join(' ')];
  };

  const parseMY = (address: string) => {
    // Expand common Malaysian abbreviations so state/city detection works on
    // messy input like "...53100 KL" or "PJ". Local to parsing only — the
    // address lines written to the PDF use the original text.
    const a = clean(address)
      .replace(/\bK\.?\s?L\.?\b/gi, 'Kuala Lumpur')
      .replace(/\bP\.?\s?J\.?\b/gi, 'Petaling Jaya')
      .replace(/\bJ\.?\s?B\.?\b/gi, 'Johor Bahru')
      .replace(/\bN\.?\s?Sembilan\b/gi, 'Negeri Sembilan');
    const pc = a.match(/\b(\d{5})\b/);
    const states = [
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
      'Pulau Pinang', 'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak',
      'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
    ];
    let state = '';
    for (const s of states) {
      if (a.toLowerCase().includes(s.toLowerCase())) { state = s; break; }
    }
    let city = '';
    if (pc && state) {
      const after = a.substring(pc.index! + pc[0].length);
      city = after.substring(0, after.toLowerCase().indexOf(state.toLowerCase())).trim();
    }
    return { postcode: pc ? pc[1] : '', city, state };
  };

  // Length of service comes as "2 years 1 month", "5 years", "6 months", or a
  // bare number (assume years). The v3 form has separate Years and Months
  // boxes, so split it.
  const parseTenure = (s: string | null | undefined): { years: string; months: string } => {
    const str = clean(s);
    if (!str) return { years: '', months: '' };
    const ym = str.match(/(\d+)\s*(?:years?|thn|tahun|yrs?)/i);
    const mm = str.match(/(\d+)\s*(?:months?|bln|bulan|mths?)/i);
    let years = ym ? ym[1] : '';
    const months = mm ? mm[1] : '';
    if (!years && !months) {
      const bare = str.match(/^\s*(\d+)\s*$/); // lone number → years
      if (bare) years = bare[1];
    }
    return { years, months };
  };

  const nameForCard = (full: string) => {
    if (!full) return '';
    const MAX = 19;
    const parts = full.replace(/\s+/g, ' ').trim().toUpperCase().split(' ');
    const kept = parts.filter((p) => p !== 'BIN' && p !== 'BINTI');
    let name = kept.join(' ');
    if (name.length > MAX && kept.length > 1) {
      const two = `${kept[0]} ${kept[kept.length - 1]}`;
      name = two.length <= MAX ? two : kept[0];
    }
    return name.length > MAX ? name.substring(0, MAX) : name;
  };

  const today = new Date().toLocaleDateString('en-GB'); // dd/mm/yyyy

  // ======================= TOP: apply / purpose ===========================
  setDropdown('Dropdown19', data.card_type, { allowOthers: false }); // I wish to apply for

  // ======================= A. PERSONAL DETAILS ============================
  setDropdown('Dropdown1', data.salutation, { category: 'salutation', othersField: 'Text1' });
  setText('Nama seperti di dalam MyKad atau Pasport', data.name_as_per_ic);

  // Gender — Check Box2: Male=/2, Female=/1
  if (data.gender === 'Male') setRadioState('Check Box2', '2');
  else if (data.gender === 'Female') setRadioState('Check Box2', '1');

  // Nationality — Check Box3: Malaysia=/2, Others=/1
  const nat = String(data.nationality || '').toLowerCase().trim();
  if (nat === 'malaysian' || nat === 'malaysia' || nat === '') {
    setRadioState('Check Box3', '2');
  } else {
    setRadioState('Check Box3', '1');
    setText('Text5', data.nationality); // Others nationality text
  }

  setText('No MyKad Baru  No KP Lama  No Pasport', data.mykad_number);
  setText('PolisTentera', data.police_military_id);
  setText('Date of Birth3', data.date_of_birth);
  setText('Mothers Maiden Name  Nama Ibu', data.mother_name);
  setDropdown('Racee', data.race, { category: 'race', othersField: 'TextR' });
  setDropdown('Religionn', data.religion, { category: 'religion', othersField: 'TextRe' });
  setDropdown('Dropdownn', data.marital_status, { category: 'marital', othersField: 'Texta' });
  setText('House Tel No  No Tel Rumah 1', data.house_tel_no);   // House Tel
  setText('House Tel No  No Tel Rumah 2', data.hp_number);       // HP No
  setText('House Tel No  No Tel Rumah 3', data.email_address);   // E-mail

  // Right column — card name + residential address
  setText('Name on Card  Nama di Kad', nameForCard(data.name_on_card || data.name_as_per_ic || ''));
  const resAddr = data.residential_address || '';
  const [ra1, ra2] = splitAddr(resAddr);
  setText('Alamat_Kediaman', ra1);
  setText('Alamat_Kediaman2', ra2);
  const resP = parseMY(resAddr);
  setText('PostcodeRA', noComma(data.postcode || resP.postcode));
  setText('CityRA', noComma(data.city || resP.city));
  setText('StateRA', noComma(data.state || resP.state));

  // Correspondence address
  if (data.correspondence_address) {
    const [ca1, ca2] = splitAddr(data.correspondence_address);
    setText('Alamat_Cor', ca1);
    setText('Alamat_Cor2', ca2);
    setText('PostCor', noComma(data.correspondence_postcode));
    setText('CityCor', noComma(data.correspondence_city));
    // NOTE: StateCor is shared with Permanent State (bank template bug).
    setText('StateCor', noComma(data.correspondence_state));
  } else {
    setCheck('Check Box4', true); // "matches residential address"
  }

  setDropdown('Dropdown2', data.residence_status, { category: 'residence', othersField: 'Text2' });
  setDropdown('Dropdown3', data.education_level, { category: 'education', allowOthers: false }); // education level

  // BMMB staff — Check Box16: Yes=/1, No=/2
  if (data.related_to_bmm_staff) {
    setRadioState('Check Box16', '1');
    setText('Staff Name  ID No  Nama staf No ID', [data.bmm_staff_name, data.bmm_staff_id].filter(Boolean).join(' / '));
    setText('Relationship  Hubungan', data.bmm_staff_relationship);
    setText('Department  Branch  Jabatan Cawangan', data.bmm_staff_department);
  } else {
    setRadioState('Check Box16', '2');
  }

  // ======================= B. EMPLOYMENT =================================
  setText('Employers Name  Nama Majikan', data.employer_name);
  setDropdown('Dropdown18', data.employment_type, { category: 'employmentType', allowOthers: false }); // Employment Type
  setText('Occupation  Pekerjaan', data.occupation);
  setText('Position  Jawatan', data.position);
  setDropdown('DropdownN4', data.employment_status, { category: 'employmentStatus', othersField: 'Text4' }); // Employment Status
  const tenure = parseTenure(data.length_of_service);
  setText('Employment Sector  Sektor Pekerjaan', tenure.years);          // Length of Service — Years
  setText('Employment Sector  Sektor Pekerjaan Months', tenure.months);  // Length of Service — Months
  setText('Text16', data.employment_sector);                // Employment Sector
  setDropdown('Dropdown4', data.business_classification, { category: 'business', othersField: 'TextBiz' });
  setText('Text22', data.office_number);                    // Tel No (O)
  const offAddr = data.office_address || '';
  const [oa1, oa2] = splitAddr(offAddr);
  setText('Text17', oa1);                                   // Office Address 1
  setText('Text18', oa2);                                   // Office Address 2
  const offP = parseMY(offAddr);
  setText('Text21', noComma(data.office_postcode || offP.postcode)); // Office Postcode
  setText('Text19', noComma(data.office_city || offP.city));         // Office City
  setText('Text20', noComma(data.office_state || offP.state));       // Office State

  // ======================= C. INCOME ====================================
  setText('RM', noComma(data.monthly_income));       // Monthly Income
  setText('RM_2', noComma(data.other_income_source)); // Other Income Source
  setText('RM_3', noComma(data.monthly_commitment));  // Monthly Commitment

  // ======================= D. EMERGENCY CONTACT =========================
  setText('Name Family member not staying with you  Nama Ahli keluarga yang tidak tinggal bersama anda', data.emergency_full_name);
  setText('Contact No  No Untuk Dihubungi', data.emergency_contact_number);
  setText('Relationship  Hubungan_2', data.emergency_relation);

  // ======================= E. STATEMENT / CARD DELIVERY =================
  if (data.opt_hardcopy_statement) setCheck('Check Box19', true);

  // ======================= F. SUPPLEMENTARY CARDHOLDER ==================
  if (data.supp_name) {
    setDropdown('DropdownSal', data.supp_salutation, { category: 'salutation', othersField: 'TextSal' });
    setText('Name to appear on Card maximum 19 characters', data.supp_name); // Name as per ID slot
    setText('Name on Card  Nama di Kadd', nameForCard(data.supp_name_on_card || data.supp_name || ''));
    // 'No Polis' (supp police/military ID) has no source field — left blank.
    setText('Date of Birth4', data.supp_date_of_birth);
    setText('Text7', data.supp_hp_number); // Supp HP No

    // Supp gender — Check Boxx: Male=/1, Female=/Yes
    if (data.supp_gender === 'Male') setRadioState('Check Boxx', '1');
    else if (data.supp_gender === 'Female') setRadioState('Check Boxx', 'Yes');

    // Supp nationality — Check Box00: Malaysia=/1, Others=/Yes
    const snat = String(data.supp_nationality || '').toLowerCase().trim();
    if (snat === 'malaysian' || snat === 'malaysia' || snat === '') setRadioState('Check Box00', '1');
    else setRadioState('Check Box00', 'Yes');

    setText('No MyKad Baru  No KP Lama  No Pasportt', data.supp_mykad_number);

    if (data.supp_match_principal_address) {
      setCheck('Check Boxes', true);
    } else {
      const [sa1, sa2] = splitAddr(data.supp_residential_address || '');
      setText('Alamat_Kediamann', sa1);
      setText('Alamat_Kediamannn', sa2);
      setText('PostcodeRAa', noComma(data.supp_postcode));
      setText('CityRAa', noComma(data.supp_city));
      setText('StateRAa', noComma(data.supp_state));
    }

    // Section G — supp employment
    setText('Employers Name  Nama Majikan_2', data.supp_employer_name);
    setDropdown('Dropdown1/', data.supp_employment_type, { category: 'employmentType', allowOthers: false });
    setDropdown('Dropdown41', data.supp_business_classification, { category: 'business', othersField: 'TextBizz' });
    setText('Hubungan dengan Pemegang Kad Utama', data.supp_relation_to_principal);
  }

  // ======================= I. FINANCING (Tawarruq) ======================
  if (data.agree_tawarruq) setCheck('CheckboxLink3', true);
  // Check Box11: Specified=/Yes, Unspecified=/1. Default to Unspecified unless
  // the applicant explicitly chose a specified limit.
  if (data.financing_limit_type === 'specified') {
    setRadioState('Check Box11', 'Yes');
    setText('fill_10', noComma(data.specified_financing_limit));
  } else {
    setRadioState('Check Box11', '1');
  }

  // ======================= J. FATCA/CRS =================================
  // Q1 US citizen — Check Box12: Yes=/Yes, No=/1 (fatca_decl_1 true = "No, not US")
  if (data.fatca_decl_1 != null) setRadioState('Check Box12', data.fatca_decl_1 ? '1' : 'Yes');
  // Q2 tax resident other country — Check Box13: Yes=/Yes, No=/2
  if (data.fatca_decl_2 != null) setRadioState('Check Box13', data.fatca_decl_2 ? '2' : 'Yes');

  // ======================= K. TAX & FATCA DECLARATION ===================
  if (data.tax_fatca_decl) setCheck('Check Box6', true);

  // ======================= L. DECLARATION / PDPA ========================
  // Check Box15: Agree=/Yes, Disagree=/1
  if (data.agree_declaration) setRadioState('Check Box15', 'Yes');

  // Signature block names + dates
  setText('Text6', data.name_as_per_ic);  // Principal Name
  setText('TextX', today);                 // Principal Date
  if (data.supp_name) {
    setText('TextT', data.supp_name);      // Supp Name
    setText('Text8', today);               // Supp Date
  }

  // ======================= FOR BMMB USE ONLY (agent/branch) =============
  setText('Text9', data.agent_name || data.sales_exec_name);      // Introduced by
  setText('Text10', data.agent_ic || data.sales_exec_ic);         // IC No
  setText('Text11', data.sales_exec_email);                       // Sales Executive E-mail
  setText('Text12', data.agent_staff_id || data.sales_exec_staff_id); // Staff ID No
  setText('Text111', data.branch_name);                           // Branch
  setText('Text14', data.branch_tel_no);                          // Branch Tel No
  setText('Text15', data.branch_manager_name);                    // Branch Manager Name
  setText('Text123', data.branch_manager_email);                  // Branch Manager Email

  // Bake text/dropdown appearances so Preview / Adobe mobile render values.
  try {
    form.updateFieldAppearances();
  } catch (e) {
    console.warn('[PDFv3] updateFieldAppearances failed:', e);
  }

  // Re-assert radio widget states AFTER appearance regeneration so they stick.
  reassertRadios(form, data);

  const out = await pdfDoc.save();
  return new Uint8Array(out);
}

// updateFieldAppearances() can reset checkbox /AS; re-apply the chosen states.
function reassertRadios(form: ReturnType<PDFDocument['getForm']>, data: ApplicationFormData) {
  const set = (fieldName: string, state: string | null) => {
    try {
      const af = form.getField(fieldName).acroField;
      af.dict.set(PDFName.of('V'), PDFName.of(state ?? 'Off'));
      for (const w of af.getWidgets()) {
        let has = false;
        if (state) {
          try {
            const ap = w.dict.lookupMaybe(PDFName.of('AP'), PDFDict);
            const n = ap?.lookupMaybe(PDFName.of('N'), PDFDict);
            if (n) for (const k of n.keys()) if (k.toString() === `/${state}`) has = true;
          } catch { /* ignore */ }
        }
        w.dict.set(PDFName.of('AS'), PDFName.of(has && state ? state : 'Off'));
      }
    } catch { /* ignore */ }
  };

  if (data.gender === 'Male') set('Check Box2', '2');
  else if (data.gender === 'Female') set('Check Box2', '1');

  const nat = String(data.nationality || '').toLowerCase().trim();
  if (nat === 'malaysian' || nat === 'malaysia' || nat === '') set('Check Box3', '2');
  else set('Check Box3', '1');

  set('Check Box16', data.related_to_bmm_staff ? '1' : '2');

  if (data.financing_limit_type === 'specified') set('Check Box11', 'Yes');
  else set('Check Box11', '1'); // default Unspecified

  if (data.fatca_decl_1 != null) set('Check Box12', data.fatca_decl_1 ? '1' : 'Yes');
  if (data.fatca_decl_2 != null) set('Check Box13', data.fatca_decl_2 ? '2' : 'Yes');
  if (data.agree_declaration) set('Check Box15', 'Yes');

  if (data.supp_name) {
    if (data.supp_gender === 'Male') set('Check Boxx', '1');
    else if (data.supp_gender === 'Female') set('Check Boxx', 'Yes');
    const snat = String(data.supp_nationality || '').toLowerCase().trim();
    if (snat === 'malaysian' || snat === 'malaysia' || snat === '') set('Check Box00', '1');
    else set('Check Box00', 'Yes');
  }
}
