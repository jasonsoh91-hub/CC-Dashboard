import { ApplicationFormDataSchema } from '@/lib/types';
import type { SavedApplication } from '@/lib/applications';

// Every form field, in schema order. Derived from the Zod shape so a new field
// added to lib/types.ts shows up in the export automatically.
export const FORM_FIELDS = Object.keys(ApplicationFormDataSchema.shape) as string[];

// Row metadata that isn't part of the form itself.
const META_COLUMNS = [
  'created_at',
  'status',
  'agent_email',
  'agent_name',
  'agent_staff_id',
  'application_id',
  'pdf_path',
] as const;

export const EXPORT_COLUMNS = [...META_COLUMNS, ...FORM_FIELDS];

// Fields that are digit strings. Excel turns a bare 730307016344 into
// 7.30307E+11 and silently destroys the IC, so these are emitted as ="…"
// which Excel imports as literal text.
const TEXT_FIELDS = new Set([
  'mykad_number',
  'ic_number',
  'old_nric',
  'passport_number',
  'hp_number',
  'phone',
  'office_number',
  'office_phone',
  'house_tel_no',
  'postcode',
  'correspondence_postcode',
  'office_postcode',
  'supp_postcode',
  'supp_mykad_number',
  'supp_hp_number',
  'emergency_contact_number',
  'emergency_phone',
  'police_military_id',
  'bmm_staff_id',
  'agent_ic',
  'agent_staff_id',
  'branch_tel_no',
]);

export type OwnerInfo = { email: string; agent_name: string | null; agent_staff_id: string | null };

function cell(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const s = String(value);
  if (!s) return '';
  // Force-text digit strings so Excel doesn't reformat them into oblivion.
  if (TEXT_FIELDS.has(key) && /^[0-9+\-\s()]+$/.test(s)) {
    return `="${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function applicationsToCsv(
  rows: SavedApplication[],
  owners: Record<string, OwnerInfo>
): string {
  const lines: string[] = [EXPORT_COLUMNS.map(csvEscape).join(',')];

  for (const row of rows) {
    const owner = owners[row.user_id];
    const data = (row.data ?? {}) as Record<string, unknown>;
    const values = EXPORT_COLUMNS.map((col) => {
      switch (col) {
        case 'created_at':
          return new Date(row.created_at).toLocaleString('en-MY');
        case 'status':
          return row.status;
        case 'agent_email':
          return owner?.email ?? '';
        case 'agent_name':
          // Prefer the agent stamped onto the application, else their profile.
          return cell('agent_name', data.agent_name ?? owner?.agent_name);
        case 'agent_staff_id':
          return cell('agent_staff_id', data.agent_staff_id ?? owner?.agent_staff_id);
        case 'application_id':
          return row.id;
        case 'pdf_path':
          return row.pdf_path ?? '';
        default:
          return cell(col, data[col]);
      }
    });
    lines.push(values.map(csvEscape).join(','));
  }

  // CRLF + UTF-8 BOM: what Excel expects for a clean double-click open.
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
