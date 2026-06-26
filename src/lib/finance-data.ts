export type FinanceRow = {
  date: string;
  credit: number;
  debit: number;
  flux: number;
  budgetCredit: number;
  budgetDebit: number;
  soldeBudget: number;
  budget: number;
  region?: string;
};

type YearPlan = {
  year: number;
  totalCredit: number;
  totalDebit: number;
  totalBudgetCredit: number;
  totalBudgetDebit: number;
};

const YEAR_PLANS: YearPlan[] = [
  {
    year: 2021,
    totalCredit: 102_260_000,
    totalDebit: 80_890_000,
    totalBudgetCredit: 70_594_000,
    totalBudgetDebit: 47_374_000,
  },
  {
    year: 2022,
    totalCredit: 169_234_999,
    totalDebit: 149_310_000,
    totalBudgetCredit: 90_414_000,
    totalBudgetDebit: 81_244_000,
  },
  {
    year: 2023,
    totalCredit: 205_959_999,
    totalDebit: 185_205_000,
    totalBudgetCredit: 99_504_000,
    totalBudgetDebit: 87_054_000,
  },
];

const MONTH_WEIGHTS = [0.08, 0.07, 0.07, 0.07, 0.08, 0.08, 0.08, 0.08, 0.09, 0.1, 0.1, 0.1];

const REGIONS = ["Rabat", "Casablanca", "Tanger", "Marrakech"];

function allocate(total: number, weights: number[]): number[] {
  const normalized = (() => {
    const sum = weights.reduce((s, w) => s + w, 0);
    return weights.map((w) => w / (sum || 1));
  })();

  const raw = normalized.map((w) => total * w);
  const base = raw.map((v) => Math.floor(v));
  let remainder = total - base.reduce((s, v) => s + v, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .map((x) => x.i);

  let cursor = 0;
  while (remainder > 0) {
    base[order[cursor % order.length]] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return base;
}

function generateDataset(): FinanceRow[] {
  const dataset: FinanceRow[] = [];

  for (const plan of YEAR_PLANS) {
    const credits = allocate(plan.totalCredit, MONTH_WEIGHTS);
    const debits = allocate(plan.totalDebit, MONTH_WEIGHTS);
    const budgetCredits = allocate(plan.totalBudgetCredit, MONTH_WEIGHTS);
    const budgetDebits = allocate(plan.totalBudgetDebit, MONTH_WEIGHTS);

    for (let month = 1; month <= 12; month++) {
      const idx = month - 1;
      const credit = credits[idx];
      const debit = debits[idx];
      const budgetCredit = budgetCredits[idx];
      const budgetDebit = budgetDebits[idx];
      const dateStr = `${plan.year}-${String(month).padStart(2, "0")}`;

      dataset.push({
        date: dateStr,
        credit,
        debit,
        flux: credit - debit,
        budgetCredit,
        budgetDebit,
        soldeBudget: budgetCredit - budgetDebit,
        budget: budgetCredit,
        region: REGIONS[(plan.year + month) % REGIONS.length],
      });
    }
  }

  return dataset;
}

export const FINANCE_DATA: FinanceRow[] = generateDataset();
