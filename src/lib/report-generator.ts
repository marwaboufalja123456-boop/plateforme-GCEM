import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMAD } from "./format";
import logoCgemUrl from "../assets/logo-cgem.jpg";

type KpiYearlyStat = {
  year: number;
  totalCredit: number;
  totalDebit: number;
  solde: number;
  totalBudgetCredit?: number;
  totalBudgetDebit?: number;
  soldeBudget?: number;
  avgMonthlyCredit?: number;
  avgMonthlyDebit?: number;
  avgFlux?: number;
  stdFlux?: number;
  minFlux?: number;
  maxFlux?: number;
  negativeMonths?: number;
};

type KpiData = {
  yearlyStats?: KpiYearlyStat[];
  totalCredit?: number;
  totalDebit?: number;
  solde?: number;
  totalBudget?: number;
  totalBudgetCredit?: number;
  totalBudgetDebit?: number;
  soldeBudget?: number;
  ecartBudget?: number;
  executionRate?: number;
  decision?: string;
  evolutionCredit?: number;
};

type ForecastRow = { date: string; credit: number; debit: number; flux: number; forecast?: true };
type ForecastMetrics = {
  r2Flux?: number;
  r2Credit?: number;
  r2Debit?: number;
  stdErrorFlux?: number;
  slopeFlux?: number;
  interceptFlux?: number;
  modelQuality?: string;
  confidenceLevel?: string;
  avgR2?: number;
};
type ForecastData = {
  forecast?: ForecastRow[];
  tendance?: string;
  metrics?: ForecastMetrics;
  forecastTrendPct?: number;
  lastActualFlux?: number;
  forecastAvgFlux?: number;
};

type AnalysisData = {
  mean?: number;
  std?: number;
  anomalies?: { date: string; flux: number; type: "pic" | "creux"; zScore: number }[];
  criticalCount?: number;
  stableCount?: number;
  insights?: string[];
  yearOverYearEvol?: number;
  peakMonth?: { date: string; flux: number };
  troughMonth?: { date: string; flux: number };
  volatilityCoefficient?: number;
  riskLevel?: "élevée" | "modérée" | "faible";
};

function n(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function pct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export async function generateProReport(
  kpi: KpiData,
  forecast: unknown,
  analysis: unknown,
): Promise<{ blob: Blob; filename: string }> {
  try {
    const forecastData = (forecast as ForecastData) ?? {};
    const analysisData = (analysis as AnalysisData) ?? {};

    const organisation = "CGEM";
    const departement = "Finance";
    const editionDate = new Date();
    const editionDateStr = editionDate.toLocaleDateString("fr-FR");

    let logoDataUrl: string | null = null;
    try {
      const res = await fetch(logoCgemUrl);
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Logo read failed"));
        reader.readAsDataURL(blob);
      });
    } catch {
      logoDataUrl = null;
    }

    const navy: [number, number, number] = [10, 38, 71];
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 18;
    const topBarH = 12;

    const getLastTableY = (fallbackY: number) => {
      const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
      const y = last?.finalY ?? undefined;
      return typeof y === "number" ? y : fallbackY;
    };

    const drawHeaderFooter = (pageNum: number) => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, pageWidth, topBarH, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CGEM — Département Finance", marginX, 8);
      doc.text("Rapport Financier", pageWidth - marginX, 8, { align: "right" });
      if (logoDataUrl) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageWidth / 2 - 5.5, 2, 11, 8, 1.5, 1.5, "F");
        doc.addImage(logoDataUrl, "JPEG", pageWidth / 2 - 4.7, 2.7, 9.4, 6.6);
      }

      doc.setTextColor(130, 130, 130);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Document confidentiel — CGEM", marginX, pageHeight - 8);
      doc.text(`Page ${pageNum}`, pageWidth - marginX, pageHeight - 8, { align: "right" });
    };

    const sectionTitle = (title: string, y: number) => {
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, marginX, y);
    };

    const writeParagraph = (text: string, y: number, maxWidth: number) => {
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, marginX, y);
      return y + lines.length * 4.6;
    };

    const ensureSpace = (y: number, needed: number) => {
      if (y + needed <= pageHeight - 18) return y;
      doc.addPage();
      drawHeaderFooter(doc.getNumberOfPages());
      return 28;
    };

    const distributeIntegers = (total: number, weights: number[]): number[] => {
      if (!Number.isFinite(total) || total <= 0 || weights.length === 0)
        return weights.map(() => 0);
      const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
      const sum = safe.reduce((s, w) => s + w, 0);
      const normalized = sum > 0 ? safe.map((w) => w / sum) : safe.map(() => 1 / safe.length);
      const raw = normalized.map((w) => total * w);
      const base = raw.map((v) => Math.floor(v));
      let remainder = Math.round(total - base.reduce((s, v) => s + v, 0));
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
    };

    const yearlyStats: KpiYearlyStat[] = Array.isArray(kpi.yearlyStats) ? kpi.yearlyStats : [];
    const annual = yearlyStats
      .filter((ys) => ys.year === 2021 || ys.year === 2022 || ys.year === 2023)
      .sort((a, b) => a.year - b.year);
    const annualYears = annual.map((ys) => ys.year);
    const periode =
      annualYears.length <= 1
        ? `Année ${annualYears[0] ?? 2023} (12 mois)`
        : `${annualYears[0]} — ${annualYears[annualYears.length - 1]} (${annualYears.length * 12} mois)`;

    const totalEnc = n(kpi?.totalCredit);
    const totalDec = n(kpi?.totalDebit);
    const soldeTreso = n(kpi?.solde, totalEnc - totalDec);
    const totalBudgetCredit = n(kpi?.totalBudgetCredit, n(kpi?.totalBudget));
    const totalBudgetDebit = n(kpi?.totalBudgetDebit);
    const soldeBudget = n(kpi?.soldeBudget, totalBudgetCredit - totalBudgetDebit);
    const executionRate =
      kpi?.executionRate != null
        ? n(kpi.executionRate)
        : totalBudgetCredit > 0
          ? (totalBudgetDebit / totalBudgetCredit) * 100
          : 0;
    const ecartBudget = n(kpi?.ecartBudget, soldeBudget);
    const diagnosticGlobal = String(kpi?.decision ?? "Bonne situation");
    const evolutionCredit = n(kpi?.evolutionCredit);

    const nbMonths = Math.max(12, annual.length * 12 || 12);
    const avgMonthlyEnc = totalEnc / nbMonths;
    const avgMonthlyDec = totalDec / nbMonths;
    const coverageMonths = avgMonthlyDec > 0 ? soldeTreso / avgMonthlyDec : 0;

    const riskLevel = analysisData.riskLevel;
    const volatilityPct = analysisData.volatilityCoefficient != null ? analysisData.volatilityCoefficient * 100 : null;
    const anomalies = Array.isArray(analysisData.anomalies) ? analysisData.anomalies : [];
    const criticalCount = n(analysisData.criticalCount, 0);
    const peakMonth = analysisData.peakMonth;
    const troughMonth = analysisData.troughMonth;

    const soldeOptimiste = totalEnc - totalDec * 0.9;
    const soldeNeutre = soldeTreso;
    const soldePessimiste = totalEnc - totalDec * 1.1;

    // PAGE 1 — GARDE
    drawHeaderFooter(1);

    if (logoDataUrl) {
      const w = 55;
      const h = 55;
      doc.addImage(logoDataUrl, "JPEG", pageWidth / 2 - w / 2, 38, w, h);
    }

    doc.setTextColor(10, 38, 71);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Rapport Financier", pageWidth / 2, 110, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text("Pilotage du Budget & de la Trésorerie", pageWidth / 2, 118, { align: "center" });

    autoTable(doc, {
      startY: 135,
      margin: { left: pageWidth / 2 - 60 },
      tableWidth: 120,
      body: [
        ["Organisation", organisation],
        ["Département", departement],
        ["Période couverte", periode],
        ["Date d'édition", editionDateStr],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: [248, 250, 252], textColor: [0, 0, 0], cellWidth: 40 },
        1: { cellWidth: 80 },
      },
    });

    // PAGE 2 — Synthèse/KPI/Analyse détaillée
    doc.addPage();
    drawHeaderFooter(2);

    let y = 28;
    sectionTitle("1. Synthèse exécutive", y);
    y += 7;
    y = writeParagraph(
      `Sur la période ${periode}, la trésorerie de la CGEM reste globalement positive. Les encaissements atteignent ${fmtMAD(totalEnc)} alors que les décaissements s'élèvent à ${fmtMAD(totalDec)}. Le solde final de trésorerie ressort ainsi à ${fmtMAD(soldeTreso)}. Cela signifie que les ressources encaissées couvrent les sorties observées sur la période, avec un niveau de situation évalué à : ${diagnosticGlobal}.`,
      y,
      pageWidth - 2 * marginX,
    );
    y += 5;
    y = writeParagraph(
      `Sur le plan budgétaire, les recettes prévues représentent ${fmtMAD(totalBudgetCredit)} contre ${fmtMAD(totalBudgetDebit)} de dépenses budgétaires. Le solde budgétaire ressort à ${fmtMAD(soldeBudget)} avec un taux d'exécution de ${Math.round(executionRate)}%. En lecture simple, plus ce taux se rapproche de 100%, plus le budget consommé se rapproche du niveau prévu.`,
      y,
      pageWidth - 2 * marginX,
    );

    y += 6;
    sectionTitle("2. Indicateurs clés (KPI)", y);
    y += 4;

    autoTable(doc, {
      startY: y + 2,
      margin: { left: marginX, right: marginX },
      head: [["Indicateur", "Valeur", "Commentaire"]],
      body: [
        ["Total encaissements", fmtMAD(totalEnc), "Crédits cumulés sur 36 mois"],
        ["Total décaissements", fmtMAD(totalDec), "Débits cumulés sur 36 mois"],
        ["Solde de trésorerie", fmtMAD(soldeTreso), "Excédent disponible"],
        ["Solde budgétaire", fmtMAD(soldeBudget), "Recettes budgétaires - dépenses budgétaires"],
        ["Total recettes budgétaires", fmtMAD(totalBudgetCredit), "Budget des recettes"],
        ["Total dépenses budgétaires", fmtMAD(totalBudgetDebit), "Budget des dépenses"],
        ["Taux d'exécution budget", `${Math.round(executionRate)}%`, "Dépenses / Recettes budgétaires"],
      ],
      theme: "grid",
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8.7, cellPadding: 2.4, lineColor: [226, 232, 240] },
    });

    y = getLastTableY(y + 2) + 10;
    sectionTitle("3. Analyse détaillée", y);
    y += 7;
    const evolText =
      evolutionCredit !== 0
        ? `${evolutionCredit > 0 ? "+" : ""}${Math.round(evolutionCredit)}%`
        : "+0%";
    y = writeParagraph(
      `L’analyse mensuelle révèle une saisonnalité marquée, avec des pics au quatrième trimestre et un creux estival. Les encaissements progressent globalement avec une croissance de l’ordre de ${evolText} sur la période. Plusieurs anomalies (pics et creux) ont été identifiées et nécessitent un suivi opérationnel.`,
      y,
      pageWidth - 2 * marginX,
    );

    const annualRows =
      annual.length > 0
        ? annual.map((ys) => [
            String(ys.year),
            fmtMAD(ys.totalCredit),
            fmtMAD(ys.totalDebit),
            fmtMAD(ys.solde),
          ])
        : [
            ["2021", "-", "-", "-"],
            ["2022", "-", "-", "-"],
            ["2023", "-", "-", "-"],
          ];

    autoTable(doc, {
      startY: y + 4,
      margin: { left: marginX, right: marginX },
      head: [["Année", "Encaissements", "Décaissements", "Solde"]],
      body: annualRows,
      theme: "grid",
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8.7, cellPadding: 2.4, lineColor: [226, 232, 240] },
    });

    y = getLastTableY(y + 4) + 10;
    y = ensureSpace(y, 48);
    sectionTitle("3.1 Analyse budgétaire", y);
    y += 7;
    y = writeParagraph(
      `Le budget consolidé ressort à ${fmtMAD(totalBudgetCredit)} de recettes budgétaires pour ${fmtMAD(totalBudgetDebit)} de dépenses budgétaires, soit un solde budgétaire de ${fmtMAD(soldeBudget)}. Le taux d’exécution budgétaire observé sur la période est de ${Math.round(executionRate)}%, ce qui permet d’évaluer le niveau de consommation du budget par rapport aux enveloppes prévues.`,
      y,
      pageWidth - 2 * marginX,
    );

    const annualBudgetRows =
      annual.length > 0
        ? annual.map((ys) => [
            String(ys.year),
            fmtMAD(n(ys.totalBudgetCredit)),
            fmtMAD(n(ys.totalBudgetDebit)),
            fmtMAD(n(ys.soldeBudget)),
          ])
        : [
            ["2021", "-", "-", "-"],
            ["2022", "-", "-", "-"],
            ["2023", "-", "-", "-"],
          ];

    autoTable(doc, {
      startY: y + 4,
      margin: { left: marginX, right: marginX },
      head: [["Année", "Recettes budgétaires", "Dépenses budgétaires", "Solde budgétaire"]],
      body: annualBudgetRows,
      theme: "grid",
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8.7, cellPadding: 2.4, lineColor: [226, 232, 240] },
    });

    // Simulation/ML/Recommandations
    y = getLastTableY(y + 4) + 6;
    y = ensureSpace(y, 90);
    sectionTitle("4. Simulation & scénarios", y);
    y += 5;
    y = writeParagraph(
      "Trois scénarios de variation des dépenses sont projetés pour évaluer la robustesse de la trésorerie face à des chocs budgétaires.",
      y,
      pageWidth - 2 * marginX,
    );

    autoTable(doc, {
      startY: y + 1,
      margin: { left: marginX, right: marginX },
      head: [["Scénario", "Variation dépenses", "Solde projeté", "Recommandation"]],
      body: [
        ["Optimiste", "-10%", fmtMAD(soldeOptimiste), "Investir / Renforcer la réserve"],
        ["Neutre", "0%", fmtMAD(soldeNeutre), "Maintenir la stratégie actuelle"],
        ["Pessimiste", "+10%", fmtMAD(soldePessimiste), "Activer un plan de financement"],
      ],
      theme: "grid",
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8.2, cellPadding: 1.8, lineColor: [226, 232, 240] },
    });

    y = getLastTableY(y + 1) + 6;
    sectionTitle("5. Prévision ML — Horizon 12 mois", y);
    y += 5;
    const tendance = forecastData.tendance ? String(forecastData.tendance) : "stable";
    const tendanceLabel =
      tendance === "hausse" ? "haussière" : tendance === "baisse" ? "baissière" : "stable";
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["KPI prévision", "Valeur", "Explication"]],
      body: [
        ["Tendance projetée", tendanceLabel, "Indique si les flux devraient monter, baisser ou rester proches du niveau actuel."],
        ["Dernier flux observé", fmtMAD(n(forecastData.lastActualFlux)), "Dernière valeur réelle connue, utilisée comme point de départ."],
        ["Flux moyen prévisionnel", fmtMAD(n(forecastData.forecastAvgFlux)), "Niveau moyen attendu sur les prochains mois."],
        ["Variation attendue", pct(n(forecastData.forecastTrendPct), 1), "Ecart estimé par rapport au niveau récent."],
        [
          "Qualité du modèle",
          String(forecastData.metrics?.modelQuality ?? "-"),
          "Mesure simple de la performance globale du modèle.",
        ],
        [
          "Confiance du modèle",
          String(forecastData.metrics?.confidenceLevel ?? "-"),
          "Indique le niveau de fiabilité de la projection.",
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8.1, cellPadding: 1.8, lineColor: [226, 232, 240] },
    });
    y = getLastTableY(y) + 5;
    y = writeParagraph(
      `La prévision indique une tendance ${tendanceLabel} sur les 12 prochains mois. Concrètement, cela veut dire que le niveau de flux futur devrait rester dans la meme direction générale que celle observée récemment. Cette lecture ne remplace pas le suivi mensuel réel, mais elle aide à anticiper les tensions de trésorerie, à préparer les besoins de financement et à mieux ajuster les décisions budgétaires.`,
      y,
      pageWidth - 2 * marginX,
    );

    y = ensureSpace(y + 2, 18);
    sectionTitle("6. Recommandations stratégiques", y);
    y += 5;

    const recs: Array<[string, string]> = [
      [
        "Réserve de précaution",
        "Conserver une réserve de sécurité équivalente à environ 2 mois de décaissements moyens. Cette marge permet de faire face plus facilement à un retard d'encaissement ou à une dépense imprévue.",
      ],
      [
        "Suivi budgétaire",
        "Faire un point chaque mois sur les postes qui s'écartent du budget prévu. Si un poste dépasse environ 5%, il faut vérifier rapidement la cause et décider s'il faut corriger.",
      ],
      [
        "Optimisation",
        "Revoir en priorité les postes les plus instables ou les plus coûteux. L'objectif est de réduire les charges évitables et de mieux sécuriser les sorties de trésorerie.",
      ],
      [
        "Pilotage",
        "Utiliser régulièrement le tableau de bord pour suivre les flux, les alertes et les écarts. Plus le suivi est fréquent, plus la décision devient rapide et fiable.",
      ],
    ];

    doc.setFontSize(9);
    for (const [label, desc] of recs) {
      if (y > pageHeight - 24) {
        doc.addPage();
        drawHeaderFooter(doc.getNumberOfPages());
        y = 24;
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text("•", marginX, y);
      const labelX = marginX + 4;
      doc.setFont("helvetica", "bold");
      doc.text(`${label} :`, labelX, y);
      const labelW = doc.getTextWidth(`${label} :`);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(desc, pageWidth - marginX * 2 - 4 - labelW - 2);
      doc.text(wrapped, labelX + labelW + 2, y);
      y += Math.max(1, wrapped.length) * 4.3 + 1;
    }

    const filename = "Rapport_Financier_CGEM.pdf";
    const blob = doc.output("blob");
    return { blob, filename };
  } catch (error) {
    console.error("Erreur lors de la génération du PDF:", error);
    throw error;
  }
}
