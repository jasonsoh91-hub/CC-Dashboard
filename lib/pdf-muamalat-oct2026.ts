// Filler for the Bank Muamalat Credit Card-i form, Oct 2026 edition.
//
// The bank shipped this version FLAT (no fields). We built the fillable
// template ourselves with clean field names — see
// scripts/templates/build-muamalat-oct2026-editable.mjs. Layout is the v2
// (Mar 2025) form plus a new top block: Application Type (New/Add), Awwal
// Basic Card-i, and a one-time Balance Transfer (Awwal add-card only).
//
// Everything is plain text + checkboxes (no dropdowns), so values are written
// as-is after the route's enum normalisation.
import { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } from 'pdf-lib';
import type { ApplicationFormData } from './types';
import { nameOnCard } from './name-on-card';

const CARD_FIELDS: Record<string, string> = {
  'visa platinum-i': 'card_visa_platinum',
  'visa infinite-i': 'card_visa_infinite',
  'muamalat pos visa platinum-i': 'card_pos_visa_platinum',
  'muamalat pos visa infinite-i': 'card_pos_visa_infinite',
  'muamalat amanahraya visa platinum-i': 'card_amanahraya_visa_platinum',
  'muamalat eon visa platinum-i': 'card_eon_visa_platinum',
  'muamalat eon visa infinite-i': 'card_eon_visa_infinite',
  'awwal basic card-i': 'card_awwal_basic',
};

// pdf-lib standard fonts are WinAnsi only; pasted data often carries smart
// quotes / dashes / non-Latin chars that would crash generation.
export const clean = (v: unknown): string => {
  if (v == null) return '';
  return String(v)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x20-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const noComma = (v: unknown) => clean(v).replace(/,/g, '').trim();


const parseMY = (address: string) => {
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
  // State = the one named LAST after the postcode: the city often contains a
  // state name ("Johor Bahru, Johor", "Kuala Terengganu, Terengganu").
  const tail = pc ? a.substring(pc.index! + pc[0].length) : a;
  const lowTail = tail.toLowerCase();
  let state = '';
  let statePos = -1;
  for (const s of states) {
    const i = lowTail.lastIndexOf(s.toLowerCase());
    if (i >= 0 && (i > statePos || (i === statePos && s.length > state.length))) { state = s; statePos = i; }
  }
  if (!state) {
    for (const s of states) if (a.toLowerCase().includes(s.toLowerCase())) { state = s; break; }
  }
  let city = '';
  if (pc && statePos >= 0) {
    city = tail.substring(0, statePos).replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // "53100 Kuala Lumpur", "75000 Melaka": city and state are the same name.
  if (!city && ['Kuala Lumpur', 'Putrajaya', 'Labuan', 'Melaka'].includes(state)) city = state;
  // Address lines should not repeat postcode/city/state that have their own boxes.
  let street = a;
  if (pc) street = a.substring(0, pc.index!).replace(/[,\s]+$/, '');
  return { postcode: pc ? pc[1] : '', city, state, street };
};

const nameForCard = (full: string) => nameOnCard(clean(full));

const digits = (v: unknown) => clean(v).replace(/[^0-9]/g, '');

// Accepts "1990-05-14", "14/05/1990", "14-5-90"... → "14/05/1990" (10 boxes)
const fmtDOB = (v: unknown): string => {
  const s = clean(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 30 ? '19' : '20') + m[3] : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  return s.substring(0, 10);
};

// "6 thn", "2 tahun 3 bulan", "5" → "6 years", "2 years 3 months", "5 years"
const fmtTenure = (v: unknown): string => {
  const s = clean(v);
  if (!s) return '';
  const y = s.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|thn|tahun)/i);
  const m = s.match(/(\d+)\s*(?:months?|mths?|bln|bulan)/i);
  if (!y && !m) return /^\d+$/.test(s) ? `${s} year${s === '1' ? '' : 's'}` : s;
  const parts: string[] = [];
  if (y) parts.push(`${y[1]} year${y[1] === '1' ? '' : 's'}`);
  if (m) parts.push(`${m[1]} month${m[1] === '1' ? '' : 's'}`);
  return parts.join(' ');
};

const isMalaysian = (v: unknown) => {
  const n = clean(v).toLowerCase();
  return n === '' || n === 'malaysian' || n === 'malaysia' || n === 'warganegara';
};

export async function fillBankMuamalatOct2026Form(
  pdfBytes: Buffer | Uint8Array,
  data: ApplicationFormData,
  opts: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const d = data as ApplicationFormData & Record<string, unknown>;

  const setText = (name: string, value: unknown, keepPadding = false) => {
    const val = keepPadding ? clean(value).padStart(String(value ?? '').length, ' ') : clean(value);
    if (!val) return;
    try {
      const f = form.getField(name);
      if (!(f instanceof PDFTextField)) return;
      const max = f.getMaxLength();
      f.setText(max ? val.substring(0, max) : val);
    } catch {
      console.warn(`[PDF-oct2026] text field missing: ${name}`);
    }
  };
  // Signature name: two single-line boxes (<base>_top after "Name / Nama :", <base> below).
  // Whole name goes on the lower line if it fits at a readable size; otherwise the first
  // words fill the top box and the rest go below.
  const signName = (base: string, value: unknown) => {
    const v = clean(value);
    if (!v) return;
    let lowerW = 105, topW = 48;
    try {
      lowerW = (form.getField(base) as PDFTextField).acroField.getWidgets()[0].getRectangle().width - 4;
      topW = (form.getField(`${base}_top`) as PDFTextField).acroField.getWidgets()[0].getRectangle().width - 4;
    } catch { /* fall back to defaults */ }
    if (font.widthOfTextAtSize(v, 6.5) <= lowerW) { setText(base, v); return; }
    // Largest size at which (top words, remaining words) both fit their boxes.
    const all = v.split(' ');
    let top = '', words = all;
    for (let size = 7; size >= 4.5; size -= 0.25) {
      let i = 0, t = '';
      while (i < all.length - 1) {
        const next = t ? `${t} ${all[i]}` : all[i];
        if (font.widthOfTextAtSize(next, size) > topW) break;
        t = next; i++;
      }
      top = t; words = all.slice(i);
      if (font.widthOfTextAtSize(words.join(' '), size) <= lowerW) break;
    }
    setText(`${base}_top`, top);
    setText(base, words.join(' '));
  };
  const check = (name: string, on = true) => {
    try {
      const f = form.getField(name);
      if (f instanceof PDFCheckBox) { if (on) f.check(); else f.uncheck(); }
    } catch {
      console.warn(`[PDF-oct2026] checkbox missing: ${name}`);
    }
  };
  const today = new Date().toLocaleDateString('en-GB'); // dd/mm/yyyy

  // Split an address across the long line 1 (~255pt) and short line 2
  // (~140pt) by measured width, so line 2 isn't crammed into a tiny font.
  const splitAddr = (address: string): [string, string] => {
    const words = clean(address).split(' ').filter(Boolean);
    let l1 = '';
    let i = 0;
    for (; i < words.length; i++) {
      const next = (l1 + ' ' + words[i]).trim();
      if (font.widthOfTextAtSize(next, 8) <= 252) l1 = next;
      else break;
    }
    return [l1, words.slice(i).join(' ')];
  };

  // ---------------- top block ----------------
  const appType = clean(d.application_type).toLowerCase();
  if (appType.startsWith('add') || appType.includes('tambahan')) check('app_type_add_card');
  else check('app_type_new_card'); // default: new card
  const cardField = CARD_FIELDS[clean(d.card_type).toLowerCase()];
  if (cardField) check(cardField);
  else if (d.card_type) console.warn(`[PDF-oct2026] unknown card type: ${d.card_type}`);
  // Balance transfer only applies to Awwal add-card applications.
  if (cardField === 'card_awwal_basic' && appType.startsWith('add') && d.balance_transfer != null) {
    check(d.balance_transfer ? 'balance_transfer_yes' : 'balance_transfer_no');
  }

  // ---------------- A. personal ----------------
  setText('salutation', d.salutation);
  setText('name_as_per_ic', d.name_as_per_ic);
  if (d.gender === 'Male') check('gender_male');
  else if (d.gender === 'Female') check('gender_female');
  if (isMalaysian(d.nationality)) check('nationality_malaysia');
  else { check('nationality_others'); setText('nationality_others_text', d.nationality); }
  // MyKad box is also used for passport numbers (keep letters for those).
  const ic = digits(d.mykad_number);
  setText('mykad_number', ic.length === 12 ? ic : clean(d.mykad_number || d.passport_number).replace(/[\s-]/g, ''));
  setText('police_military_id', clean(d.police_military_id).replace(/\s/g, ''));
  setText('date_of_birth', fmtDOB(d.date_of_birth));
  setText('mother_maiden_name', d.mother_name);
  setText('race', d.race);
  setText('religion', d.religion);
  setText('marital_status', d.marital_status);
  setText('house_tel_no', d.house_tel_no);
  setText('hp_number', d.hp_number);
  setText('email', d.email_address);
  setText('name_on_card', nameForCard(clean(d.name_on_card) || clean(d.name_as_per_ic)));

  const res = parseMY(clean(d.residential_address));
  const [r1, r2] = splitAddr(res.street || clean(d.residential_address));
  setText('residential_address_1', r1);
  setText('residential_address_2', r2);
  setText('residential_postcode', noComma(d.postcode || res.postcode));
  setText('residential_city', noComma(d.city || res.city));
  setText('residential_state', noComma(d.state || res.state));

  if (clean(d.correspondence_address)) {
    const cor = parseMY(clean(d.correspondence_address));
    const [c1, c2] = splitAddr(cor.street || clean(d.correspondence_address));
    setText('correspondence_address_1', c1);
    setText('correspondence_address_2', c2);
    setText('correspondence_postcode', noComma(d.correspondence_postcode || cor.postcode));
    setText('correspondence_city', noComma(d.correspondence_city || cor.city));
    setText('correspondence_state', noComma(d.correspondence_state || cor.state));
  } else {
    check('correspondence_same_as_residential');
  }
  // We never capture a separate permanent address → same as residential.
  if (!clean(d.correspondence_address)) check('permanent_same_as_residential_and_correspondence');

  setText('residential_status', d.residence_status);
  setText('education_level', d.education_level);
  if (d.related_to_bmm_staff) {
    check('bmmb_staff_yes');
    setText('bmmb_staff_name_id', [d.bmm_staff_name, d.bmm_staff_id].filter(Boolean).join(' / '));
    setText('bmmb_staff_relationship', d.bmm_staff_relationship);
    setText('bmmb_staff_department_branch', d.bmm_staff_department);
  } else {
    check('bmmb_staff_no');
  }

  // ---------------- B. employment ----------------
  setText('employer_name', d.employer_name);
  setText('occupation', d.occupation);
  setText('position', d.position);
  setText('employment_status', d.employment_status);
  setText('business_classification', d.business_classification);
  setText('office_tel', d.office_number);
  setText('employment_type', d.employment_type);
  setText('length_of_service', fmtTenure(d.length_of_service));
  setText('employment_sector', d.employment_sector);
  const off = parseMY(clean(d.office_address));
  const [o1, o2] = splitAddr(off.street || clean(d.office_address));
  setText('office_address_1', o1);
  setText('office_address_2', o2);
  setText('office_postcode', noComma(d.office_postcode || off.postcode));
  setText('office_city', noComma(d.office_city || off.city));
  setText('office_state', noComma(d.office_state || off.state));

  // ---------------- C. income ----------------
  setText('monthly_income', noComma(d.monthly_income));
  setText('other_income', noComma(d.other_income_source));
  setText('monthly_commitment', noComma(d.monthly_commitment));

  // ---------------- D. emergency ----------------
  setText('emergency_name', d.emergency_full_name);
  setText('emergency_contact_no', d.emergency_contact_number);
  setText('emergency_relationship', d.emergency_relation);

  // ---------------- E. statement ----------------
  if (d.opt_hardcopy_statement) check('hardcopy_statement');

  // ---------------- F/G. supplementary ----------------
  if (clean(d.supp_name)) {
    setText('supp_salutation', d.supp_salutation);
    setText('supp_name', d.supp_name);
    if (d.supp_gender === 'Male') check('supp_gender_male');
    else if (d.supp_gender === 'Female') check('supp_gender_female');
    if (isMalaysian(d.supp_nationality)) check('supp_nationality_malaysia');
    else { check('supp_nationality_others'); setText('supp_nationality_others_text', d.supp_nationality); }
    setText('supp_mykad_number', clean(d.supp_mykad_number).replace(/[\s-]/g, ''));
    setText('supp_police_military_id', clean(d.supp_police_military_id).replace(/\s/g, ''));
    setText('supp_date_of_birth', fmtDOB(d.supp_date_of_birth));
    setText('supp_hp_number', d.supp_hp_number);
    setText('supp_name_on_card', nameForCard(clean(d.supp_name_on_card) || clean(d.supp_name)));
    if (d.supp_match_principal_address) {
      check('supp_match_principal_address');
    } else {
      const sa = parseMY(clean(d.supp_residential_address));
      const [s1, s2] = splitAddr(sa.street || clean(d.supp_residential_address));
      setText('supp_address_1', s1);
      setText('supp_address_2', s2);
      setText('supp_postcode', noComma(d.supp_postcode || sa.postcode));
      setText('supp_city', noComma(d.supp_city || sa.city));
      setText('supp_state', noComma(d.supp_state || sa.state));
    }
    setText('supp_employer_name', d.supp_employer_name);
    setText('supp_business_classification', d.supp_business_classification);
    setText('supp_employment_type', d.supp_employment_type);
    setText('supp_relation_to_principal', d.supp_relation_to_principal);
    signName('supp_sign_name', d.supp_name);
    setText('supp_sign_date', today);
  }

  // ---------------- I. financing ----------------
  if (d.agree_tawarruq) check('agree_aqad_tawarruq');
  if (d.financing_limit_type === 'specified' && digits(d.specified_financing_limit)) {
    check('financing_limit_specified');
    // 8 boxes sit before a printed ".00": right-align the ringgit amount.
    const rm = digits(String(d.specified_financing_limit).split('.')[0]).slice(-8);
    setText('financing_limit_amount', rm.padStart(8, ' '), true);
  } else {
    check('financing_limit_unspecified');
  }

  // ---------------- J/K/L. declarations ----------------
  // fatca_decl_1 true = "No, not a US citizen"; fatca_decl_2 true = "No other tax residency"
  if (d.fatca_decl_1 != null) check(d.fatca_decl_1 ? 'us_citizen_no' : 'us_citizen_yes');
  if (d.fatca_decl_2 != null) check(d.fatca_decl_2 ? 'tax_resident_other_country_no' : 'tax_resident_other_country_yes');
  if (d.tax_fatca_decl) check('agree_tax_fatca');
  if (d.agree_declaration) check('pdpa_agree');
  signName('principal_name', d.name_as_per_ic);
  setText('principal_date', today);

  // ---------------- for BMMB use only ----------------
  setText('introduced_by', d.agent_name || d.sales_exec_name);
  setText('introducer_ic', d.agent_ic || d.sales_exec_ic);
  setText('sales_exec_email', d.sales_exec_email);
  setText('staff_id', clean(d.agent_staff_id || d.sales_exec_staff_id).replace(/\s/g, ''));
  setText('branch', d.branch_name);
  setText('branch_tel', d.branch_tel_no);
  setText('branch_manager_name', d.branch_manager_name);
  setText('branch_manager_email', d.branch_manager_email);

  // Shrink long values so they fit their line instead of clipping.
  for (const f of form.getFields()) {
    if (!(f instanceof PDFTextField) || f.isCombed()) continue;
    const v = f.getText();
    if (!v) continue;
    const rect = f.acroField.getWidgets()[0].getRectangle();
    const w = rect.width - 4;
    let size = rect.height < 11.5 ? 7.5 : 9;
    while (size > 5 && font.widthOfTextAtSize(v, size) > w) size -= 0.5;
    f.setFontSize(size);
  }
  form.updateFieldAppearances(font);
  // Bake the text in: an editable PDF gets redrawn by Preview/Acrobat with their own
  // font, which pushes letters off the comb boxes and over neighbouring labels.
  if (opts.flatten !== false) form.flatten();
  return new Uint8Array(await pdfDoc.save());
}
