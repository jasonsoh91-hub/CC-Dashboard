// Name printed on the card: max 19 characters, whole words only.
//
// Malaysian names carry a patronymic after BIN/BINTI (Malay) or A/L, A/P,
// S/O, D/O (Indian). The person's OWN name comes before that marker, so it is
// kept first; the father's name is added only if the whole thing still fits.
//   "Ahmad Faizal bin Abdul Rahman"     -> "AHMAD FAIZAL"
//   "Saravanan a/l Muniandy"            -> "SARAVANAN MUNIANDY"
//   "Wan Nur Syafiqah Aleeya binti ..." -> "WAN NUR SYAFIQAH"
//   "Tan Ah Huat"                       -> "TAN AH HUAT"
// (The old rule kept first + last word, giving "WAN SHAH" / "SITI YUSOF".)
export const NAME_ON_CARD_MAX = 19;

// Bare "AL" is not a marker: it is part of names like "Syed Al Idrus".
const MARKERS = new Set(['BIN', 'BINTI', 'BT', 'BTE', 'BT.', 'A/L', 'A/P', 'S/O', 'D/O']);

const fitWords = (words: string[], max: number): string => {
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out;
};

export function nameOnCard(fullName: string | null | undefined, max = NAME_ON_CARD_MAX): string {
  if (!fullName) return '';
  const words = fullName
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return '';

  const idx = words.findIndex((w, i) => i > 0 && MARKERS.has(w));
  const own = idx > 0 ? words.slice(0, idx) : words;
  const father = idx > 0 ? words.slice(idx + 1).filter((w) => !MARKERS.has(w)) : [];

  const ownName = own.join(' ');
  const full = [...own, ...father].join(' ');
  if (full.length <= max) return full;
  if (ownName.length <= max) return ownName;
  const fitted = fitWords(own, max);
  return fitted || own[0].substring(0, max);
}
