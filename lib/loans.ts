// 借入金の返済予定。日本政策金融公庫の「お支払額明細書」の条件をそのまま持ち、
// 毎月の返済額をその場で計算する。
//
// 元金の返済は費用ではない（負債が減るだけ）。費用になるのは利息だけ。
// なのに現金は元金＋利息の両方が出ていくので、利益とは別に見る必要がある。
//
// 利息＝前月末の残高 × 年利 × 日数 ÷ 365（公庫の明細書と同じ計算）。

export type Loan = {
  id: string;
  /** お取引番号 */
  ref: string;
  name: string;
  lender: string;
  /** 借入額 */
  principal: number;
  /** 年利（0.021 = 2.10%） */
  rate: number;
  /** 利息の起算日（明細書の初回利息から逆算した日。実行日の前日） */
  drawdown: string;
  /** 初回支払日 */
  firstPayment: string;
  /** 毎月の支払日 */
  payDay: number;
  /** 元金の返済が始まる回（それ以前は利息だけ払う据置期間） */
  principalFromRound: number;
  /** 元金返済が始まる回だけの特別な元金額。以降は monthlyPrincipal */
  firstPrincipal: number;
  /** 毎月の元金 */
  monthlyPrincipal: number;
};

export const LOANS: Loan[] = [
  {
    id: "jfc-2778",
    ref: "26-2778",
    name: "特別貸付（設備）",
    lender: "日本政策金融公庫 彦根支店",
    principal: 3_500_000,
    rate: 0.021,
    drawdown: "2026-07-26",
    firstPayment: "2026-09-25",
    payDay: 25,
    principalFromRound: 5,
    firstPrincipal: 35_000,
    monthlyPrincipal: 45_000,
  },
  {
    id: "jfc-2780",
    ref: "26-2780",
    name: "特別貸付（運転）",
    lender: "日本政策金融公庫 彦根支店",
    principal: 1_000_000,
    rate: 0.021,
    drawdown: "2026-07-26",
    firstPayment: "2026-09-25",
    payDay: 25,
    principalFromRound: 5,
    firstPrincipal: 12_000,
    monthlyPrincipal: 13_000,
  },
];

export type Installment = {
  round: number;
  /** YYYY-MM-DD */
  date: string;
  /** 前回からの日数 */
  days: number;
  principal: number;
  interest: number;
  total: number;
  /** 支払ったあとの残高 */
  balance: number;
};

const addMonths = (iso: string, n: number, day: number) => {
  const [y, m] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  // その月に指定日が無ければ月末（公庫は25日なので実質起きない）
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );

/** 完済までの返済予定をぜんぶ作る */
export function schedule(loan: Loan): Installment[] {
  const out: Installment[] = [];
  let balance = loan.principal;
  let prev = loan.drawdown;
  for (let round = 1; balance > 0 && round < 600; round++) {
    const date = round === 1 ? loan.firstPayment : addMonths(loan.firstPayment, round - 1, loan.payDay);
    const days = daysBetween(prev, date);
    const interest = Math.floor((balance * loan.rate * days) / 365);
    let principal = 0;
    if (round === loan.principalFromRound) principal = loan.firstPrincipal;
    else if (round > loan.principalFromRound) principal = loan.monthlyPrincipal;
    principal = Math.min(principal, balance);
    balance -= principal;
    out.push({ round, date, days, principal, interest, total: principal + interest, balance });
    prev = date;
  }
  return out;
}

export type MonthPayment = {
  month: string;
  loanId: string;
  ref: string;
  name: string;
  round: number;
  date: string;
  principal: number;
  interest: number;
  total: number;
  balance: number;
};

/** ある月に払うぶんを、借入ごとに返す */
export function paymentsIn(month: string): MonthPayment[] {
  const out: MonthPayment[] = [];
  for (const loan of LOANS) {
    for (const i of schedule(loan)) {
      if (i.date.slice(0, 7) === month) {
        out.push({
          month,
          loanId: loan.id,
          ref: loan.ref,
          name: loan.name,
          round: i.round,
          date: i.date,
          principal: i.principal,
          interest: i.interest,
          total: i.total,
          balance: i.balance,
        });
      }
    }
  }
  return out;
}

/** 指定日の時点で残っている借入の合計 */
export function balanceAt(date: string): number {
  let total = 0;
  for (const loan of LOANS) {
    const past = schedule(loan).filter((i) => i.date <= date);
    total += past.length ? past[past.length - 1].balance : loan.principal;
  }
  return total;
}
