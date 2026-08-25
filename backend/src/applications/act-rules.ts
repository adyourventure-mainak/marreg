export type ActCode = "HMA_1955" | "SMA_13" | "SMA_16" | "ICMA_1872" | "PMDA_1936";
export const ACT_RULES = {
  HMA_1955: { officer: "HINDU_REGISTRAR", solemnisation: "alreadySolemnised", objectionDays: 7, deadlineMonths: 6 },
  SMA_13: { officer: "MARRIAGE_OFFICER", solemnisation: "future", objectionDays: 30, noticeDays: 30, solemnisationMonths: 3 },
  SMA_16: { officer: "MARRIAGE_OFFICER", solemnisation: "alreadySolemnised", objectionDays: 30, deadlineMonths: 6, minimumMarriageAgeDays: 30 },
  ICMA_1872: { officer: "MARRIAGE_OFFICER", solemnisation: "future", objectionDays: 30 },
  PMDA_1936: { officer: "PARSI_REGISTRAR", solemnisation: "alreadySolemnised", objectionDays: 30 },
} as const satisfies Record<ActCode, object>;

export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date); const originalDay = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay)); return result;
}
export function addDays(date: Date, days: number): Date { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
export function sma13Window(noticeReceiptDate: Date): { earliest: Date; latest: Date } {
  const earliest = addDays(noticeReceiptDate, 30); return { earliest, latest: addCalendarMonths(earliest, 3) };
}
