// Builds a fillable version of the flat Bank Muamalat Credit Card-i form (Oct 2026 / footer "v2 Mar 2025").
// Positions: pages 2-3 identical to our v2 legacy template; page 1 Section A = v2 shifted down 66pt;
// top block + BMMB-use block measured from the render (2px/pt).
import { createRequire } from 'module';
const require = createRequire('/Users/jason.soh/cc-agent-dashboard/package.json');
const { PDFDocument, StandardFonts, TextAlignment } = require('pdf-lib');
import fs from 'fs';

const [src, out, mode] = process.argv.slice(2); // mode=label -> fill each field with its own name

const S = 66; // page-1 Section A shift vs v2
// [type, name, page, x, y, w, h, opts]
// type: t=text, c=checkbox, g=comb(grid) with opts.cells
const F = [];
const t = (n, p, x, y, w, h, o = {}) => F.push(['t', n, p, x, y, w, h, o]);
const c = (n, p, x, y, s = 9) => F.push(['c', n, p, x, y, s, s, {}]);
const g = (n, p, x, y, w, h, cells, o = {}) => F.push(['g', n, p, x, y, w, h, { cells, ...o }]);

// ---------- PAGE 1: top block (new in this version) ----------
c('app_type_new_card', 1, 25, 596.5);
c('app_type_add_card', 1, 136, 596.5);
c('card_visa_platinum', 1, 25, 564);
c('card_visa_infinite', 1, 99.5, 564);
c('card_pos_visa_platinum', 1, 167, 564);
c('card_pos_visa_infinite', 1, 294, 564);
c('card_amanahraya_visa_platinum', 1, 411.5, 564);
c('card_eon_visa_platinum', 1, 25, 545);
c('card_eon_visa_infinite', 1, 167, 545);
c('card_awwal_basic', 1, 294.5, 545);
c('balance_transfer_yes', 1, 25, 498.5);
c('balance_transfer_no', 1, 84, 498.5);

// ---------- PAGE 1: Section A left column ----------
t('salutation', 1, 97.9, 518.3 - S, 186.6, 13.9);
t('name_as_per_ic', 1, 24.7, 473.8 - S, 259, 13.9);
c('gender_male', 1, 25, 372);
c('gender_female', 1, 121.5, 372);
c('nationality_malaysia', 1, 25, 344);
c('nationality_others', 1, 121.5, 344);
t('nationality_others_text', 1, 199.6, 411.9 - S, 85.8, 13);
g('mykad_number', 1, 25, 298.5, 203.5, 12.5, 12);
g('police_military_id', 1, 25, 263.5, 203.5, 12, 12);
g('date_of_birth', 1, 84.5, 237.5, 144, 12.5, 10); // DD/MM/YYYY
t('mother_maiden_name', 1, 157.1, 284.2 - S, 127, 13.9);
t('race', 1, 82.9, 263.9 - S, 201, 13.9);
t('religion', 1, 88.4, 244.9 - S, 196.4, 13.9);
t('marital_status', 1, 154.8, 227.6 - S, 129.2, 13.9);
t('house_tel_no', 1, 149.8, 208.9 - S, 134.7, 13.9);
t('hp_number', 1, 149.8, 191.3 - S, 134.7, 13.9);
t('email', 1, 149.8, 170.6 - S, 134.7, 13.9);
g('name_on_card', 1, 24.5, 66, 260, 12.5, 19);

// ---------- PAGE 1: Section A right column ----------
t('residential_address_1', 1, 303.4, 502.8 - S, 258.9, 13.3);
t('residential_address_2', 1, 303.4, 488.4 - S, 140.6, 13.9);
t('residential_postcode', 1, 520, 487.8 - S, 42.3, 13.9);
t('residential_city', 1, 353.9, 472.4 - S, 90.1, 13.9);
t('residential_state', 1, 504, 472.4 - S, 58.7, 13.9);
c('correspondence_same_as_residential', 1, 303.2, 435.5 - S);
t('correspondence_address_1', 1, 302.6, 412.4 - S, 260.1, 13.8);
t('correspondence_address_2', 1, 302.6, 398.2 - S, 140.8, 13.9);
t('correspondence_postcode', 1, 517.3, 397.4 - S, 45.4, 14);
t('correspondence_city', 1, 353.2, 382.1 - S, 90.2, 13.9);
t('correspondence_state', 1, 501.4, 382.1 - S, 61.3, 13.9);
c('permanent_same_as_residential_and_correspondence', 1, 303.2, 345.1 - S);
t('permanent_address_1', 1, 303.6, 322 - S, 259.1, 13.8);
t('permanent_address_2', 1, 303.6, 307.7 - S, 140.8, 13.9);
t('permanent_postcode', 1, 518.3, 307 - S, 44.4, 13.9);
t('permanent_city', 1, 354.1, 291.6 - S, 90.3, 13.9);
t('permanent_state', 1, 502.3, 291.6 - S, 60.4, 13.9);
t('residential_status', 1, 303.1, 254.9 - S, 259.1, 13.9);
t('education_level', 1, 302.6, 227.6 - S, 260.1, 12);
c('bmmb_staff_yes', 1, 303.2, 196.8 - S);
c('bmmb_staff_no', 1, 383.2, 196.8 - S);
t('bmmb_staff_name_id', 1, 459.4, 156 - S, 103.3, 13.9);
t('bmmb_staff_relationship', 1, 423.7, 134.5 - S, 139, 13.9);
t('bmmb_staff_department_branch', 1, 468.1, 114.2 - S, 94.6, 14);

// ---------- PAGE 2 (same layout as v2) ----------
t('employer_name', 2, 27.6, 785.8, 258.8, 10.5);
t('occupation', 2, 115.8, 772, 170.5, 10);
t('position', 2, 97.3, 757.4, 189, 10);
t('employment_status', 2, 27.4, 728.8, 258.9, 10.5);
t('business_classification', 2, 27.4, 700.3, 258.9, 10.7);
t('office_tel', 2, 140.2, 680.3, 146.2, 10);
t('employment_type', 2, 305.3, 785.8, 264.5, 10.5);
t('length_of_service', 2, 305.8, 756.2, 264, 11.2);
t('employment_sector', 2, 305.3, 733.6, 264.5, 10.5);
t('office_address_1', 2, 305.2, 706.7, 264.6, 10.5);
t('office_address_2', 2, 305.2, 692, 128.1, 10);
t('office_postcode', 2, 506.4, 692, 63.4, 10);
t('office_city', 2, 356.5, 677.5, 76.8, 10);
t('office_state', 2, 488.6, 677.5, 81.2, 10);
t('monthly_income', 2, 60, 608.5, 114.8, 11);
t('other_income', 2, 243.7, 609.4, 114.7, 11);
t('monthly_commitment', 2, 435.8, 611.2, 114.9, 11);
t('emergency_name', 2, 27.2, 503.3, 259.1, 13);
t('emergency_contact_no', 2, 435.6, 524.6, 133.9, 13);
t('emergency_relationship', 2, 463.7, 503, 105.8, 13);
c('hardcopy_statement', 2, 239.5, 397.7);
// F) Supplementary cardholder
t('supp_salutation', 2, 26.6, 290.5, 259.7, 12);
t('supp_name', 2, 26.6, 252.2, 259.7, 12);
c('supp_gender_male', 2, 27.8, 225);
c('supp_gender_female', 2, 122.4, 225);
c('supp_nationality_malaysia', 2, 27.8, 197.3);
c('supp_nationality_others', 2, 122.4, 197.3);
t('supp_nationality_others_text', 2, 200, 198.5, 86, 12);
g('supp_mykad_number', 2, 27, 154.5, 203.5, 12.5, 12);
g('supp_police_military_id', 2, 305.5, 284.5, 203.5, 12.5, 12);
g('supp_date_of_birth', 2, 362.5, 265.5, 162.5, 12.5, 10);
t('supp_hp_number', 2, 429.5, 251.6, 140.3, 12);
g('supp_name_on_card', 2, 305, 217, 260, 12.5, 19);
c('supp_match_principal_address', 2, 305.4, 190.9);
t('supp_address_1', 2, 305.3, 176.5, 264.5, 13);
t('supp_address_2', 2, 305.3, 162.2, 140.6, 12);
t('supp_postcode', 2, 520, 165.5, 49.8, 10);
t('supp_city', 2, 355.8, 147.1, 90.1, 12);
t('supp_state', 2, 504, 150.1, 65.8, 12);
// G) Supplementary employment
t('supp_employer_name', 2, 26.6, 86.4, 259.7, 12.5);
t('supp_business_classification', 2, 26.6, 62.4, 259.7, 12);
t('supp_employment_type', 2, 305.3, 88, 264.5, 12.4);
t('supp_relation_to_principal', 2, 305.4, 53.6, 264.4, 11.7);

// ---------- PAGE 3 (same layout as v2) ----------
c('agree_aqad_tawarruq', 3, 26, 789.5, 18);
c('financing_limit_specified', 3, 25.8, 740.4, 18);
c('financing_limit_unspecified', 3, 25.8, 721.4, 18);
g('financing_limit_amount', 3, 190.5, 743.5, 103, 11, 8, { right: true }); // RM digits before the printed ".00"
c('us_citizen_yes', 3, 394.2, 588.2);
c('us_citizen_no', 3, 451.9, 588.2);
c('tax_resident_other_country_yes', 3, 394.2, 572.4);
c('tax_resident_other_country_no', 3, 451.9, 572.4);
c('agree_tax_fatca', 3, 25.8, 488.6, 18);
c('pdpa_agree', 3, 36.8, 354.8);
c('pdpa_disagree', 3, 36.8, 335.4);
t('principal_name', 3, 183, 189.5, 108, 13, { multi: true });
t('principal_date', 3, 238, 181.5, 53, 11);
t('supp_sign_name', 3, 466, 189.5, 110, 13, { multi: true });
t('supp_sign_date', 3, 522, 181.5, 55, 11);
// For BMMB use only
t('introduced_by', 3, 160, 131, 137, 12);
t('introducer_ic', 3, 160, 117, 137, 12);
t('sales_exec_email', 3, 160, 98, 137, 12);
g('staff_id', 3, 160.5, 75.5, 101.5, 12.5, 6);
t('branch', 3, 384, 129, 186, 12);
t('branch_tel', 3, 444, 113.5, 126, 12);
t('branch_manager_name', 3, 412, 88, 158, 12);
t('branch_manager_email', 3, 439, 64, 131, 12);

// ---------- build ----------
const doc = await PDFDocument.load(fs.readFileSync(src));
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();
const pages = doc.getPages();
const noBox = { borderWidth: 0, borderColor: undefined, backgroundColor: undefined };
const names = new Set();
for (const [type, name, p, x, y, w, h, o] of F) {
  if (names.has(name)) throw new Error('dup ' + name);
  names.add(name);
  const page = pages[p - 1];
  if (type === 'c') {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: w, height: h, ...noBox });
    if (mode === 'label') cb.check();
  } else {
    const tf = form.createTextField(name);
    if (type === 'g') { tf.setMaxLength(o.cells); tf.enableCombing(); }
    if (o.multi) tf.enableMultiline();
    tf.addToPage(page, { x, y, width: w, height: h, font, ...noBox });
    tf.setFontSize(type === 'g' ? 9 : (h < 11.5 ? 7.5 : 9));
    if (mode === 'label') {
      const v = type === 'g' ? 'X'.repeat(o.cells) : name;
      tf.setText(v);
    }
  }
}
form.updateFieldAppearances(font);
if (mode === 'label') form.flatten();
doc.setTitle('Bank Muamalat Credit Card-i Application Form (Editable)');
fs.writeFileSync(out, await doc.save());
console.log('fields', F.length, '->', out);
