// Hard test: FAKE applicants through the production chain.
// Run from repo root: npx tsx --tsconfig tsconfig.json scripts/templates/hard-test-oct2026.mts <outDir> [ids]
// extraction (real Gemini) -> page.tsx-equivalent mapping -> normalizeApplicationEnums
// -> route sanitizeAndParse (ApplicationFormDataSchema) -> lib/pdf.ts fillPdfForm (live template)
import fs from 'fs';
import { getGLMOrchestrator } from '../../lib/agents/GLMAgentOrchestrator';
import { normalizeApplicationEnums } from '../../lib/normalize-enums';
import { ApplicationFormDataSchema } from '../../lib/types';
import { fillPdfForm } from '../../lib/pdf';
import { nameOnCard } from '../../lib/name-on-card';
import { createRequire } from 'module';
const { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } = createRequire(import.meta.url)('pdf-lib');

const OUT = process.argv[2];
const ONLY = process.argv[3];

type Case = { id: string; title: string; raw: string; ui: Record<string, unknown>; expect: Record<string, string | boolean> };
const cases: Case[] = [
  { id: '01', title: 'Very long Malay name + very long address', ui: { card_type: 'Muamalat Eon Visa Infinite-i' },
    raw: `nama penuh: Wan Nur Syafiqah Aleeya binti Wan Mohd Khairul Anuar Shah
ic: 920315-03-5568
no fon 011-23456789
email wnsyafiqah.aleeya.test@hotmail.com
alamat: Lot 1234-A, Lorong Kenanga Indah 7, Kampung Kubang Kerian Dalam, Off Jalan Raja Perempuan Zainab II, 16150 Kota Bharu, Kelantan Darul Naim
mak: Che Rohani binti Che Mat
kerja: Pegawai Perubatan UD48 di Hospital Universiti Sains Malaysia, 8 tahun 3 bulan
gaji RM 12,800, tanggungan rm4k
kahwin, emergency suami Mohd Hafiz 013-9988776`,
    expect: { name_on_card: 'WAN NUR SYAFIQAH', card_eon_visa_infinite: true, app_type_new_card: true, mykad_number: '920315035568', date_of_birth: '15/03/1992', residential_postcode: '16150', residential_state: 'Kelantan', gender_female: true, race: 'Malay', religion: 'Islam' } },

  { id: '02', title: 'Indian name A/L, KL, married, Hindu stated', ui: { card_type: 'Visa Platinum-i' },
    raw: `Name: Saravanan a/l Muniandy
NRIC 850710-10-6131
H/P: +60 12-555 0198
saravanan.m.test@gmail.com
Add: 22, Jalan Ipoh Kecil, Off Jalan Raja Laut, 50350 KL
Religion Hindu, married, 2 kids
Work: Tenaga Nasional Berhad, Senior Engineer, since 2015
Office Jalan Bangsar 59200 Kuala Lumpur 03-22965566
Salary 9,500, commitments car loan 1,100 + PTPTN 300
Wife Kavitha 016-2223344
Degree in electrical eng, own house`,
    expect: { card_visa_platinum: true, mykad_number: '850710106131', gender_male: true, race: 'Indian', residential_city: 'Kuala Lumpur', residential_postcode: '50350' } },

  { id: '03', title: 'Foreigner with passport, no MyKad', ui: { card_type: 'Visa Platinum-i' },
    raw: `Hi boss, client details:
Name: Budi Santoso
Indonesian citizen, passport no B 1234567
DOB 4 Feb 1987
Phone 017-6655443
Email budi.santoso87.test@gmail.com
Stay at Unit A-12-3, Vista Komanwel, Bukit Jalil, 57700 Kuala Lumpur (rented)
Works at Sime Darby Plantation as Agronomist 5 yrs, salary RM10k
Emergency: Sri Wahyuni (wife) +62 812 3456 7890`,
    expect: { nationality_others: true, residential_postcode: '57700', date_of_birth: '04/02/1987', employment_status: 'Permanent', name_on_card: 'BUDI SANTOSO' } },

  { id: '04', title: 'Unicode trap: emojis, smart quotes, Chinese chars, en-dashes', ui: { card_type: 'Muamalat Pos Visa Platinum-i' },
    raw: `👋 Customer “Lim Wei Jie” 林伟杰
IC – 900101-07-5543 ✅
HP: 012–3344556
Email: weijie.lim.test@gmail.com
Address: No. 5, Lorong Kurau 2, Taman Chai Leng, 13700 Perai, Pulau Pinang 🏠
Mother’s name: Ooi Siew Lan
Company: Penang Port Sdn Bhd – Executive, 4 yrs
Pay RM6,200 💰
Emergency: Lim Ah Seng (father) 04–3901234`,
    expect: { employment_status: 'Permanent', card_pos_visa_platinum: true, mykad_number: '900101075543', residential_state: 'Pulau Pinang', race: 'Chinese' } },

  { id: '05', title: 'Business owner, k-shorthand income, other income, director', ui: { card_type: 'Visa Infinite-i' },
    raw: `owner of Kedai Runcit Ah Huat Enterprise & also director at AH Huat Holdings Sdn Bhd
name tan ah huat ic 700228085411
hp 0193344556, tanahhuat70.test@yahoo.com
rumah sendiri: 18 Jalan Sultan Idris Shah, 30000 Ipoh, Perak
income 15k/month, other income rental 2.5k, komitmen 3.2k
SPM only, married, wife Lee Mei Fong 0125556677, 30 years in business`,
    expect: { card_visa_infinite: true, monthly_income: '15000', mykad_number: '700228085411', residential_city: 'Ipoh', residential_state: 'Perak', date_of_birth: '28/02/1970' } },

  { id: '06', title: 'Specified financing limit RM25,000.50 + hardcopy statement', ui: { card_type: 'Muamalat AmanahRaya Visa Platinum-i', financing_limit_type: 'specified', specified_financing_limit: 'RM25,000.50', opt_hardcopy_statement: true },
    raw: `Nurul Izzah binti Ahmad, 950505-05-5050, 0145566778, nurul.izzah.test@gmail.com
No 3 Jalan Dato Kelana 70200 Seremban Negeri Sembilan
Cikgu sekolah (Kementerian Pendidikan Malaysia) 6 thn, gaji 5800
bujang, emergency ayah Ahmad bin Ali 0169988776`,
    expect: { card_amanahraya_visa_platinum: true, financing_limit_specified: true, financing_limit_amount: '   25000', hardcopy_statement: true, residential_state: 'Negeri Sembilan' } },

  { id: '07', title: 'Supplementary card (spouse) at different address', ui: { card_type: 'Muamalat Eon Visa Platinum-i', supp_salutation: 'Mrs', supp_name: 'Siti Hajar binti Mohamad Yusof', supp_gender: 'Female', supp_nationality: 'Malaysian', supp_mykad_number: '930612-11-5402', supp_date_of_birth: '1993-06-12', supp_hp_number: '0137788990', supp_match_principal_address: false, supp_residential_address: 'No 9, Jalan Bunga Raya, 20000 Kuala Terengganu, Terengganu', supp_employer_name: 'Petronas', supp_business_classification: 'Public Listed', supp_employment_type: 'Private Employee', supp_relation_to_principal: 'Spouse' },
    raw: `Mohd Amirul bin Zakaria IC 910203-11-5371 HP 0198877665 amirul.z.test@gmail.com
alamat 45 Jalan Teratai, Taman Desa, 21300 Kuala Terengganu, Terengganu
Engineer at Petronas Carigali 7 years gaji 11000, isteri Siti Hajar 0137788990`,
    expect: { supp_name: 'Siti Hajar binti Mohamad Yusof', supp_mykad_number: '930612115402', supp_date_of_birth: '12/06/1993', supp_gender_female: true, supp_postcode: '20000', supp_state: 'Terengganu', supp_name_on_card: 'SITI HAJAR', supp_city: 'Kuala Terengganu', supp_sign_name: 'Siti Hajar binti Mohamad Yusof' } },

  { id: '08', title: 'Correspondence address differs from residential', ui: { card_type: 'Visa Platinum-i', correspondence_address: 'PO Box 1188, Jalan Tun Razak, 50400 Kuala Lumpur' },
    raw: `Chong Kar Mun, 880808-14-5678, 012 888 9999, karmun.chong.test@outlook.com
Home: 12 Jalan SS2/24, 47300 Petaling Jaya, Selangor
Mail to PO Box instead. Accountant at Deloitte, 9 years, RM13,500. Single. Emergency sister Chong Kar Yee 0123456780`,
    expect: { correspondence_postcode: '50400', correspondence_state: 'Kuala Lumpur', residential_city: 'Petaling Jaya', residential_state: 'Selangor' } },

  { id: '09', title: 'Related to BMMB staff', ui: { card_type: 'Visa Platinum-i', related_to_bmm_staff: true, bmm_staff_name: 'Azman bin Hassan', bmm_staff_id: 'BM10293', bmm_staff_relationship: 'Brother', bmm_staff_department: 'Cards Division, HQ' },
    raw: `Aishah binti Hassan / 970101-01-6000 / 0112233445 / aishah.h.test@gmail.com
16 Jalan Tebrau, 80250 Johor Bahru, Johor
Nurse at KPJ Johor 3 yrs RM4,200, single, emergency abang Azman 0177788990`,
    expect: { residential_state: 'Johor', bmmb_staff_yes: true, bmmb_staff_name_id: 'Azman bin Hassan / BM10293', bmmb_staff_relationship: 'Brother', residential_city: 'Johor Bahru' } },

  { id: '10', title: 'Awwal ADD card, balance transfer NO', ui: { card_type: 'Awwal Basic Card-i', application_type: 'add', balance_transfer: false },
    raw: `Muhammad Danish bin Rosli 000415-10-1235 hp 0102345678 danish.rosli.test@gmail.com
Blok C-3-10 PPR Kota Damansara 47810 PJ Selangor
kerja grab driver 2 tahun, income 3k, bujang, emergency mak Rosnah 0193456789`,
    expect: { name_on_card: 'MUHAMMAD DANISH', card_awwal_basic: true, app_type_add_card: true, balance_transfer_no: true, balance_transfer_yes: false, date_of_birth: '15/04/2000', residential_city: 'Petaling Jaya' } },

  { id: '11', title: 'Awwal NEW card with balance_transfer=true (must NOT tick)', ui: { card_type: 'Awwal Basic Card-i', application_type: 'new', balance_transfer: true },
    raw: `Kumar Ganesan IC 980722-08-5899, 0167654321, kumar.g.test@gmail.com, 7 Jalan Pasir Puteh 31650 Ipoh Perak, clerk at Ipoh City Council 2 years 2,800`,
    expect: { card_awwal_basic: true, app_type_new_card: true, balance_transfer_yes: false, balance_transfer_no: false } },

  { id: '12', title: 'Malformed IC (11 digits), Sabah, +60 phone, CAPS email', ui: { card_type: 'Visa Platinum-i' },
    raw: `NAME: JUSTINA LOJUNI
IC: 89052112567
PHONE +6013-8765432
EMAIL JUSTINA.LOJUNI.TEST@GMAIL.COM
ADDRESS: LOT 5, TAMAN FOH SANG, JALAN LINTAS, 88300 KOTA KINABALU, SABAH
JOB: SABAH ELECTRICITY SDN BHD, TECHNICIAN, 10 YEARS, RM4,800`,
    expect: { residential_state: 'Sabah', residential_postcode: '88300', residential_city: 'KOTA KINABALU' } },

  { id: '13', title: 'Near-empty message: name + IC only', ui: { card_type: 'Visa Infinite-i' },
    raw: `ok bro this one urgent: Ong Bee Lian 760909075222`,
    expect: { mykad_number: '760909075222', gender_female: true, card_visa_infinite: true } },
  { id: '14', title: 'Melaka: city = state, no comma, lowercase', ui: { card_type: 'Visa Platinum-i' },
    raw: `nama siti khadijah binti omar, ic 030303-04-0128, 0123331234, alamat no 8 jalan bendahara 75100 melaka, kerja kerani bank islam 1 tahun gaji 2500`,
    expect: { residential_postcode: '75100', residential_state: 'Melaka', residential_city: 'Melaka', date_of_birth: '03/03/2003', gender_female: true } },
  { id: '15', title: 'Address with no postcode + Kuala Lumpur office, RM with sen', ui: { card_type: 'Muamalat Pos Visa Infinite-i' },
    raw: `Name: Ravindran s/o Krishnan, IC 800130-08-5431, HP 0122223333
Address: Taman Sri Gombak, Batu Caves, Selangor (postcode not sure)
Works: Maybank, Branch Manager, 15 years. Office: Menara Maybank, 100 Jalan Tun Perak, 50050 Kuala Lumpur
Monthly income RM18,750.60, commitment RM5,120.40`,
    expect: { residential_state: 'Selangor', residential_postcode: '', office_postcode: '50050', office_city: 'Kuala Lumpur', race: 'Indian', card_pos_visa_infinite: true } },
];

// --- page.tsx helpers (copied logic) ---
function detectRace(name: string) {
  const u = (name || '').toUpperCase();
  if (/\bBIN\b|\bBINTI\b/.test(u)) return 'Malay';
  const cn = ['LEE','TAN','LIM','NG','WONG','GOH','ONG','CHIN','CHEW','KOAY','TEH','CHONG','CHAN','TAY','YEO','YAP','LOW','TOH','SIM','KOH','OOI','KHOO','CHOO','LEONG','LAM','LAI','SOH'];
  if (cn.includes(u.split(/\s+/)[0])) return 'Chinese';
  if (/\bA\/P\b|\bA\/L\b|\bS\/O\b|\bD\/O\b/.test(u)) return 'Indian';
  return null;
}

const sanitizeAndParse = (input: any) => {
  const working = { ...input }; const blanked: string[] = [];
  for (let i = 0; i < 25; i++) {
    const r = ApplicationFormDataSchema.safeParse(working);
    if (r.success) return { data: r.data, blanked };
    let removed = false;
    for (const is of r.error.issues) { const k = String(is.path[0] ?? ''); if (k && working[k] != null) { working[k] = null; if (!blanked.includes(k)) blanked.push(k); removed = true; } }
    if (!removed) for (const is of r.error.issues) { const k = String(is.path[0] ?? ''); if (k) delete working[k]; }
  }
  const f = ApplicationFormDataSchema.partial().safeParse(working);
  return { data: f.success ? f.data : working, blanked };
};

const orch = getGLMOrchestrator(process.env.GLM_API_KEY || 'x');
const summary: any[] = [];
for (const c of cases) {
  if (ONLY && !ONLY.split(',').includes(c.id)) continue;
  const row: any = { id: c.id, title: c.title, fails: [], notes: [] };
  try {
    let x: any;
    const cache = `${OUT}/extract-${c.id}.json`;
    if (fs.existsSync(cache)) x = JSON.parse(fs.readFileSync(cache, 'utf8'));
    else {
      const r: any = await orch.processApplication(c.raw);
      x = { ...(r.finalData || {}), __conf: r.extraction?.confidence, __warn: r.extraction?.warnings };
      fs.writeFileSync(cache, JSON.stringify(x, null, 1));
    }
    row.conf = x.__conf;
    const m: any = {
      bank_id: 'bank_muamalat', application_type: 'new',
      salutation: x.salutation || (/\bbinti\b/i.test(x.name || '') ? 'Ms' : /\bbin\b/i.test(x.name || '') ? 'Mr' : undefined),
      name_as_per_ic: x.name, mykad_number: x.ic_number, passport_number: x.passport_number, hp_number: x.phone, email_address: x.email,
      residential_address: x.address, mother_name: x.mother_name, employer_name: x.employer_name, position: x.position,
      occupation: x.occupation, office_number: x.office_phone, office_address: x.employer_address, length_of_service: x.work_since,
      emergency_full_name: x.emergency_name, emergency_contact_number: x.emergency_phone, emergency_relation: x.emergency_relation,
      nationality: x.nationality || 'Malaysian', education_level: x.education_level,
      monthly_income: x.monthly_income, other_income_source: x.other_income, monthly_commitment: x.monthly_commitment,
      residence_status: x.residence_status, business_classification: x.business_classification, employment_sector: x.employment_sector,
      employment_type: x.employment_type, employment_status: x.employment_status, marital_status: x.marital_status, race: x.race, religion: x.religion,
      date_of_birth: x.date_of_birth, name_on_card: nameOnCard(x.name),
      related_to_bmm_staff: false, agree_tawarruq: true, agree_unspecified: true, fatca_decl_1: true, fatca_decl_2: true, tax_fatca_decl: true, agree_declaration: true,
      ...c.ui,
    };
    if (m.salutation === 'Mr') m.gender = 'Male'; else if (m.salutation === 'Ms' || m.salutation === 'Mrs') m.gender = 'Female';
    const ic = String(x.ic_number || '');
    if (ic.length === 12) {
      const y = +ic.slice(0, 2); m.date_of_birth = `${ic.slice(4, 6)}/${ic.slice(2, 4)}/${y > 30 ? '19' : '20'}${ic.slice(0, 2)}`;
      m.gender = +ic.replace(/\D/g, '')[11] % 2 ? 'Male' : 'Female';
    } else if (!m.gender && x.gender) m.gender = x.gender;
    if (!m.race && x.name) m.race = detectRace(x.name);
    if (!m.religion && m.race === 'Malay') m.religion = 'Islam';
    if (!m.marital_status && /wife|husband|isteri|suami|spouse/i.test(x.emergency_relation || '')) m.marital_status = 'Married';

    const n = normalizeApplicationEnums(m);
    const { data, blanked } = sanitizeAndParse(n);
    if (blanked.length) row.notes.push('zod blanked: ' + blanked.join(','));
    Object.assign(data as any, { agent_name: 'TEST AGENT', agent_ic: '900101015555', agent_staff_id: 'A1999' });
    const bytes = await fillPdfForm(data as any);
    fs.writeFileSync(`${OUT}/hard-${c.id}.pdf`, bytes);

    // read back
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const got: Record<string, string | boolean> = {};
    for (const f of doc.getForm().getFields()) {
      if (f instanceof PDFTextField) { got[f.getName()] = f.getText() || ''; }
      else if (f instanceof PDFCheckBox) got[f.getName()] = f.isChecked();
    }
    for (const [k, v] of Object.entries(c.expect)) {
      const g = got[k];
      const ok = typeof v === 'boolean' ? g === v : String(g ?? '').toLowerCase() === String(v).toLowerCase();
      if (!ok) row.fails.push(`${k}: want ${JSON.stringify(v)} got ${JSON.stringify(g)}`);
    }
    // overflow check on non-comb text fields
    for (const f of doc.getForm().getFields()) {
      if (!(f instanceof PDFTextField) || f.isCombed() || !f.getText()) continue;
      const w = f.acroField.getWidgets()[0].getRectangle().width - 4;
      const da = f.acroField.getDefaultAppearance() || ''; const size = Number((da.match(/([\d.]+) Tf/) || [])[1] || 9);
      if (font.widthOfTextAtSize(f.getText()!, size) > w + 0.5) row.notes.push(`OVERFLOW ${f.getName()} @${size}pt`);
      else if (size <= 5.5) row.notes.push(`tiny font ${f.getName()} @${size}pt`);
    }
    if (/^business$/i.test(String(got.occupation||'')) && /employee/i.test(String(got.employment_type||''))) row.fails.push('occupation=Business for an employee');
    // sanity: name/ic/card ticked
    const cardsTicked = Object.entries(got).filter(([k, v]) => k.startsWith('card_') && v === true).map(([k]) => k);
    if (cardsTicked.length !== 1) row.fails.push(`cards ticked: ${cardsTicked.join(',') || 'none'}`);
    row.filled = Object.values(got).filter((v) => v === true || (typeof v === 'string' && v)).length;
    row.key = { name: got.name_as_per_ic, ic: got.mykad_number, dob: got.date_of_birth, city: got.residential_city, state: got.residential_state, occ: got.occupation, pos: got.position, empStatus: got.employment_status, empType: got.employment_type, inc: got.monthly_income, race: got.race, rel: got.religion, marital: got.marital_status, nat: got.nationality_others_text, card: got.name_on_card };
  } catch (e: any) {
    row.fails.push('CRASH: ' + (e?.message || e));
  }
  summary.push(row);
  console.log(`\n[${c.id}] ${c.title}  conf=${row.conf} filled=${row.filled}  ${row.fails.length ? 'FAIL' : 'PASS'}`);
  for (const f of row.fails) console.log('   ✗ ' + f);
  for (const nn of row.notes) console.log('   · ' + nn);
  console.log('   ', JSON.stringify(row.key));
}
fs.writeFileSync(`${OUT}/hard-summary.json`, JSON.stringify(summary, null, 1));
