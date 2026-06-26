import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Bar,
  Legend,
  ReferenceLine,
  ReferenceDot,
  Cell,
  ComposedChart,
  Area,
  PieChart,
  Pie,
  BarChart,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { useId } from "react";
import { fmtMAD, fmtMonth } from "@/lib/format";
import type { FinanceRow } from "@/lib/finance-data";

type ForecastRow = {
  date: string;
  credit: number;
  debit: number;
  flux: number;
  forecast: true;
};

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

type TreasuryMergedPoint = {
  date: string;
  flux: number | null;
  fluxPrev: number | null;
  soldeCum: number | null;
  soldeCumPrev: number | null;
};

function domainWithPadding(values: number[], padRatio = 0.12): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * padRatio);
    return [min - pad, max + pad];
  }
  const range = max - min;
  const pad = range * padRatio;
  return [min - pad, max + pad];
}

function buildTreasuryMerged(data: FinanceRow[], forecast?: ForecastRow[]): TreasuryMergedPoint[] {
  let solde = 0;
  const actual = data.map((r) => {
    solde += r.flux;
    return {
      date: r.date,
      flux: r.flux,
      fluxPrev: null,
      soldeCum: solde,
      soldeCumPrev: null,
    } satisfies TreasuryMergedPoint;
  });

  const safeForecast = forecast ?? [];
  if (safeForecast.length === 0) return actual;

  let soldePrev = solde;
  const prev = safeForecast.map((r) => {
    soldePrev += r.flux;
    return {
      date: r.date,
      flux: null,
      fluxPrev: r.flux,
      soldeCum: null,
      soldeCumPrev: soldePrev,
    } satisfies TreasuryMergedPoint;
  });

  return [...actual, ...prev];
}

type BudgetPoint = {
  date: string;
  soldeBudget: number;
  soldeBudgetCum: number;
};

function buildBudgetSeries(data: FinanceRow[]): BudgetPoint[] {
  let soldeBudgetCum = 0;
  return data.map((r) => {
    soldeBudgetCum += r.soldeBudget;
    return { date: r.date, soldeBudget: r.soldeBudget, soldeBudgetCum };
  });
}

export function FluxChart({ data, forecast }: { data: FinanceRow[]; forecast?: ForecastRow[] }) {
  const id = useId().replace(/[:]/g, "");
  const merged = buildTreasuryMerged(data, forecast);
  const lastActual = merged.filter((p) => p.soldeCum != null).at(-1) ?? null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={merged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`tres-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-flux)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-flux)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="date" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => fmtMAD(v)}
          tick={{ fontSize: 11 }}
          width={70}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
          labelFormatter={fmtMonth}
        />
        <ReferenceLine
          yAxisId="left"
          y={0}
          stroke="var(--muted-foreground)"
          strokeDasharray="2 2"
        />

        <Bar yAxisId="left" dataKey="flux" name="Flux mensuel" barSize={14} radius={[6, 6, 6, 6]}>
          {merged.map((p, i) => (
            <Cell
              key={`${p.date}-${i}`}
              fill={((p.flux ?? 0) >= 0 ? "var(--chart-credit)" : "var(--chart-debit)") as string}
              fillOpacity={0.55}
              stroke="var(--border)"
              strokeOpacity={0.25}
            />
          ))}
        </Bar>

        <Area
          yAxisId="right"
          type="monotone"
          dataKey="soldeCum"
          stroke="var(--chart-flux)"
          strokeWidth={2.5}
          fill={`url(#tres-fill-${id})`}
          fillOpacity={1}
          dot={false}
          name="Solde cumulatif"
        />

        {forecast && forecast.length > 0 && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="soldeCumPrev"
            stroke="var(--chart-flux)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            name="Solde prévisionnel"
          />
        )}

        {lastActual?.soldeCum != null && (
          <ReferenceDot
            yAxisId="right"
            x={lastActual.date}
            y={lastActual.soldeCum}
            r={4}
            fill="var(--chart-flux)"
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: fmtMAD(lastActual.soldeCum),
              position: "top",
              fill: "var(--muted-foreground)",
              fontSize: 11,
            }}
          />
        )}

        <Legend wrapperStyle={{ fontSize: "12px" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CreditDebitChart({ data }: { data: FinanceRow[] }) {
  const totalCredit = data.reduce((s, r) => s + r.credit, 0);
  const totalDebit = data.reduce((s, r) => s + r.debit, 0);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="date" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
          labelFormatter={fmtMonth}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar
          dataKey="credit"
          fill="var(--chart-credit)"
          fillOpacity={0.65}
          name={`Encaissements (${fmtMAD(totalCredit)})`}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
        <Bar
          dataKey="debit"
          fill="var(--chart-debit)"
          fillOpacity={0.6}
          name={`Décaissements (${fmtMAD(totalDebit)})`}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function BudgetVsRealChart({ data }: { data: FinanceRow[] }) {
  const id = useId().replace(/[:]/g, "");
  const series = buildBudgetSeries(data);
  const totalBudgetSolde = series.at(-1)?.soldeBudgetCum ?? 0;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`budget-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-budget)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-budget)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="date" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => fmtMAD(v)}
          tick={{ fontSize: 11 }}
          width={70}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
          labelFormatter={fmtMonth}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <ReferenceLine
          yAxisId="left"
          y={0}
          stroke="var(--muted-foreground)"
          strokeDasharray="2 2"
        />

        <Bar
          yAxisId="left"
          dataKey="soldeBudget"
          name="Solde mensuel (Budget)"
          barSize={14}
          radius={[6, 6, 6, 6]}
          fill="var(--chart-budget)"
          fillOpacity={0.35}
        />

        <Area
          yAxisId="right"
          type="monotone"
          dataKey="soldeBudgetCum"
          stroke="var(--chart-budget)"
          strokeWidth={2.5}
          fill={`url(#budget-fill-${id})`}
          fillOpacity={1}
          dot={false}
          name={`Solde cumulatif (${fmtMAD(totalBudgetSolde)})`}
        />

        {series.length > 0 && (
          <ReferenceDot
            yAxisId="right"
            x={series[series.length - 1].date}
            y={series[series.length - 1].soldeBudgetCum}
            r={4}
            fill="var(--chart-budget)"
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: fmtMAD(series[series.length - 1].soldeBudgetCum),
              position: "top",
              fill: "var(--muted-foreground)",
              fontSize: 11,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type YearBudgetPoint = {
  year: string;
  soldeBudget: number;
  budgetCredit: number;
  budgetDebit: number;
  predicted?: boolean;
  soldeBudgetForecast?: number;
};

export function BudgetEvolutionYearChart({ data }: { data: YearBudgetPoint[] }) {
  const id = useId().replace(/[:]/g, "");
  const domain = domainWithPadding(data.map((p) => p.soldeBudget), 0.18);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`budget-year-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-budget)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-budget)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickMargin={8} />
        <YAxis
          tickFormatter={(v) => fmtMAD(v)}
          tick={{ fontSize: 11 }}
          width={74}
          domain={domain}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
        <Area
          type="linear"
          dataKey="soldeBudget"
          stroke="var(--chart-budget)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#budget-year-fill-${id})`}
          dot={{ r: 4, stroke: "var(--background)", strokeWidth: 2, fill: "var(--chart-budget)" }}
          activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
          name="Solde budgétaire"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type PostePoint = { poste: string; value: number };

const postePalette = [
  "var(--chart-credit)",
  "var(--chart-budget)",
  "var(--chart-debit)",
  "var(--chart-flux)",
];

export function BudgetPostePieChart({ data }: { data: PostePoint[] }) {
  const total = data.reduce((s, p) => s + p.value, 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="poste"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          stroke="var(--border)"
          strokeOpacity={0.4}
          label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={postePalette[i % postePalette.length] as string}
              fillOpacity={0.9}
            />
          ))}
        </Pie>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--foreground)"
        >
          {fmtMAD(total)}
        </text>
        <text
          x="50%"
          y="50%"
          dy={16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={11}
        >
          Total
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BudgetGauge({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone?: "success" | "danger" | "primary";
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (Math.max(0, value) / safeMax) * 100));
  const fill =
    tone === "danger"
      ? "var(--chart-debit)"
      : tone === "success"
        ? "var(--chart-credit)"
        : "var(--chart-budget)";

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadialBarChart
        cx="50%"
        cy="60%"
        innerRadius="60%"
        outerRadius="90%"
        barSize={14}
        startAngle={180}
        endAngle={0}
        data={[{ name: "Solde", value: pct }]}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={12} fill={fill as string} fillOpacity={0.85} />
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--foreground)"
        >
          {fmtMAD(value)}
        </text>
        <text
          x="50%"
          y="55%"
          dy={16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={11}
        >
          Solde budgétaire
        </text>
        <text x="10%" y="88%" textAnchor="start" fill="var(--muted-foreground)" fontSize={11}>
          {fmtMAD(0)}
        </text>
        <text x="90%" y="88%" textAnchor="end" fill="var(--muted-foreground)" fontSize={11}>
          {fmtMAD(safeMax)}
        </text>
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export function BudgetExpensesByPosteBar({ data }: { data: PostePoint[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis type="number" tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="poste" tick={{ fontSize: 11 }} width={90} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Bar dataKey="value" name="Dépenses" radius={[6, 6, 6, 6]} barSize={14}>
          {sorted.map((_, i) => (
            <Cell
              key={i}
              fill={(postePalette[i % postePalette.length] as string) ?? "var(--chart-debit)"}
              fillOpacity={0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BudgetRecettesDepensesYearBar({ data }: { data: YearBudgetPoint[] }) {
  const clean = data.filter((d) => !d.predicted);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={clean} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar
          dataKey="budgetCredit"
          name="Total Recettes Budgétaires"
          fill="var(--chart-credit)"
          fillOpacity={0.65}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
        <Bar
          dataKey="budgetDebit"
          name="Total Dépenses Budgétaires"
          fill="var(--chart-debit)"
          fillOpacity={0.6}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BudgetForecastYearLine({ data }: { data: YearBudgetPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Line
          type="monotone"
          name="Solde budgétaire (réel)"
          dataKey="soldeBudget"
          stroke="var(--chart-budget)"
          strokeWidth={2.5}
          dot
        />
        <Line
          type="monotone"
          name="Prévision"
          dataKey="soldeBudgetForecast"
          stroke="var(--chart-budget)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type TreasuryYearPoint = {
  year: string;
  solde: number;
  totalCredit: number;
  totalDebit: number;
};

export function TreasuryBalanceYearChart({ data }: { data: TreasuryYearPoint[] }) {
  const id = useId().replace(/[:]/g, "");
  const domain = domainWithPadding(data.map((p) => p.solde), 0.18);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`treso-year-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-flux)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-flux)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickMargin={8} />
        <YAxis
          tickFormatter={(v) => fmtMAD(v)}
          tick={{ fontSize: 11 }}
          width={74}
          domain={domain}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
        <Area
          type="linear"
          dataKey="solde"
          stroke="var(--chart-flux)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#treso-year-fill-${id})`}
          dot={{ r: 4, stroke: "var(--background)", strokeWidth: 2, fill: "var(--chart-flux)" }}
          activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
          name="Solde de trésorerie"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type CategoryPoint = { label: string; value: number };

export function TreasuryDonutChart({
  data,
  centerLabel,
}: {
  data: CategoryPoint[];
  centerLabel: string;
}) {
  const total = data.reduce((s, p) => s + p.value, 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          stroke="var(--border)"
          strokeOpacity={0.4}
          label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={postePalette[i % postePalette.length] as string}
              fillOpacity={0.9}
            />
          ))}
        </Pie>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--foreground)"
        >
          {fmtMAD(total)}
        </text>
        <text
          x="50%"
          y="50%"
          dy={16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={11}
        >
          {centerLabel}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

type OutlierPoint = {
  idx: number;
  date: string;
  flux: number;
  z: number;
  status: "normal" | "anomalie";
};

export function TreasuryOutliersChart({ data }: { data: OutlierPoint[] }) {
  const dots = data.map((p) => ({
    ...p,
    size: p.status === "anomalie" ? 120 : 60,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis
          dataKey="idx"
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => data[Math.max(0, Math.min(data.length - 1, v))]?.date ?? ""}
        />
        <YAxis dataKey="flux" tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} width={70} />
        <ZAxis dataKey="size" range={[40, 140]} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null, name: string) => {
            if (name === "flux") return v == null ? "" : fmtMAD(v);
            return v == null ? "" : String(v);
          }}
          labelFormatter={(v: number) => data[Math.max(0, Math.min(data.length - 1, v))]?.date ?? ""}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
        <Scatter
          data={dots}
          dataKey="flux"
          name="Flux"
          fill="var(--chart-flux)"
          fillOpacity={0.35}
          stroke="var(--border)"
          strokeOpacity={0.25}
        >
          {dots.map((p, i) => (
            <Cell
              key={i}
              fill={
                (p.status === "anomalie" ? "var(--chart-debit)" : "var(--chart-flux)") as string
              }
              fillOpacity={p.status === "anomalie" ? 0.85 : 0.35}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function TreasuryCreditDebitYearBar({ data }: { data: TreasuryYearPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.55}
          vertical={false}
        />
        <XAxis type="number" tickFormatter={(v) => fmtMAD(v)} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="year" tick={{ fontSize: 11 }} width={56} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar
          dataKey="totalCredit"
          name="Total Encaissements"
          fill="var(--chart-credit)"
          fillOpacity={0.65}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
        <Bar
          dataKey="totalDebit"
          name="Total Décaissements"
          fill="var(--chart-debit)"
          fillOpacity={0.6}
          radius={[6, 6, 0, 0]}
          barSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

type ForecastProjectionPoint = {
  label: string;
  actual?: number | null;
  forecastPath?: number | null;
  confidenceLow?: number | null;
  confidenceBand?: number | null;
  confidenceHigh?: number | null;
};

export function ForecastProjectionChart({ data }: { data: ForecastProjectionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={500}>
      <ComposedChart data={data} margin={{ top: 28, right: 30, left: 18, bottom: 36 }}>
        <CartesianGrid
          strokeDasharray="6 6"
          stroke="var(--border)"
          strokeOpacity={0.45}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12 }}
          tickMargin={12}
          axisLine={false}
          tickLine={false}
          interval={0}
          minTickGap={24}
          padding={{ left: 30, right: 18 }}
        />
        <YAxis
          tickFormatter={(v) => fmtMAD(v)}
          tick={{ fontSize: 12 }}
          width={92}
          domain={[0, 24_000_000]}
          ticks={[0, 6_000_000, 12_000_000, 18_000_000, 24_000_000]}
          axisLine={false}
          tickLine={false}
          label={{
            value: "Solde de trésorerie",
            angle: -90,
            position: "insideLeft",
            style: { textAnchor: "middle", fill: "var(--muted-foreground)", fontSize: 12 },
          }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | null) => (v == null ? "" : fmtMAD(v))}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
          formatter={(value) =>
            value === "Intervalle de confiance" ? (
              <span style={{ color: "var(--foreground)" }}>{value}</span>
            ) : (
              value
            )
          }
        />
        <Area
          type="linear"
          dataKey="confidenceLow"
          stackId="confidence"
          name={false}
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
        />
        <Area
          type="linear"
          dataKey="confidenceBand"
          stackId="confidence"
          name="Intervalle de confiance"
          stroke="none"
          fill="var(--muted)"
          fillOpacity={0.35}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Solde réel 2021–2023"
          stroke="var(--chart-flux)"
          strokeWidth={3.6}
          dot={{ r: 6, fill: "var(--chart-flux)" }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="forecastPath"
          name="Prévision 2024"
          stroke="var(--chart-credit)"
          strokeWidth={3.6}
          strokeDasharray="7 5"
          dot={{ r: 5, fill: "var(--chart-credit)" }}
          connectNulls
        />
        <ReferenceLine
          x="2023"
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: "Prévision",
            position: "insideTop",
            fill: "var(--muted-foreground)",
            fontSize: 11,
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
