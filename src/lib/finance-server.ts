import { createServerFn } from "@tanstack/react-start";
import { FINANCE_DATA, type FinanceRow } from "./finance-data";
import * as XLSX from "xlsx";

export type Decision = "Déficit" | "Risque" | "Bonne situation";

const LOCAL_BUDGET_BY_MONTH = (() => {
  const map = new Map<string, { budgetCredit: number; budgetDebit: number }>();
  for (const r of FINANCE_DATA) {
    const existing = map.get(r.date);
    if (existing) {
      existing.budgetCredit += r.budgetCredit;
      existing.budgetDebit += r.budgetDebit;
    } else {
      map.set(r.date, { budgetCredit: r.budgetCredit, budgetDebit: r.budgetDebit });
    }
  }
  return map;
})();

function getBackendBaseUrl(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const raw = env?.VITE_BACKEND_URL ?? env?.VITE_API_URL;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function shouldUseExcel(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const raw = env?.VITE_USE_EXCEL ?? env?.VITE_DATA_SOURCE;
  if (typeof raw !== "string") return true;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "excel";
}

async function tryBackendJson<T>(paths: string[], init?: RequestInit): Promise<T | null> {
  const base = getBackendBaseUrl();
  if (!base) return null;

  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  for (const path of paths) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${base}${normalizedPath}`;
    try {
      const res = await fetch(url, { ...init, headers });
      if (!res.ok) continue;
      return (await res.json()) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const normalized = keys.map((k) => ({ raw: k, n: normalizeKey(k) }));
  for (const c of candidates) {
    const n = normalizeKey(c);
    const found = normalized.find((k) => k.n === n || k.n.includes(n));
    if (found) return found.raw;
  }
  return null;
}

function parseExcelDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date((value - 25569) * 86400 * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const s = value.trim();
    const m1 = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (m1) return `${m1[1]}-${String(Number(m1[2])).padStart(2, "0")}`;
    const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m2) return `${m2[3]}-${String(Number(m2[2])).padStart(2, "0")}`;
  }

  return null;
}

function n(value: unknown): number {
  const x =
    typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : Number(value);
  return Number.isFinite(x) ? x : 0;
}

let cachedExcelRows: FinanceRow[] | null | undefined;
let cachedRegions: string[] | null | undefined;
let cachedExcelLoadPromise: Promise<FinanceRow[] | null> | null = null;

function distributeIntegers(total: number, weights: number[]): number[] {
  if (!Number.isFinite(total) || total <= 0 || weights.length === 0) return weights.map(() => 0);

  const sum = weights.reduce((s, w) => s + (Number.isFinite(w) && w > 0 ? w : 0), 0);
  const normalized =
    sum > 0 ? weights.map((w) => (w > 0 ? w / sum : 0)) : weights.map(() => 1 / weights.length);

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

async function loadRowsFromExcel(): Promise<FinanceRow[] | null> {
  if (cachedExcelRows !== undefined) return cachedExcelRows;
  if (cachedExcelLoadPromise) return await cachedExcelLoadPromise;

  cachedExcelLoadPromise = (async () => {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const basePath = path.join(process.cwd(), "FUSION BASE TRESO 2021-2023.xlsx");
      const dimPath = path.join(process.cwd(), "DIM REGION.xlsx");

      const [baseBuf, dimBuf] = await Promise.all([fs.readFile(basePath), fs.readFile(dimPath)]);
      const baseWb = XLSX.read(baseBuf, { type: "buffer" });
      const dimWb = XLSX.read(dimBuf, { type: "buffer" });

      const baseSheet = baseWb.Sheets[baseWb.SheetNames[0]];
      const dimSheet = dimWb.Sheets[dimWb.SheetNames[0]];

      const baseRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(baseSheet, {
        defval: null,
      });
      const dimRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(dimSheet, { defval: null });

      const dimKeys = Object.keys(dimRaw[0] ?? {});
      const dimIdKey = pickKey(dimKeys, [
        "idregion",
        "regionid",
        "coderegion",
        "regioncode",
        "id_region",
        "code_region",
      ]);
      const dimNameKey = pickKey(dimKeys, [
        "region",
        "nomregion",
        "libelleregion",
        "regionname",
        "nom_region",
      ]);

      const regionIdToName = new Map<string, string>();
      const regionNames = new Set<string>();

      for (const r of dimRaw) {
        const id = dimIdKey ? String(r[dimIdKey] ?? "").trim() : "";
        const name = dimNameKey ? String(r[dimNameKey] ?? "").trim() : "";
        if (name) regionNames.add(name);
        if (id && name) regionIdToName.set(id, name);
      }

      const baseKeys = Object.keys(baseRaw[0] ?? {});
      const dateKey = pickKey(baseKeys, ["date", "mois", "periode", "period"]);
      const creditKey = pickKey(baseKeys, [
        "credit",
        "encaissement",
        "encaissements",
        "recettes",
        "totalencaissements",
        "totalrecettes",
      ]);
      const debitKey = pickKey(baseKeys, [
        "debit",
        "decaissement",
        "decaissements",
        "depenses",
        "totaldecaissements",
        "totaldepenses",
      ]);
      const fluxKey = pickKey(baseKeys, ["flux", "solde", "net"]);
      const budgetCreditKey = pickKey(baseKeys, [
        "budgetcredit",
        "recettesbudget",
        "recettesbudgetaires",
        "budgetrecettes",
        "totalrecettesbudgetaires",
      ]);
      const budgetDebitKey = pickKey(baseKeys, [
        "budgetdebit",
        "depensesbudget",
        "depensesbudgetaires",
        "budgetdepenses",
        "totaldepensesbudgetaires",
      ]);

      const baseRegionIdKey = pickKey(baseKeys, [
        "idregion",
        "regionid",
        "coderegion",
        "regioncode",
        "id_region",
        "code_region",
      ]);
      const baseRegionNameKey = pickKey(baseKeys, [
        "region",
        "nomregion",
        "libelleregion",
        "regionname",
        "nom_region",
      ]);

      const buckets = new Map<string, FinanceRow>();

      for (const r of baseRaw) {
        const ym = dateKey ? parseExcelDate(r[dateKey]) : null;
        if (!ym) continue;

        const regionFromId = baseRegionIdKey
          ? regionIdToName.get(String(r[baseRegionIdKey] ?? "").trim())
          : undefined;
        const regionFromName = baseRegionNameKey ? String(r[baseRegionNameKey] ?? "").trim() : "";
        const region = regionFromId || regionFromName || "";

        const credit = creditKey ? n(r[creditKey]) : 0;
        const debit = debitKey ? n(r[debitKey]) : 0;
        const flux = fluxKey ? n(r[fluxKey]) : credit - debit;
        const budgetCredit = budgetCreditKey ? n(r[budgetCreditKey]) : 0;
        const budgetDebit = budgetDebitKey ? n(r[budgetDebitKey]) : 0;

        const key = `${ym}::${region || "__all__"}`;
        const existing = buckets.get(key);
        if (existing) {
          existing.credit += credit;
          existing.debit += debit;
          existing.flux += flux;
          existing.budgetCredit += budgetCredit;
          existing.budgetDebit += budgetDebit;
          existing.soldeBudget += budgetCredit - budgetDebit;
          existing.budget += budgetCredit;
        } else {
          buckets.set(key, {
            date: ym,
            credit,
            debit,
            flux,
            budgetCredit,
            budgetDebit,
            soldeBudget: budgetCredit - budgetDebit,
            budget: budgetCredit,
            region: region || undefined,
          });
        }
      }

      const needsLocalBudgetFallback =
        [...buckets.values()].reduce((s, r) => s + r.budgetCredit + r.budgetDebit, 0) === 0 &&
        LOCAL_BUDGET_BY_MONTH.size > 0;

      if (needsLocalBudgetFallback) {
        const rows = [...buckets.values()];
        const byDate = new Map<string, FinanceRow[]>();
        for (const row of rows) {
          const list = byDate.get(row.date);
          if (list) list.push(row);
          else byDate.set(row.date, [row]);
        }

        for (const [date, group] of byDate) {
          const local = LOCAL_BUDGET_BY_MONTH.get(date);
          if (!local) continue;

          const weightsCredit = group.map((r) => r.credit);
          const weightsDebit = group.map((r) => r.debit);
          const sumCredit = weightsCredit.reduce((s, v) => s + v, 0);
          const sumDebit = weightsDebit.reduce((s, v) => s + v, 0);
          const weights =
            sumCredit > 0 ? weightsCredit : sumDebit > 0 ? weightsDebit : group.map(() => 1);

          const allocatedBudgetCredit = distributeIntegers(local.budgetCredit, weights);
          const allocatedBudgetDebit = distributeIntegers(local.budgetDebit, weights);

          for (let i = 0; i < group.length; i++) {
            const r = group[i];
            const bc = allocatedBudgetCredit[i] ?? 0;
            const bd = allocatedBudgetDebit[i] ?? 0;
            r.budgetCredit = bc;
            r.budgetDebit = bd;
            r.soldeBudget = bc - bd;
            r.budget = bc;
          }
        }
      }

      cachedRegions = [...regionNames].sort((a, b) => a.localeCompare(b, "fr"));
      cachedExcelRows = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
      return cachedExcelRows;
    } catch {
      cachedRegions = null;
      cachedExcelRows = null;
      return null;
    } finally {
      cachedExcelLoadPromise = null;
    }
  })();

  return await cachedExcelLoadPromise;
}

function aggregateByMonth(rows: FinanceRow[]): FinanceRow[] {
  const map = new Map<string, FinanceRow>();
  for (const r of rows) {
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
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const getRegions = createServerFn({ method: "GET" }).handler(async () => {
  const fromBackend = await tryBackendJson<{ regions: string[] }>(["/regions", "/api/regions"]);
  if (fromBackend?.regions) return { regions: fromBackend.regions };

  if (!shouldUseExcel()) {
    const regions = [
      ...new Set(FINANCE_DATA.map((r) => r.region).filter(Boolean) as string[]),
    ].sort((a, b) => a.localeCompare(b, "fr"));
    return { regions };
  }

  if (cachedRegions !== undefined && cachedRegions !== null) return { regions: cachedRegions };
  await loadRowsFromExcel();
  return { regions: cachedRegions ?? [] };
});

function decide(solde: number, credit: number): Decision {
  if (solde < 0) return "Déficit";
  if (solde < credit * 0.05) return "Risque";
  return "Bonne situation";
}

type YearlyStats = {
  year: number;
  totalCredit: number;
  totalDebit: number;
  solde: number;
  avgMonthlyCredit: number;
  avgMonthlyDebit: number;
  avgFlux: number;
  stdFlux: number;
  minFlux: number;
  maxFlux: number;
  negativeMonths: number;
  totalBudgetCredit: number;
  totalBudgetDebit: number;
  soldeBudget: number;
};

function computeYearlyStats(data: FinanceRow[], year: number): YearlyStats {
  const rows = data.filter((r) => r.date.startsWith(String(year)));
  const fluxs = rows.map((r) => r.flux);
  const mean = fluxs.reduce((a, b) => a + b, 0) / (fluxs.length || 1);
  const std = Math.sqrt(fluxs.reduce((s, v) => s + (v - mean) ** 2, 0) / (fluxs.length || 1));
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalBudgetCredit = rows.reduce((s, r) => s + r.budgetCredit, 0);
  const totalBudgetDebit = rows.reduce((s, r) => s + r.budgetDebit, 0);
  return {
    year,
    totalCredit,
    totalDebit,
    solde: totalCredit - totalDebit,
    avgMonthlyCredit: totalCredit / (rows.length || 1),
    avgMonthlyDebit: totalDebit / (rows.length || 1),
    avgFlux: mean,
    stdFlux: std,
    minFlux: Math.min(...fluxs),
    maxFlux: Math.max(...fluxs),
    negativeMonths: rows.filter((r) => r.flux < 0).length,
    totalBudgetCredit,
    totalBudgetDebit,
    soldeBudget: totalBudgetCredit - totalBudgetDebit,
  };
}

type MlMetrics = {
  r2Flux: number;
  r2Credit: number;
  r2Debit: number;
  stdErrorFlux: number;
  slopeFlux: number;
  interceptFlux: number;
  modelQuality: "excellente" | "bonne" | "modérée" | "faible";
  confidenceLevel: "haute" | "moyenne" | "basse";
};

function computeR2(xs: number[], ys: number[], slope: number, intercept: number): number {
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  return ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
}

function computeStdError(xs: number[], ys: number[], slope: number, intercept: number): number {
  const n = xs.length;
  if (n <= 2) return 0;
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const ssRes = residuals.reduce((s, r) => s + r ** 2, 0);
  return Math.sqrt(ssRes / (n - 2));
}

// /kpi
export const getKpi = createServerFn({ method: "GET" }).handler(async () => {
  const fromBackend = await tryBackendJson<{
    rows: FinanceRow[];
    totalCredit: number;
    totalDebit: number;
    solde: number;
    totalBudgetCredit: number;
    totalBudgetDebit: number;
    soldeBudget: number;
    totalBudget: number;
    ecartBudget: number;
    executionRate: number;
    tresorerieExecutionRate?: number;
    decision: Decision;
    yearlyStats: YearlyStats[];
    evolutionCredit: number;
  }>(["/kpi", "/api/kpi"]);
  if (fromBackend) return fromBackend;

  const sourceRows = (shouldUseExcel() ? await loadRowsFromExcel() : null) ?? FINANCE_DATA;
  const rowsMonthly = aggregateByMonth(sourceRows);

  const totalCredit = rowsMonthly.reduce((s, r) => s + r.credit, 0);
  const totalDebit = rowsMonthly.reduce((s, r) => s + r.debit, 0);

  const totalBudgetCredit = rowsMonthly.reduce((s, r) => s + r.budgetCredit, 0);
  const totalBudgetDebit = rowsMonthly.reduce((s, r) => s + r.budgetDebit, 0);

  const solde = totalCredit - totalDebit;
  const soldeBudget = totalBudgetCredit - totalBudgetDebit;
  const executionRate = totalBudgetCredit > 0 ? (totalBudgetDebit / totalBudgetCredit) * 100 : 0;
  const tresorerieExecutionRate = totalCredit > 0 ? (totalDebit / totalCredit) * 100 : 0;

  const years = [...new Set(rowsMonthly.map((r) => parseInt(r.date.split("-")[0])))].sort();
  const yearlyStats = years.map((y) => computeYearlyStats(rowsMonthly, y));

  const evolutionCredit =
    yearlyStats.length >= 2
      ? ((yearlyStats[yearlyStats.length - 1].totalCredit - yearlyStats[0].totalCredit) /
          yearlyStats[0].totalCredit) *
        100
      : 0;

  return {
    rows: sourceRows,
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
    decision: decide(solde, totalCredit),
    yearlyStats,
    evolutionCredit,
  };
});

// /simulation
export const runSimulation = createServerFn({ method: "POST" })
  .inputValidator((input: { variationPct: number; totalCredit?: number; totalDebit?: number }) => {
    const v = Math.max(-50, Math.min(100, Number(input.variationPct) || 0));
    const totalCredit = Number.isFinite(Number(input.totalCredit))
      ? Math.max(0, Number(input.totalCredit))
      : undefined;
    const totalDebit = Number.isFinite(Number(input.totalDebit))
      ? Math.max(0, Number(input.totalDebit))
      : undefined;
    return { variationPct: v, totalCredit, totalDebit };
  })
  .handler(async ({ data }) => {
    const hasCustomTotals =
      typeof data.totalCredit === "number" || typeof data.totalDebit === "number";
    if (!hasCustomTotals) {
      const fromBackend = await tryBackendJson<{
        variationPct: number;
        baseSolde: number;
        newDebit: number;
        newSolde: number;
        impact: number;
        decision: Decision;
        recommandation: string;
      }>(["/simulation", "/api/simulation"], { method: "POST", body: JSON.stringify(data) });
      if (fromBackend) return fromBackend;
    }

    const totalCredit =
      typeof data.totalCredit === "number"
        ? data.totalCredit
        : FINANCE_DATA.reduce((s, r) => s + r.credit, 0);
    const totalDebit =
      typeof data.totalDebit === "number"
        ? data.totalDebit
        : FINANCE_DATA.reduce((s, r) => s + r.debit, 0);
    const newDebit = totalDebit * (1 + data.variationPct / 100);
    const newSolde = totalCredit - newDebit;
    const baseSolde = totalCredit - totalDebit;
    const decision = decide(newSolde, totalCredit);
    let recommandation = "";
    if (decision === "Déficit") {
      recommandation =
        "Réduire immédiatement les dépenses non essentielles et anticiper un financement court terme.";
    } else if (decision === "Risque") {
      recommandation =
        "Optimiser le budget, prioriser les engagements et surveiller la trésorerie hebdomadairement.";
    } else {
      recommandation =
        "Situation saine : envisager des placements ou investissements stratégiques.";
    }
    return {
      variationPct: data.variationPct,
      baseSolde,
      newDebit,
      newSolde,
      impact: newSolde - baseSolde,
      decision,
      recommandation,
    };
  });

// Simple linear regression for /prevision
function linreg(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// /prevision
export const getForecast = createServerFn({ method: "GET" }).handler(async () => {
  const fromBackend = await tryBackendJson<{
    forecast: { date: string; credit: number; debit: number; flux: number; forecast: true }[];
    tendance: "hausse" | "baisse" | "stable";
    slope: number;
    intercept: number;
    metrics: MlMetrics & { avgR2: number };
    forecastTrendPct: number;
    lastActualFlux: number;
    forecastAvgFlux: number;
  }>(["/prevision", "/forecast", "/api/prevision", "/api/forecast"]);
  if (fromBackend) return fromBackend;

  const sourceRows = (await loadRowsFromExcel()) ?? FINANCE_DATA;
  const monthly = aggregateByMonth(sourceRows);

  const xs = monthly.map((_, i) => i);
  const fluxs = monthly.map((r) => r.flux);
  const credits = monthly.map((r) => r.credit);
  const debits = monthly.map((r) => r.debit);
  const fluxModel = linreg(xs, fluxs);
  const cModel = linreg(xs, credits);
  const dModel = linreg(xs, debits);

  const r2Flux = computeR2(xs, fluxs, fluxModel.slope, fluxModel.intercept);
  const r2Credit = computeR2(xs, credits, cModel.slope, cModel.intercept);
  const r2Debit = computeR2(xs, debits, dModel.slope, dModel.intercept);
  const stdErrorFlux = computeStdError(xs, fluxs, fluxModel.slope, fluxModel.intercept);

  const avgR2 = (r2Flux + r2Credit + r2Debit) / 3;
  const modelQuality: MlMetrics["modelQuality"] =
    avgR2 >= 0.8 ? "excellente" : avgR2 >= 0.6 ? "bonne" : avgR2 >= 0.4 ? "modérée" : "faible";
  const confidenceLevel: MlMetrics["confidenceLevel"] =
    stdErrorFlux < 1e7 ? "haute" : stdErrorFlux < 5e7 ? "moyenne" : "basse";

  const lastDate = monthly[monthly.length - 1].date;
  const horizon = 12;
  const forecast = [];
  for (let k = 1; k <= horizon; k++) {
    const i = monthly.length - 1 + k;
    forecast.push({
      date: addMonths(lastDate, k),
      credit: Math.max(0, Math.round(cModel.intercept + cModel.slope * i)),
      debit: Math.max(0, Math.round(dModel.intercept + dModel.slope * i)),
      flux: Math.round(fluxModel.intercept + fluxModel.slope * i),
      forecast: true as const,
    });
  }

  const allFluxs = [...fluxs, ...forecast.map((f) => f.flux)];
  const allMean = allFluxs.reduce((a, b) => a + b, 0) / allFluxs.length;
  const forecastAvgFlux = forecast.reduce((s, f) => s + f.flux, 0) / forecast.length;
  const forecastTrendPct =
    ((forecastAvgFlux - fluxs[fluxs.length - 1]) / Math.abs(fluxs[fluxs.length - 1])) * 100;

  const tendance: "hausse" | "baisse" | "stable" =
    fluxModel.slope > 1e5 ? "hausse" : fluxModel.slope < -1e5 ? "baisse" : "stable";

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
    lastActualFlux: fluxs[fluxs.length - 1],
    forecastAvgFlux,
  };
});

// /analyse
export const getAnalysis = createServerFn({ method: "GET" }).handler(async () => {
  const fromBackend = await tryBackendJson<{
    mean: number;
    std: number;
    anomalies: { date: string; flux: number; type: "pic" | "creux"; zScore: number }[];
    criticalCount: number;
    stableCount: number;
    insights: string[];
    yearlyStats: YearlyStats[];
    yearOverYearEvol: number;
    peakMonth: { date: string; flux: number };
    troughMonth: { date: string; flux: number };
    volatilityCoefficient: number;
    riskLevel: "élevée" | "modérée" | "faible";
  }>(["/analyse", "/analysis", "/api/analyse", "/api/analysis"]);
  if (fromBackend) return fromBackend;

  const sourceRows = (await loadRowsFromExcel()) ?? FINANCE_DATA;
  const monthly = aggregateByMonth(sourceRows);
  const fluxs = monthly.map((r) => r.flux);
  const mean = fluxs.reduce((a, b) => a + b, 0) / fluxs.length;
  const avgAbs = fluxs.reduce((s, v) => s + Math.abs(v), 0) / fluxs.length;
  const std = Math.sqrt(fluxs.reduce((s, v) => s + (v - mean) ** 2, 0) / fluxs.length);
  const anomalies: { date: string; flux: number; type: "pic" | "creux"; zScore: number }[] = [];
  const critical: FinanceRow[] = [];
  const stable: FinanceRow[] = [];

  monthly.forEach((r) => {
    const z = (r.flux - mean) / (std || 1);
    if (Math.abs(z) > 1.5) {
      anomalies.push({
        date: r.date,
        flux: r.flux,
        type: z > 0 ? "pic" : "creux",
        zScore: Math.round(z * 100) / 100,
      });
    }
    if (r.flux < 0) critical.push(r);
    else if (Math.abs(z) < 0.5) stable.push(r);
  });
  const picCount = anomalies.filter((a) => a.type === "pic").length;
  const creuxCount = anomalies.filter((a) => a.type === "creux").length;

  const years = [...new Set(monthly.map((r) => parseInt(r.date.split("-")[0])))].sort();
  const yearlyStats = years.map((y) => computeYearlyStats(monthly, y));

  const latestYear = yearlyStats[yearlyStats.length - 1];
  const previousYear = yearlyStats[yearlyStats.length - 2];
  const yearOverYearEvol = previousYear
    ? ((latestYear.solde - previousYear.solde) / Math.abs(previousYear.solde)) * 100
    : 0;

  const peakMonth = monthly.reduce((max, r) => (r.flux > max.flux ? r : max), monthly[0]);
  const troughMonth = monthly.reduce((min, r) => (r.flux < min.flux ? r : min), monthly[0]);

  const insights: string[] = [
    `Flux moyen mensuel : ${Math.round(mean / 1000).toLocaleString("fr-FR")} K DH`,
    `${anomalies.length} anomalie(s) détectée(s) dont ${anomalies.filter((a) => a.type === "pic").length} pic(s) et ${anomalies.filter((a) => a.type === "creux").length} creux`,
    `${critical.length} mois en flux négatif (risque de tension de trésorerie)`,
    `Pic maximum : ${peakMonth.date} avec ${(peakMonth.flux / 1e6).toFixed(2)} M DH`,
    `Creux minimum : ${troughMonth.date} avec ${(troughMonth.flux / 1e6).toFixed(2)} M DH`,
    yearOverYearEvol !== 0
      ? `Évolution solde annuel : ${yearOverYearEvol > 0 ? "+" : ""}${Math.round(yearOverYearEvol)}%`
      : "",
  ].filter(Boolean);

  return {
    mean,
    std,
    anomalies,
    criticalCount: critical.length,
    stableCount: stable.length,
    insights,
    yearlyStats,
    yearOverYearEvol,
    peakMonth: { date: peakMonth.date, flux: peakMonth.flux },
    troughMonth: { date: troughMonth.date, flux: troughMonth.flux },
    volatilityCoefficient: std / (avgAbs || 1),
    riskLevel:
      critical.length > 0 || creuxCount > 0
        ? "élevée"
        : std / (avgAbs || 1) > 0.8 || anomalies.length >= 4 || picCount >= 4
          ? "modérée"
          : "faible",
  };
});
