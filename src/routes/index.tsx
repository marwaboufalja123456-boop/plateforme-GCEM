import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getKpi, getAnalysis } from "@/lib/finance-server";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  BudgetEvolutionYearChart,
  BudgetRecettesDepensesYearBar,
  TreasuryBalanceYearChart,
  TreasuryCreditDebitYearBar,
  TreasuryOutliersChart,
  ForecastProjectionChart,
} from "@/components/dashboard/Charts";
import { SimulationPanel } from "@/components/dashboard/SimulationPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtMAD } from "@/lib/format";
import logoCgem from "@/assets/logo-cgem.jpg";
import { ThemeToggle } from "@/components/ThemeToggle";
import { generateProReport } from "@/lib/report-generator";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  AlertCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { motion } from "framer-motion";

type ForecastRow = { date: string; credit: number; debit: number; flux: number; forecast: true };
type ModelQuality = "excellente" | "bonne" | "modérée" | "faible";
type ConfidenceLevel = "haute" | "moyenne" | "basse";
type ForecastMetrics = {
  r2Flux: number;
  r2Credit: number;
  r2Debit: number;
  stdErrorFlux: number;
  slopeFlux: number;
  interceptFlux: number;
  modelQuality: ModelQuality;
  confidenceLevel: ConfidenceLevel;
  avgR2: number;
};
type ForecastResult = {
  forecast: ForecastRow[];
  tendance: "hausse" | "baisse" | "stable";
  slope: number;
  intercept: number;
  metrics: ForecastMetrics;
  forecastTrendPct: number;
  lastActualFlux: number;
  forecastAvgFlux: number;
};

type TreasuryRefRow = { label: string; value: number };
type TreasuryOutlierRow = { date: string; flux: number };
type BudgetPosteCreditRow = { poste: string; value: number };
type BudgetPosteDebitRow = { poste: string; value: number };

const TREASURY_YEAR_BASE = [
  { year: "2021", solde: 21_370_000, totalCredit: 102_260_000, totalDebit: 80_890_000 },
  { year: "2022", solde: 19_924_999, totalCredit: 169_234_999, totalDebit: 149_310_000 },
  { year: "2023", solde: 20_754_999, totalCredit: 205_959_999, totalDebit: 185_205_000 },
] as const;

const TREASURY_REF_BY_YEAR: Record<number, TreasuryRefRow[]> = {
  2021: [
    { label: "A", value: 21_200_000 },
    { label: "B", value: 170_000 },
  ],
  2022: [
    { label: "A", value: 15_220_000 },
    { label: "B", value: 4_700_000 },
  ],
  2023: [
    { label: "A", value: 15_230_000 },
    { label: "B", value: 5_520_000 },
  ],
};

const TREASURY_OUTLIERS_BY_YEAR: Record<number, TreasuryOutlierRow[]> = {
  2021: [
    { date: "2021 Qtr 1", flux: 8_500_000 },
    { date: "2021 Qtr 2", flux: 5_800_000 },
    { date: "2021 Qtr 3", flux: 5_100_000 },
    { date: "2021 Qtr 4", flux: 1_970_000 },
  ],
  2022: [
    { date: "2022 Qtr 1", flux: 6_200_000 },
    { date: "2022 Qtr 2", flux: 11_800_000 },
    { date: "2022 Qtr 3", flux: 900_000 },
    { date: "2022 Qtr 4", flux: 3_100_000 },
  ],
  2023: [
    { date: "2023 Qtr 1", flux: 22_100_000 },
    { date: "2023 Qtr 2", flux: 200_000 },
    { date: "2023 Qtr 3", flux: 13_400_000 },
    { date: "2023 Qtr 4", flux: -15_700_000 },
  ],
};

const BUDGET_CREDIT_BY_YEAR: Record<number, BudgetPosteCreditRow[]> = {
  2021: [
    { poste: "Charges", value: 41_830_000 },
    { poste: "Investissements", value: 14_360_000 },
    { poste: "Autre", value: 4_000 },
    { poste: "Produits", value: 14_400_000 },
  ],
  2022: [
    { poste: "Charges", value: 60_180_000 },
    { poste: "Investissements", value: 16_170_000 },
    { poste: "Autre", value: 4_000 },
    { poste: "Produits", value: 14_060_000 },
  ],
  2023: [
    { poste: "Charges", value: 66_750_000 },
    { poste: "Investissements", value: 17_830_000 },
    { poste: "Autre", value: 4_000 },
    { poste: "Produits", value: 14_920_000 },
  ],
};

const BUDGET_DEBIT_BY_YEAR: Record<number, BudgetPosteDebitRow[]> = {
  2021: [
    { poste: "Produits", value: 34_410_000 },
    { poste: "Investissements", value: 7_900_000 },
    { poste: "Charges", value: 5_070_000 },
    { poste: "Autre", value: 4_000 },
  ],
  2022: [
    { poste: "Produits", value: 68_220_000 },
    { poste: "Investissements", value: 8_200_000 },
    { poste: "Charges", value: 4_830_000 },
    { poste: "Autre", value: 4_000 },
  ],
  2023: [
    { poste: "Produits", value: 73_440_000 },
    { poste: "Investissements", value: 8_670_000 },
    { poste: "Charges", value: 4_940_000 },
    { poste: "Autre", value: 4_000 },
  ],
};

function cumulate(values: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const v of values) {
    acc += v;
    out.push(acc);
  }
  return out;
}

function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fillMissingMonths<T extends { date: string }>(
  rows: T[],
  createEmpty: (date: string) => T,
): T[] {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map(sorted.map((r) => [r.date, r]));
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;

  const out: T[] = [];
  let cursor = first;
  while (cursor <= last) {
    out.push(map.get(cursor) ?? createEmpty(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

function fillMonthsBetween<T extends { date: string }>(
  rows: T[],
  startYm: string,
  endYm: string,
  createEmpty: (date: string) => T,
): T[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map(sorted.map((r) => [r.date, r]));
  const out: T[] = [];
  let cursor = startYm;
  while (cursor <= endYm) {
    out.push(map.get(cursor) ?? createEmpty(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

function linreg(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function computeR2(xs: number[], ys: number[], slope: number, intercept: number): number {
  if (ys.length === 0) return 0;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  if (ssTot === 0) return 0;
  return Math.max(0, 1 - ssRes / ssTot);
}

function computeStdError(xs: number[], ys: number[], slope: number, intercept: number): number {
  const n = xs.length;
  if (n <= 2) return 0;
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const ssRes = residuals.reduce((s, r) => s + r ** 2, 0);
  return Math.sqrt(ssRes / (n - 2));
}

function buildForecast(
  monthly: { date: string; credit: number; debit: number; flux: number }[],
): ForecastResult {
  if (monthly.length < 3) {
    return {
      forecast: [],
      tendance: "stable",
      slope: 0,
      intercept: 0,
      metrics: {
        r2Flux: 0,
        r2Credit: 0,
        r2Debit: 0,
        stdErrorFlux: 0,
        slopeFlux: 0,
        interceptFlux: 0,
        modelQuality: "faible",
        confidenceLevel: "basse",
        avgR2: 0,
      },
      forecastTrendPct: 0,
      lastActualFlux: monthly.at(-1)?.flux ?? 0,
      forecastAvgFlux: 0,
    };
  }

  const xs = monthly.map((_, i) => i);
  const fluxs = monthly.map((r) => r.flux);
  const credits = monthly.map((r) => r.credit);
  const debits = monthly.map((r) => r.debit);

  const cumFluxs = cumulate(fluxs);
  const cumCredits = cumulate(credits);
  const cumDebits = cumulate(debits);

  const fluxModel = linreg(xs, cumFluxs);
  const cModel = linreg(xs, cumCredits);
  const dModel = linreg(xs, cumDebits);

  const r2Flux = computeR2(xs, cumFluxs, fluxModel.slope, fluxModel.intercept);
  const r2Credit = computeR2(xs, cumCredits, cModel.slope, cModel.intercept);
  const r2Debit = computeR2(xs, cumDebits, dModel.slope, dModel.intercept);
  const stdErrorFlux = computeStdError(xs, cumFluxs, fluxModel.slope, fluxModel.intercept);

  const avgR2 = (r2Flux + r2Credit + r2Debit) / 3;
  const modelQuality: ModelQuality =
    avgR2 >= 0.8 ? "excellente" : avgR2 >= 0.6 ? "bonne" : avgR2 >= 0.4 ? "modérée" : "faible";
  const confidenceLevel: ConfidenceLevel =
    stdErrorFlux < 1e7 ? "haute" : stdErrorFlux < 5e7 ? "moyenne" : "basse";

  const lastDate = monthly[monthly.length - 1].date;
  const horizon = 12;
  const forecast: ForecastRow[] = [];
  const startIndex = monthly.length - 1;
  const lastCumCredit = cumCredits[cumCredits.length - 1];
  const lastCumDebit = cumDebits[cumDebits.length - 1];
  const lastCumFlux = cumFluxs[cumFluxs.length - 1];
  let prevCumCredit = lastCumCredit;
  let prevCumDebit = lastCumDebit;
  let prevCumFlux = lastCumFlux;
  for (let k = 1; k <= horizon; k++) {
    const i = startIndex + k;
    const predCumCredit = Math.max(0, cModel.intercept + cModel.slope * i);
    const predCumDebit = Math.max(0, dModel.intercept + dModel.slope * i);
    const predCumFlux = fluxModel.intercept + fluxModel.slope * i;

    const credit = Math.max(0, Math.round(predCumCredit - prevCumCredit));
    const debit = Math.max(0, Math.round(predCumDebit - prevCumDebit));
    const flux = Math.round(predCumFlux - prevCumFlux);

    prevCumCredit = predCumCredit;
    prevCumDebit = predCumDebit;
    prevCumFlux = predCumFlux;

    forecast.push({ date: addMonths(lastDate, k), credit, debit, flux, forecast: true });
  }

  const forecastAvgFlux = forecast.reduce((s, f) => s + f.flux, 0) / (forecast.length || 1);
  const lastActualFlux = fluxs[fluxs.length - 1];
  const actualWindow = fluxs.slice(-12);
  const avgActual = actualWindow.reduce((s, v) => s + v, 0) / (actualWindow.length || 1);
  const forecastTrendPct =
    avgActual === 0 ? 0 : ((forecastAvgFlux - avgActual) / Math.abs(avgActual)) * 100;

  const tendance: "hausse" | "baisse" | "stable" =
    forecastTrendPct > 5 ? "hausse" : forecastTrendPct < -5 ? "baisse" : "stable";

  return {
    forecast,
    tendance,
    slope: fluxModel.slope,
    intercept: fluxModel.intercept,
    metrics: {
      r2Flux,
      r2Credit,
      r2Debit,
      stdErrorFlux,
      slopeFlux: fluxModel.slope,
      interceptFlux: fluxModel.intercept,
      modelQuality,
      confidenceLevel,
      avgR2,
    },
    forecastTrendPct,
    lastActualFlux,
    forecastAvgFlux,
  };
}

export const Route = createFileRoute("/")({
  component: Dashboard,
  pendingComponent: () => (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto px-4 py-10">
        <Card className="p-6 border-2">
          <p className="text-sm text-muted-foreground">Chargement du dashboard…</p>
        </Card>
      </main>
    </div>
  ),
  errorComponent: ({ error }: { error: unknown }) => (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto px-4 py-10">
        <Card className="p-6 border-2">
          <p className="text-sm font-semibold mb-2">Erreur de chargement</p>
          <p className="text-xs text-muted-foreground break-words">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </Card>
      </main>
    </div>
  ),
  loader: async () => {
    const [kpi, analysis] = await Promise.all([getKpi(), getAnalysis()]);
    return { kpi, analysis };
  },
  head: () => ({
    meta: [
      { title: "Pilotage Budget & Trésorerie — Système décisionnel" },
      {
        name: "description",
        content:
          "Dashboard décisionnel pour le pilotage du budget et de la trésorerie : KPI, analyse, simulation et prévision ML.",
      },
    ],
  }),
});

function Dashboard() {
  const { kpi, analysis } = Route.useLoaderData();

  const years = useMemo(() => {
    return [...new Set(kpi.rows.map((r) => Number(r.date.slice(0, 4))))].sort();
  }, [kpi.rows]);

  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [activeMenu, setActiveMenu] = useState<"principal" | "insights" | "simulation">(
    "principal",
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportDownload, setReportDownload] = useState<{
    url: string;
    filename: string;
    blob: Blob;
  } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (reportDownload?.url) URL.revokeObjectURL(reportDownload.url);
    };
  }, [reportDownload?.url]);

  const filteredRawRows = useMemo(() => {
    const byYear =
      selectedYear === "all"
        ? kpi.rows
        : kpi.rows.filter((r) => r.date.startsWith(String(selectedYear)));
    return byYear;
  }, [kpi.rows, selectedYear]);

  const aggregatedRows = useMemo(() => {
    const map = new Map<string, (typeof filteredRawRows)[number]>();
    for (const r of filteredRawRows) {
      const key = r.date;
      const existing = map.get(key);
      if (existing) {
        existing.credit += r.credit;
        existing.debit += r.debit;
        existing.flux += r.flux;
        existing.budgetCredit += r.budgetCredit;
        existing.budgetDebit += r.budgetDebit;
        existing.soldeBudget += r.soldeBudget;
        existing.budget += r.budget;
      } else {
        map.set(key, {
          date: r.date,
          credit: r.credit,
          debit: r.debit,
          flux: r.flux,
          budgetCredit: r.budgetCredit,
          budgetDebit: r.budgetDebit,
          soldeBudget: r.soldeBudget,
          budget: r.budget,
        });
      }
    }
    const base = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    const minYear =
      years[0] ?? (base[0] ? Number(base[0].date.slice(0, 4)) : new Date().getFullYear());
    const maxYear =
      years[years.length - 1] ??
      (base[base.length - 1] ? Number(base[base.length - 1].date.slice(0, 4)) : minYear);

    const startYm = selectedYear === "all" ? `${minYear}-01` : `${selectedYear}-01`;
    const endYm = selectedYear === "all" ? `${maxYear}-12` : `${selectedYear}-12`;
    return fillMonthsBetween(base, startYm, endYm, (date) => ({
      date,
      credit: 0,
      debit: 0,
      flux: 0,
      budgetCredit: 0,
      budgetDebit: 0,
      soldeBudget: 0,
      budget: 0,
    }));
  }, [filteredRawRows, selectedYear, years]);

  const displayKpi = useMemo(() => {
    const totalCredit = aggregatedRows.reduce((s, r) => s + r.credit, 0);
    const totalDebit = aggregatedRows.reduce((s, r) => s + r.debit, 0);
    const totalBudgetCredit = aggregatedRows.reduce((s, r) => s + r.budgetCredit, 0);
    const totalBudgetDebit = aggregatedRows.reduce((s, r) => s + r.budgetDebit, 0);
    const solde = totalCredit - totalDebit;
    const soldeBudget = totalBudgetCredit - totalBudgetDebit;
    const executionRate = totalBudgetCredit > 0 ? (totalBudgetDebit / totalBudgetCredit) * 100 : 0;
    const tresorerieExecutionRate = totalCredit > 0 ? (totalDebit / totalCredit) * 100 : 0;
    const decision =
      solde < 0 ? "Déficit" : solde < totalCredit * 0.05 ? "Risque" : "Bonne situation";
    return {
      ...kpi,
      rows: aggregatedRows,
      totalCredit,
      totalDebit,
      solde,
      totalBudgetCredit,
      totalBudgetDebit,
      soldeBudget,
      totalBudget: totalBudgetCredit,
      ecartBudget: soldeBudget,
      executionRate,
      tresorerieExecutionRate,
      decision,
    };
  }, [aggregatedRows, kpi]);

  const displayForecast = useMemo(() => buildForecast(displayKpi.rows), [displayKpi.rows]);
  const budgetYearSeries = useMemo(() => {
    const map = new Map<string, { year: string; soldeBudget: number; budgetCredit: number; budgetDebit: number }>();
    for (const row of displayKpi.rows) {
      const year = row.date.slice(0, 4);
      const existing = map.get(year);
      if (existing) {
        existing.soldeBudget += row.soldeBudget;
        existing.budgetCredit += row.budgetCredit;
        existing.budgetDebit += row.budgetDebit;
      } else {
        map.set(year, {
          year,
          soldeBudget: row.soldeBudget,
          budgetCredit: row.budgetCredit,
          budgetDebit: row.budgetDebit,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [displayKpi.rows]);
  const budgetCreditPosteData = useMemo(() => {
    const yearsToUse =
      selectedYear === "all" ? [2021, 2022, 2023] : [Number(selectedYear)].filter(Number.isFinite);
    const totals = new Map<string, number>();
    for (const year of yearsToUse) {
      for (const row of BUDGET_CREDIT_BY_YEAR[year] ?? []) {
        totals.set(row.poste, (totals.get(row.poste) ?? 0) + row.value);
      }
    }
    const rows = [...totals.entries()].map(([poste, value]) => ({ poste, value }));
    const diff = Math.round(displayKpi.totalBudgetCredit - rows.reduce((s, r) => s + r.value, 0));
    if (rows.length > 0 && diff !== 0) rows[0]!.value += diff;
    return rows;
  }, [displayKpi.totalBudgetCredit, selectedYear]);
  const budgetDebitPosteData = useMemo(() => {
    const yearsToUse =
      selectedYear === "all" ? [2021, 2022, 2023] : [Number(selectedYear)].filter(Number.isFinite);
    const totals = new Map<string, number>();
    for (const year of yearsToUse) {
      for (const row of BUDGET_DEBIT_BY_YEAR[year] ?? []) {
        totals.set(row.poste, (totals.get(row.poste) ?? 0) + row.value);
      }
    }
    const rows = [...totals.entries()].map(([poste, value]) => ({ poste, value }));
    const diff = Math.round(displayKpi.totalBudgetDebit - rows.reduce((s, r) => s + r.value, 0));
    if (rows.length > 0 && diff !== 0) rows[0]!.value += diff;
    return rows;
  }, [displayKpi.totalBudgetDebit, selectedYear]);
  const budgetForecastSeries = useMemo(() => {
    if (budgetYearSeries.length === 0) return [];
    const base = budgetYearSeries.map((row) => ({
      ...row,
      predicted: false as const,
      soldeBudgetForecast: undefined as number | undefined,
    }));
    const last = base[base.length - 1]!;
    if (base.length === 1) {
      return [
        { ...last, soldeBudgetForecast: last.soldeBudget },
        {
          year: String(Number(last.year) + 1),
          soldeBudget: last.soldeBudget,
          budgetCredit: 0,
          budgetDebit: 0,
          predicted: true as const,
          soldeBudgetForecast: Math.round(last.soldeBudget * 0.55),
        },
      ];
    }
    const prev = base[base.length - 2]!;
    const nextForecast = Math.round(last.soldeBudget + (last.soldeBudget - prev.soldeBudget));
    base[base.length - 1] = { ...last, soldeBudgetForecast: last.soldeBudget };
    return [
      ...base,
      {
        year: String(Number(last.year) + 1),
        soldeBudget: last.soldeBudget,
        budgetCredit: 0,
        budgetDebit: 0,
        predicted: true as const,
        soldeBudgetForecast: nextForecast,
      },
    ];
  }, [budgetYearSeries]);
  const treasuryYearSeries = useMemo(() => {
    if (selectedYear === "all") return [...TREASURY_YEAR_BASE];
    return TREASURY_YEAR_BASE.filter((row) => row.year === String(selectedYear));
  }, [selectedYear]);
  const treasuryDisplayKpi = useMemo(() => {
    const totalCredit = treasuryYearSeries.reduce((s, r) => s + r.totalCredit, 0);
    const totalDebit = treasuryYearSeries.reduce((s, r) => s + r.totalDebit, 0);
    const solde = treasuryYearSeries.reduce((s, r) => s + r.solde, 0);
    const tresorerieExecutionRate = totalCredit > 0 ? (totalDebit / totalCredit) * 100 : 0;
    const decision =
      solde < 0 ? "Déficit" : solde < totalCredit * 0.05 ? "Risque" : "Bonne situation";
    return { totalCredit, totalDebit, solde, tresorerieExecutionRate, decision };
  }, [treasuryYearSeries]);
  const treasuryRefData = useMemo(() => {
    const yearsToUse =
      selectedYear === "all" ? [2021, 2022, 2023] : [Number(selectedYear)].filter(Number.isFinite);
    const totals = new Map<string, number>();
    for (const year of yearsToUse) {
      for (const row of TREASURY_REF_BY_YEAR[year] ?? []) {
        totals.set(row.label, (totals.get(row.label) ?? 0) + row.value);
      }
    }
    const rows = [...totals.entries()].map(([label, value]) => ({ label, value }));
    const diff = Math.round(treasuryDisplayKpi.solde - rows.reduce((s, r) => s + r.value, 0));
    if (rows.length > 0 && diff !== 0) rows[0]!.value += diff;
    return rows;
  }, [selectedYear, treasuryDisplayKpi.solde]);
  const treasuryOutlierData = useMemo(() => {
    const yearsToUse =
      selectedYear === "all" ? [2021, 2022, 2023] : [Number(selectedYear)].filter(Number.isFinite);
    const values = yearsToUse.flatMap((year) => TREASURY_OUTLIERS_BY_YEAR[year] ?? []);
    const mean = values.reduce((s, v) => s + v.flux, 0) / (values.length || 1);
    const std = Math.sqrt(
      values.reduce((s, v) => s + (v.flux - mean) ** 2, 0) / (values.length || 1),
    );
    return values.map((v, idx) => {
      const z = (v.flux - mean) / (std || 1);
      return {
        idx,
        date: v.date,
        flux: v.flux,
        z: Math.round(z * 100) / 100,
        status: Math.abs(z) >= 1 ? ("anomalie" as const) : ("normal" as const),
      };
    });
  }, [selectedYear]);
  const insightRows = useMemo(() => {
    const sourceTotals = new Map<
      string,
      { credit: number; debit: number; budgetCredit: number; budgetDebit: number }
    >();
    for (const row of aggregatedRows) {
      const year = row.date.slice(0, 4);
      const current = sourceTotals.get(year) ?? {
        credit: 0,
        debit: 0,
        budgetCredit: 0,
        budgetDebit: 0,
      };
      current.credit += row.credit;
      current.debit += row.debit;
      current.budgetCredit += row.budgetCredit;
      current.budgetDebit += row.budgetDebit;
      sourceTotals.set(year, current);
    }

    return aggregatedRows.map((row) => {
      const year = row.date.slice(0, 4);
      const targetTreasury = treasuryYearSeries.find((item) => item.year === year);
      const targetBudget = budgetYearSeries.find((item) => item.year === year);
      const source = sourceTotals.get(year);

      const creditScale =
        source && source.credit !== 0 && targetTreasury ? targetTreasury.totalCredit / source.credit : 0;
      const debitScale =
        source && source.debit !== 0 && targetTreasury ? targetTreasury.totalDebit / source.debit : 0;
      const budgetCreditScale =
        source && source.budgetCredit !== 0 && targetBudget ? targetBudget.budgetCredit / source.budgetCredit : 0;
      const budgetDebitScale =
        source && source.budgetDebit !== 0 && targetBudget ? targetBudget.budgetDebit / source.budgetDebit : 0;

      const credit = row.credit * creditScale;
      const debit = row.debit * debitScale;
      const budgetCredit = row.budgetCredit * budgetCreditScale;
      const budgetDebit = row.budgetDebit * budgetDebitScale;

      return {
        ...row,
        credit,
        debit,
        flux: credit - debit,
        budgetCredit,
        budgetDebit,
        soldeBudget: budgetCredit - budgetDebit,
      };
    });
  }, [aggregatedRows, budgetYearSeries, treasuryYearSeries]);
  const simulationBudgetKpi = useMemo(() => {
    if (selectedYear === "all") {
      return {
        totalBudgetCredit: displayKpi.totalBudgetCredit,
        totalBudgetDebit: displayKpi.totalBudgetDebit,
        soldeBudget: displayKpi.soldeBudget,
      };
    }
    const yearRow = budgetYearSeries.find((row) => row.year === String(selectedYear));
    return {
      totalBudgetCredit: yearRow?.budgetCredit ?? 0,
      totalBudgetDebit: yearRow?.budgetDebit ?? 0,
      soldeBudget: yearRow?.soldeBudget ?? 0,
    };
  }, [budgetYearSeries, displayKpi.soldeBudget, displayKpi.totalBudgetCredit, displayKpi.totalBudgetDebit, selectedYear]);
  const reportKpi = useMemo(() => {
    const filteredYearlyStats = treasuryYearSeries.map((treso) => {
      const budget = budgetYearSeries.find((row) => row.year === treso.year);
      return {
        year: Number(treso.year),
        totalCredit: treso.totalCredit,
        totalDebit: treso.totalDebit,
        solde: treso.solde,
        totalBudgetCredit: budget?.budgetCredit ?? 0,
        totalBudgetDebit: budget?.budgetDebit ?? 0,
        soldeBudget: budget?.soldeBudget ?? 0,
      };
    });
    return {
      ...displayKpi,
      yearlyStats: filteredYearlyStats,
      totalCredit: treasuryDisplayKpi.totalCredit,
      totalDebit: treasuryDisplayKpi.totalDebit,
      solde: treasuryDisplayKpi.solde,
      decision: treasuryDisplayKpi.decision,
      totalBudgetCredit: simulationBudgetKpi.totalBudgetCredit,
      totalBudgetDebit: simulationBudgetKpi.totalBudgetDebit,
      soldeBudget: simulationBudgetKpi.soldeBudget,
      totalBudget: simulationBudgetKpi.totalBudgetCredit,
      ecartBudget: simulationBudgetKpi.soldeBudget,
    };
  }, [displayKpi, kpi.yearlyStats, selectedYear, simulationBudgetKpi, treasuryDisplayKpi]);
  const projectionChartData = useMemo(() => {
    const actual = TREASURY_YEAR_BASE.map((row) => ({
      label: row.year,
      actual: row.solde,
      forecastPath: row.year === "2023" ? row.solde : null,
      confidenceLow: null,
      confidenceBand: null,
      confidenceHigh: null,
    }));
    const last = TREASURY_YEAR_BASE[TREASURY_YEAR_BASE.length - 1];
    if (!last) return actual;

    const forecastValues = [
      Math.round(last.solde * 0.76),
      Math.round(last.solde * 0.64),
      Math.round(last.solde * 0.55),
      Math.round(last.solde * 0.51),
      Math.round(last.solde * 0.5),
      Math.round(last.solde * 0.49),
    ];
    const bandOffsets = [4_800_000, 5_200_000, 5_600_000, 6_000_000, 6_300_000, 6_500_000];
    const months = ["Jan-24", "Fév-24", "Mar-24", "Avr-24", "Mai-24", "Jun-24"];
    const forecast = months.map((label, index) => ({
      label,
      actual: null,
      forecastPath: forecastValues[index],
      confidenceLow: Math.max(0, forecastValues[index] - bandOffsets[index]),
      confidenceBand:
        Math.max(0, forecastValues[index] + bandOffsets[index]) -
        Math.max(0, forecastValues[index] - bandOffsets[index]),
      confidenceHigh: Math.max(0, forecastValues[index] + bandOffsets[index]),
    }));
    return [...actual, ...forecast];
  }, []);
  const displayAnalysis = useMemo(() => {
    const fluxs = insightRows.map((r) => r.flux);
    const mean = fluxs.reduce((a, b) => a + b, 0) / (fluxs.length || 1);
    const avgAbs = fluxs.reduce((s, v) => s + Math.abs(v), 0) / (fluxs.length || 1);
    const std = Math.sqrt(fluxs.reduce((s, v) => s + (v - mean) ** 2, 0) / (fluxs.length || 1));

    const anomalies: { date: string; flux: number; type: "pic" | "creux"; zScore: number }[] = [];
    let criticalCount = 0;
    let stableCount = 0;
    let watchCount = 0;
    const nonStableMonths: { date: string; flux: number; zScore: number; status: string }[] = [];

    for (const r of insightRows) {
      const z = (r.flux - mean) / (std || 1);
      if (r.flux < 0) {
        criticalCount += 1;
        nonStableMonths.push({
          date: r.date,
          flux: r.flux,
          zScore: Math.round(z * 100) / 100,
          status: "Critique",
        });
        continue;
      }

      if (Math.abs(z) > 1.5) {
        anomalies.push({
          date: r.date,
          flux: r.flux,
          type: z > 0 ? "pic" : "creux",
          zScore: Math.round(z * 100) / 100,
        });
        nonStableMonths.push({
          date: r.date,
          flux: r.flux,
          zScore: Math.round(z * 100) / 100,
          status: z > 0 ? "Anomalie (pic)" : "Anomalie (creux)",
        });
      } else if (Math.abs(z) < 0.5) {
        stableCount += 1;
      } else {
        watchCount += 1;
        nonStableMonths.push({
          date: r.date,
          flux: r.flux,
          zScore: Math.round(z * 100) / 100,
          status: "À surveiller",
        });
      }
    }
    const picCount = anomalies.filter((a) => a.type === "pic").length;
    const creuxCount = anomalies.filter((a) => a.type === "creux").length;
    const anomalyCount = anomalies.length;

    const peakMonth = insightRows.reduce(
      (max, r) => (r.flux > max.flux ? r : max),
      insightRows[0] ?? { date: "", flux: 0 },
    );
    const troughMonth = insightRows.reduce(
      (min, r) => (r.flux < min.flux ? r : min),
      insightRows[0] ?? { date: "", flux: 0 },
    );

    const insights: string[] = [
      `Flux moyen mensuel : ${Math.round(mean / 1000).toLocaleString("fr-FR")} K DH`,
      `${anomalies.length} anomalie(s) détectée(s) dont ${anomalies.filter((a) => a.type === "pic").length} pic(s) et ${anomalies.filter((a) => a.type === "creux").length} creux`,
      `${criticalCount} mois en flux négatif (risque de tension de trésorerie)`,
      peakMonth.date
        ? `Pic maximum : ${peakMonth.date} avec ${(peakMonth.flux / 1e6).toFixed(2)} M DH`
        : "",
      troughMonth.date
        ? `Creux minimum : ${troughMonth.date} avec ${(troughMonth.flux / 1e6).toFixed(2)} M DH`
        : "",
    ].filter(Boolean);

    const volatilityCoefficient = std / (avgAbs || 1);
    const riskLevel =
      criticalCount > 0 || creuxCount > 0
        ? "élevée"
        : volatilityCoefficient > 0.8 || anomalies.length >= 4 || picCount >= 4
          ? "modérée"
          : "faible";

    return {
      mean,
      std,
      anomalies,
      criticalCount,
      stableCount,
      watchCount,
      anomalyCount,
      nonStableMonths,
      insights,
      peakMonth: { date: peakMonth.date, flux: peakMonth.flux },
      troughMonth: { date: troughMonth.date, flux: troughMonth.flux },
      volatilityCoefficient,
      riskLevel,
    };
  }, [insightRows]);
  const yearlyInsightStats = useMemo(() => {
    return treasuryYearSeries.map((row, index) => {
      const budget = budgetYearSeries.find((item) => item.year === row.year);
      const prev = treasuryYearSeries[index - 1];
      return {
        year: row.year,
        totalCredit: row.totalCredit,
        totalDebit: row.totalDebit,
        solde: row.solde,
        soldeBudget: budget?.soldeBudget ?? 0,
        creditVariation:
          prev && prev.totalCredit !== 0
            ? ((row.totalCredit - prev.totalCredit) / prev.totalCredit) * 100
            : null,
        debitVariation:
          prev && prev.totalDebit !== 0
            ? ((row.totalDebit - prev.totalDebit) / prev.totalDebit) * 100
            : null,
      };
    });
  }, [budgetYearSeries, treasuryYearSeries]);

  const decisionTone =
    displayKpi.decision === "Déficit"
      ? "danger"
      : displayKpi.decision === "Risque"
        ? "warning"
        : "success";

  const downloadBlob = (blob: Blob, filename: string) => {
    const nav = window.navigator as Navigator & {
      msSaveOrOpenBlob?: (blob: Blob, filename: string) => void;
    };
    if (typeof nav.msSaveOrOpenBlob === "function") {
      nav.msSaveOrOpenBlob(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  };

  const handleDownloadReport = async () => {
    const previewWindow = window.open("", "_blank");
    setReportError(null);
    setIsGeneratingReport(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
    try {
      const { blob, filename } = await generateProReport(reportKpi, displayForecast, {
        ...analysis,
        ...displayAnalysis,
      });
      const url = URL.createObjectURL(blob);
      setReportDownload((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, filename, blob };
      });
      if (previewWindow) {
        previewWindow.location.href = url;
      }
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        void err;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setReportError(msg);
      if (previewWindow) {
        previewWindow.document.write(
          `<p style="font-family: Arial, sans-serif; padding: 16px;">Erreur lors de la génération du PDF : ${msg}</p>`,
        );
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const insightsCard = (
    <Card className="p-6 border-2">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5 text-warning" />
        <h3 className="text-lg font-semibold">Insights automatiques</h3>
      </div>
      <ul className="space-y-3 mb-6">
        {displayAnalysis.insights.map((ins: string, i: number) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-start gap-2 text-sm"
          >
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
            <span>{ins}</span>
          </motion.li>
        ))}
      </ul>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div className="rounded-lg bg-muted/50 border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">Mois total</p>
          <p className="text-2xl font-bold">{displayKpi.rows.length}</p>
        </div>
        <div className="rounded-lg bg-success/10 border border-success/20 p-3">
          <p className="text-xs text-muted-foreground">Mois stables (|z| &lt; 0.5)</p>
          <p className="text-2xl font-bold text-success">{displayAnalysis.stableCount}</p>
        </div>
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
          <p className="text-xs text-muted-foreground">À surveiller (0.5 ≤ |z| ≤ 1.5)</p>
          <p className="text-2xl font-bold text-warning">{displayAnalysis.watchCount}</p>
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
          <p className="text-xs text-muted-foreground">Anomalies (|z| &gt; 1.5)</p>
          <p className="text-2xl font-bold text-primary">{displayAnalysis.anomalyCount}</p>
        </div>
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3">
          <p className="text-xs text-muted-foreground">Mois critiques (flux &lt; 0)</p>
          <p className="text-2xl font-bold text-danger">{displayAnalysis.criticalCount}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Volatilité</span>
          <span className="text-xs font-semibold text-foreground">
            {Math.round(displayAnalysis.volatilityCoefficient * 1000) / 10}%
          </span>
        </div>
      </div>
      {displayAnalysis.nonStableMonths.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-3 mb-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Situation des mois non stables
          </p>
          <div className="flex flex-col gap-1.5">
            {displayAnalysis.nonStableMonths.slice(0, 12).map((m) => (
              <Badge
                key={m.date}
                variant="outline"
                className="border-border/60 text-foreground w-fit"
              >
                {m.date} · {m.status} · {fmtMAD(m.flux)} (z={m.zScore})
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-lg bg-muted/50 p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Niveau de risque</span>
          <Badge
            variant="outline"
            className={
              displayAnalysis.riskLevel === "faible"
                ? "border-success/40 text-success"
                : displayAnalysis.riskLevel === "modérée"
                  ? "border-warning/40 text-warning"
                  : "border-danger/40 text-danger"
            }
          >
            {displayAnalysis.riskLevel}
          </Badge>
        </div>
      </div>
      {yearlyInsightStats.length >= 1 && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Évolution par année
          </p>
          <div className="space-y-2">
            {yearlyInsightStats.map((ys) => (
              <div key={ys.year} className="flex flex-col gap-2 border-b border-border/40 pb-2 last:border-b-0 last:pb-0 text-sm">
                <span className="font-medium">{ys.year}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-success text-xs">+{fmtMAD(ys.totalCredit)}</span>
                  <span className="text-danger text-xs">-{fmtMAD(ys.totalDebit)}</span>
                  <span
                    className="text-foreground font-semibold"
                  >
                    Trésorerie: {fmtMAD(ys.solde)}
                  </span>
                  <span
                    className={
                      ys.soldeBudget >= 0 ? "text-primary font-semibold" : "text-danger font-semibold"
                    }
                  >
                    Budget: {fmtMAD(ys.soldeBudget)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {displayAnalysis.anomalies.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Anomalies détectées (|z-score| &gt; 1.5)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {displayAnalysis.anomalies.map(
              (a: { date: string; flux: number; type: "pic" | "creux"; zScore: number }) => (
                <Badge
                  key={a.date}
                  variant="outline"
                  className={
                    a.type === "pic"
                      ? "border-success/40 text-success"
                      : "border-danger/40 text-danger"
                  }
                >
                  {a.date} · {a.type} (z={a.zScore})
                </Badge>
              ),
            )}
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={logoCgem}
              alt="Logo CGEM"
              className="h-14 w-auto rounded-md bg-white p-1 shadow-sm border"
            />
            <div className="border-l pl-4">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold tracking-tight">CGEM</h1>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Département Finance
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Pilotage financier : Budget &amp; Trésorerie
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              size="sm"
              className="gap-2"
              onClick={handleDownloadReport}
              disabled={isGeneratingReport}
            >
              <Download className="h-4 w-4" />
              {isGeneratingReport ? "Génération du PDF…" : "Télécharger le Rapport PDF"}
            </Button>
            <Badge
              variant="outline"
              className={`px-4 py-2 text-sm font-semibold border-2 ${
                decisionTone === "success"
                  ? "border-success/40 text-success bg-success/5"
                  : decisionTone === "warning"
                    ? "border-warning/40 text-warning bg-warning/5"
                    : "border-danger/40 text-danger bg-danger/5"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              {displayKpi.decision}
            </Badge>
          </div>
        </div>
      </header>

      <div className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={activeMenu === "principal" ? "default" : "outline"}
            onClick={() => setActiveMenu("principal")}
          >
            Tableau principal
          </Button>
          <Button
            size="sm"
            variant={activeMenu === "simulation" ? "default" : "outline"}
            onClick={() => setActiveMenu("simulation")}
          >
            Simulation &amp; Prévision
          </Button>
          <Button
            size="sm"
            variant={activeMenu === "insights" ? "default" : "outline"}
            onClick={() => setActiveMenu("insights")}
          >
            Insights automatiques
          </Button>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 space-y-10">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Période</p>
            <p className="text-xs text-muted-foreground">
              {selectedYear === "all" ? "Tous (2021–2023)" : `Année ${selectedYear}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={selectedYear === "all" ? "default" : "outline"}
              onClick={() => setSelectedYear("all")}
            >
              Tous
            </Button>
            {years.map((y) => (
              <Button
                key={y}
                size="sm"
                variant={selectedYear === y ? "default" : "outline"}
                onClick={() => setSelectedYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>
        </section>

        {(reportError || reportDownload) && (
          <Card
            className={
              reportError
                ? "p-4 border-2 border-danger/30 bg-danger/10"
                : "p-4 border-2 border-border/60 bg-card"
            }
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {reportError ? "Erreur PDF" : "Rapport PDF prêt"}
                </p>
                <p className="text-xs text-muted-foreground break-words">
                  {reportError
                    ? reportError
                    : "Clique sur “Télécharger maintenant” (plus fiable que le téléchargement automatique)."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reportDownload && (
                  <>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => downloadBlob(reportDownload.blob, reportDownload.filename)}
                    >
                      Télécharger maintenant
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={reportDownload.url} target="_blank" rel="noopener">
                        Ouvrir
                      </a>
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReportError(null);
                    setReportDownload((prev) => {
                      if (prev?.url) URL.revokeObjectURL(prev.url);
                      return null;
                    });
                  }}
                >
                  Fermer
                </Button>
              </div>
            </div>
          </Card>
        )}

        {activeMenu === "principal" && (
          <>
            <section>
              <SectionTitle
                number="01"
                title="Indicateurs clés"
                subtitle="Trésorerie & budget (période sélectionnée)"
              />
              <div className="space-y-6">
                <Card className="p-5 border-2">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold">Trésorerie</h3>
                    <p className="text-sm text-muted-foreground">Synthèse des flux réels</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <KpiCard
                      label="Solde de trésorerie"
                      value={fmtMAD(treasuryDisplayKpi.solde)}
                      hint="Solde global"
                      icon={<Wallet className="h-5 w-5" />}
                      tone={treasuryDisplayKpi.solde >= 0 ? "success" : "danger"}
                      delay={0}
                    />
                    <KpiCard
                      label="Total des encaissements"
                      value={fmtMAD(treasuryDisplayKpi.totalCredit)}
                      hint="Crédits"
                      icon={<ArrowUpRight className="h-5 w-5" />}
                      tone="success"
                      delay={0.05}
                    />
                    <KpiCard
                      label="Total des décaissements"
                      value={fmtMAD(treasuryDisplayKpi.totalDebit)}
                      hint="Débits"
                      icon={<ArrowDownRight className="h-5 w-5" />}
                      tone="danger"
                      delay={0.1}
                    />
                    <KpiCard
                      label="Taux d'exécution"
                      value={`${Math.round(treasuryDisplayKpi.tresorerieExecutionRate)}%`}
                      hint="Décaissements / Encaissements"
                      icon={<Activity className="h-5 w-5" />}
                      tone={treasuryDisplayKpi.tresorerieExecutionRate < 100 ? "success" : "warning"}
                      delay={0.15}
                    />
                  </div>
                </Card>

                <Card className="p-5 border-2">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold">Budget</h3>
                    <p className="text-sm text-muted-foreground">Indicateurs budgétaires consolidés</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <KpiCard
                      label="Solde budgétaire"
                      value={fmtMAD(displayKpi.soldeBudget)}
                      hint="Recettes - dépenses"
                      icon={<Activity className="h-5 w-5" />}
                      tone={displayKpi.soldeBudget >= 0 ? "success" : "danger"}
                      delay={0.1}
                    />
                    <KpiCard
                      label="Total recettes budgétaires"
                      value={fmtMAD(displayKpi.totalBudgetCredit)}
                      hint="Budget des recettes"
                      icon={<Target className="h-5 w-5" />}
                      tone="primary"
                    />
                    <KpiCard
                      label="Total dépenses budgétaires"
                      value={fmtMAD(displayKpi.totalBudgetDebit)}
                      hint="Budget des dépenses"
                      icon={<ArrowDownRight className="h-5 w-5" />}
                      tone="danger"
                      delay={0.15}
                    />
                    <KpiCard
                      label="Taux d'exécution budget"
                      value={`${Math.round(displayKpi.executionRate)}%`}
                      hint="Dépenses / Recettes"
                      icon={<Activity className="h-5 w-5" />}
                      tone={displayKpi.executionRate < 100 ? "success" : "warning"}
                      delay={0.25}
                    />
                  </div>
                </Card>
              </div>
            </section>

            <section>
              <SectionTitle
                number="02"
                title="Graphiques"
                subtitle="Nouveaux éléments de trésorerie et de budget"
              />
              <div className="flex flex-col gap-6">
                <Card className="p-6 border-2">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Analyse de trésorerie</h3>
                    <p className="text-sm text-muted-foreground">
                      Evolution du solde, répartition, valeurs atypiques et comparaison annuelle
                    </p>
                  </div>
                  <div className="flex flex-col gap-6">
                    <ChartCard title="Évolution du solde de trésorerie" subtitle="Vue annuelle">
                      <TreasuryBalanceYearChart data={treasuryYearSeries} />
                    </ChartCard>
                    <ChartCard
                      title="Valeurs atypiques dans les flux de trésorerie"
                      subtitle="Vision trimestrielle"
                    >
                      <TreasuryOutliersChart data={treasuryOutlierData} />
                    </ChartCard>
                    <ChartCard title="Encaissements vs Décaissements" subtitle="Comparaison annuelle">
                      <TreasuryCreditDebitYearBar data={treasuryYearSeries} />
                    </ChartCard>
                  </div>
                </Card>
                <Card className="p-6 border-2">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Analyse budgétaire</h3>
                    <p className="text-sm text-muted-foreground">
                      Evolution, répartition, solde et prévision budgétaire
                    </p>
                  </div>
                  <div className="flex flex-col gap-6">
                    <ChartCard title="Évolution du solde budgétaire" subtitle="Vue annuelle">
                      <BudgetEvolutionYearChart data={budgetYearSeries} />
                    </ChartCard>
                    <ChartCard title="Recettes vs dépenses budgétaires" subtitle="Comparaison annuelle">
                      <BudgetRecettesDepensesYearBar data={budgetYearSeries} />
                    </ChartCard>
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}

        {activeMenu === "insights" && (
          <>
            <section>
              <SectionTitle
                number="01"
                title="Insights automatiques"
                subtitle="Stabilité, anomalies, risque et synthèse (période sélectionnée)"
              />
              {insightsCard}
            </section>
          </>
        )}

        {activeMenu === "simulation" && (
          <>
            {/* SECTION 3 — Simulation */}
            <section>
              <SectionTitle
                number="01"
                title="Simulation & Aide à la décision"
                subtitle="Testez un scénario et obtenez une recommandation automatique"
              />
              <div className="grid lg:grid-cols-2 gap-6">
                <SimulationPanel
                  baseSolde={treasuryDisplayKpi.solde}
                  totalCredit={treasuryDisplayKpi.totalCredit}
                  totalDebit={treasuryDisplayKpi.totalDebit}
                />
                <Card className="p-6 border-2 bg-[var(--gradient-hero)] text-black">
                  <h3 className="text-lg font-bold mb-3 text-black">Logique décisionnelle</h3>
                  <p className="text-sm text-black font-medium mb-5">
                    Trois règles métier pilotent les recommandations en temps réel :
                  </p>
                  <div className="space-y-3">
                    <Rule color="bg-danger" label="Solde < 0" desc="Déficit — financement urgent" />
                    <Rule
                      color="bg-warning"
                      label="Solde < 5% encaissements"
                      desc="Risque — surveillance hebdomadaire"
                    />
                    <Rule
                      color="bg-success"
                      label="Solde élevé"
                      desc="Situation saine — opportunités"
                    />
                  </div>
                </Card>
              </div>
            </section>

            {/* SECTION 4 — Prévision */}
            <section>
              <SectionTitle
                number="02"
                title="Prévision"
                subtitle="Projection 2024"
              />
              <Card className="p-6 border-2">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Projection 2024</h3>
                </div>
                <ForecastProjectionChart data={projectionChartData} />
              </Card>
            </section>
          </>
        )}

        <footer className="pt-8 pb-4 text-center text-xs text-muted-foreground border-t">
          PFE — Système décisionnel pour le pilotage du budget et de la trésorerie
        </footer>
      </main>
    </div>
  );
}

function SectionTitle({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5 flex items-end gap-3">
      <span className="text-4xl font-black text-primary/15 leading-none">{number}</span>
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6 border-2">
      <div className="mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </Card>
  );
}

function Rule({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-white/70 border border-black/10 p-3 backdrop-blur-sm">
      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black">{label}</p>
        <p className="text-xs text-black/75">{desc}</p>
      </div>
    </div>
  );
}
