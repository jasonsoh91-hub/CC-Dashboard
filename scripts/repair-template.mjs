// One-time repair for public/templates/muamalat application form.pdf
// Root cause: 61 form fields have widgets detached from every page (no /P,
// not in any page /Annots). Lenient viewers (Chrome) render them off the
// AcroForm tree; strict viewers (Preview, Adobe mobile) draw only page
// /Annots -> those fields show blank. This re-attaches each detached widget
// to its correct page and sets /P so it renders everywhere.
//
// Run: node scripts/repair-template.mjs
// Writes: repaired template in place + backup .ORIGINAL.pdf + /tmp/muamalat-test.pdf marker check.

import { PDFDocument, PDFName, PDFBool } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const TPL = 'public/templates/muamalat application form.pdf';
const BAK = '.template-backups/muamalat application form.ORIGINAL.pdf';

// Detached-field -> page index. Derived from field semantics + coords.
// Page 0 = main applicant/card/address, 1 = employment+income+supplementary,
// 2 = declarations/FATCA/signatures.
const PAGE = {
  // ---- page 0 : main applicant ----
  'Date of Birth': 0, 'Police ID': 0, 'Others - Nationality': 0, 'Salutation': 0,
  'MyKad': 0, 'Name on Card': 0,
  'Correspondence Address Checkbox': 0, 'Permanant Address Checkbox': 0,
  'BMMB Staff Yes': 0, 'BMMB Staff No': 0, 'BMMB Staff ID': 0, 'BMMB Relation': 0, 'BMMB Branch': 0,
  // ---- page 1 : employment / income / supplementary ----
  'Occupation': 1, 'Position': 1,
  'Employer Name': 1, 'Employment Status': 1, 'Business Clasification': 1, 'Office Tel': 1,
  'Employment Type': 1, 'Length of Service': 1, 'Employment Sector': 1,
  'Office Address  1': 1, 'Office Address  2': 1, 'Office Postcode': 1, 'Office City': 1, 'Office State': 1,
  'Monthly Income': 1, 'Other Income': 1, 'Monthly Commitment': 1, 'hardcopy checkbox': 1,
  'Sup Male Checkbox': 1, 'Sup Female Checkbox': 1,
  'Nationality Malaysia Checkbox': 1, 'Nationality Others Checkbox': 1,
  'Sup Card Name': 1, 'Sup Postcode': 1, 'Sup City': 1, 'Sup State': 1, 'Sup HP Number': 1,
  'Match Principal Address  Checkbox': 1, 'Sup Card Address 1': 1, 'Sup Card Address 2': 1,
  'Sup Police ID': 1, 'Sup DOB': 1, 'Sup Mykad': 1,
  'Sup Date': 1, 'Sup Sign': 1,
  // ---- page 2 : financing limit / declarations / signatures ----
  'Sup Limit': 2, 'Sup Set Limit': 2, 'Sup No Limit': 2,
  'No US Citizen': 2, 'Yes US Citizen': 2, 'Yes Other Country Tax': 2, 'No Other Country Tax': 2,
  'Agree Tax Fatca': 2, 'Disagree': 2, 'Main Name': 2, 'Main Date': 2, 'Main Sign': 2, 'Agree Declare': 2,
};

// Always repair from the pristine original so this script is re-runnable.
if (!fs.existsSync(BAK)) fs.writeFileSync(BAK, fs.readFileSync(TPL));
const bytes = fs.readFileSync(BAK);

const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
const ctx = doc.context;
const form = doc.getForm();
const pages = doc.getPages();
const pageRefs = pages.map(p => p.ref);

// dict -> indirect ref
const dictToRef = new Map();
for (const [ref, obj] of ctx.enumerateIndirectObjects()) dictToRef.set(obj, ref);

// which widget dicts are already on a page
const onPage = new Set();
pages.forEach(p => {
  const a = p.node.Annots();
  if (!a) return;
  for (let i = 0; i < a.size(); i++) onPage.add(ctx.lookup(a.get(i)));
});

function ensureAnnots(page) {
  let a = page.node.Annots();
  if (!a) { a = ctx.obj([]); page.node.set(PDFName.of('Annots'), a); }
  return a;
}

let attached = 0, missed = [];
for (const f of form.getFields()) {
  const name = f.getName();
  const widgets = f.acroField.getWidgets();
  const anyOn = widgets.some(w => onPage.has(w.dict));
  if (anyOn) continue; // already renders (has an on-page widget)

  let pg = PAGE[name];
  if (pg === undefined) {
    // fallback: page 0 fields never exceed y=586; anything higher -> page 1
    const r = widgets[0].dict.get(PDFName.of('Rect'));
    const y = r ? r.get(1).asNumber() : 0;
    pg = y > 586 ? 1 : 0;
    missed.push(`${name} (no map, y=${y.toFixed(0)} -> guessed page ${pg})`);
  }

  const page = pages[pg];
  const annots = ensureAnnots(page);
  for (const w of widgets) {
    const ref = dictToRef.get(w.dict);
    if (!ref) { missed.push(`${name} (no ref for widget)`); continue; }
    w.dict.set(PDFName.of('Type'), PDFName.of('Annot'));
    w.dict.set(PDFName.of('Subtype'), PDFName.of('Widget'));
    w.dict.set(PDFName.of('P'), pageRefs[pg]);
    annots.push(ref);
    attached++;
  }
}

// force viewers to use baked appearances
form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.False);

console.log(`attached ${attached} widget(s)`);
if (missed.length) { console.log('UNMAPPED / fallback:'); missed.forEach(m => console.log('  -', m)); }

const out = await doc.save();
fs.writeFileSync(TPL, out);
console.log('wrote repaired template:', TPL);

// ---- marker test PDF: fill every text field with its own name ----
const d2 = await PDFDocument.load(out, { ignoreEncryption: true, updateMetadata: false });
const f2 = d2.getForm();
for (const fld of f2.getFields()) {
  if (fld.constructor.name === 'PDFTextField') {
    try {
      const max = fld.getMaxLength?.();
      let v = fld.getName();
      if (max && v.length > max) v = v.slice(0, max);
      fld.setText(v);
    } catch {}
  }
}
try { f2.updateFieldAppearances(); } catch {}
const test = await d2.save();
fs.writeFileSync('/tmp/muamalat-test.pdf', test);
console.log('wrote marker test:', '/tmp/muamalat-test.pdf');
