// Bank and Card configuration for multi-bank support

export const BANKS = {
  bank_muamalat: {
    id: 'bank_muamalat',
    name: 'Bank Muamalat',
    template: 'muamalat application form.pdf',
    cards: [
      'Visa Platinum-i',
      'Visa Infinite-i',
    ] as const,
  },
  ocbc: {
    id: 'ocbc',
    name: 'OCBC',
    template: 'Ocbc application form.pdf',
    cards: [
      '90°N Visa Card',
      'Cashflo Mastercard',
      'Titanium Card (Blue)',
      'Titanium Card (Pink)',
      '365 Mastercard',
      'Great Eastern Platinum Mastercard',
    ] as const,
  },
} as const;

export type BankId = keyof typeof BANKS;
export type BankCard = typeof BANKS[BankId]['cards'][number];

export const bankList = Object.entries(BANKS).map(([id, bank]) => ({
  id,
  name: bank.name,
  template: bank.template,
  cards: bank.cards as readonly string[],
}));

export function getBankById(id: string) {
  return BANKS[id as BankId];
}

export function getCardsByBank(bankId: string): readonly string[] {
  const bank = getBankById(bankId);
  return bank?.cards || [];
}

export function getTemplateByBank(bankId: string): string {
  const bank = getBankById(bankId);
  return bank?.template || 'credit-card-application.pdf';
}
