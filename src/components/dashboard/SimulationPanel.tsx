import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { runSimulation } from "@/lib/finance-server";
import { fmtMAD } from "@/lib/format";
import { AlertTriangle, CheckCircle2, XCircle, TrendingDown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type Result = Awaited<ReturnType<typeof runSimulation>>;

export function SimulationPanel({
  baseSolde,
  totalCredit,
  totalDebit,
}: {
  baseSolde: number;
  totalCredit: number;
  totalDebit: number;
}) {
  const [variation, setVariation] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sim = useServerFn(runSimulation);

  const livePreview = result?.newSolde ?? null;

  async function handleRun() {
    setLoading(true);
    try {
      const r = await sim({ data: { variationPct: variation, totalCredit, totalDebit } });
      setResult(r);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const tone =
    result?.decision === "Déficit"
      ? "danger"
      : result?.decision === "Risque"
        ? "warning"
        : "success";

  const Icon = tone === "danger" ? XCircle : tone === "warning" ? AlertTriangle : CheckCircle2;

  return (
    <>
      <Card className="p-6 border-2">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Simulation de scénario</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Faites varier le niveau global des dépenses et mesurez l'impact sur la trésorerie.
        </p>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-baseline mb-3">
              <label className="text-sm font-medium">Variation des dépenses</label>
              <span
                className={`text-2xl font-bold tabular-nums ${
                  variation > 0 ? "text-danger" : variation < 0 ? "text-success" : "text-foreground"
                }`}
              >
                {variation > 0 ? "+" : ""}
                {variation}%
              </span>
            </div>
            <Slider
              value={[variation]}
              min={-30}
              max={50}
              step={1}
              onValueChange={(v) => setVariation(v[0])}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>-30%</span>
              <span>0%</span>
              <span>+50%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Solde actuel</p>
              <p className="text-lg font-bold">{fmtMAD(baseSolde)}</p>
            </div>
            <div
              className={`rounded-lg p-3 ${
                livePreview !== null && livePreview < 0 ? "bg-danger/10" : "bg-success/10"
              }`}
            >
              <p className="text-xs text-muted-foreground">Solde simulé</p>
              <p
                className={`text-lg font-bold ${
                  livePreview !== null && livePreview < 0 ? "text-danger" : "text-success"
                }`}
              >
                {livePreview !== null ? fmtMAD(livePreview) : "—"}
              </p>
            </div>
          </div>

          <Button onClick={handleRun} disabled={loading} className="w-full" size="lg">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Lancer la simulation
          </Button>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          {result && (
            <>
              <DialogHeader>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${
                    tone === "danger"
                      ? "bg-danger/15"
                      : tone === "warning"
                        ? "bg-warning/15"
                        : "bg-success/15"
                  }`}
                >
                  <Icon
                    className={`h-8 w-8 ${
                      tone === "danger"
                        ? "text-danger"
                        : tone === "warning"
                          ? "text-warning"
                          : "text-success"
                    }`}
                  />
                </motion.div>
                <DialogTitle className="text-center text-2xl">
                  {result.decision === "Déficit"
                    ? "⚠️ Risque de déficit"
                    : result.decision === "Risque"
                      ? "Vigilance recommandée"
                      : "Situation stable"}
                </DialogTitle>
                <DialogDescription className="text-center">
                  Variation appliquée : {result.variationPct > 0 ? "+" : ""}
                  {result.variationPct}% sur les dépenses
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Solde initial</p>
                    <p className="font-bold">{fmtMAD(result.baseSolde)}</p>
                  </div>
                  <div
                    className={`rounded-lg border-2 p-3 ${
                      tone === "danger"
                        ? "border-danger/40"
                        : tone === "warning"
                          ? "border-warning/40"
                          : "border-success/40"
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">Nouveau solde</p>
                    <p
                      className={`font-bold ${
                        tone === "danger"
                          ? "text-danger"
                          : tone === "warning"
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {fmtMAD(result.newSolde)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                    Recommandation
                  </p>
                  <p className="text-sm">{result.recommandation}</p>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Impact sur la trésorerie :{" "}
                  <span
                    className={
                      result.impact < 0 ? "text-danger font-semibold" : "text-success font-semibold"
                    }
                  >
                    {result.impact > 0 ? "+" : ""}
                    {fmtMAD(result.impact)}
                  </span>
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
