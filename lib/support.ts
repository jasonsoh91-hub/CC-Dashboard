// Single place for the admin's support contact, shown on the credits page,
// in the welcome dialog and in the out-of-credit prompt.
export const SUPPORT_WHATSAPP = '0169205137';

// wa.me needs the international form without a leading zero or symbols.
export const SUPPORT_WHATSAPP_LINK = 'https://wa.me/60169205137';

// Balance may go this far negative before generating is blocked (2 forms at RM2).
export const CREDIT_FLOOR = -4;

// Cost of one generated form.
export const FORM_COST = 2;

// Below this, the low-balance reminder pops up.
export const LOW_BALANCE_WARN = 4;

// Forms still generatable at a given balance, overdraft included.
export function formsLeft(balance: number): number {
  return Math.max(0, Math.floor((balance - CREDIT_FLOOR) / FORM_COST));
}

// Fired on the window whenever a balance changes, so the reminder can re-check.
export const BALANCE_CHANGED_EVENT = 'cc-balance-changed';
