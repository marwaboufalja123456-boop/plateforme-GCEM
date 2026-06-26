import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "primary";
  delay?: number;
};

const toneStyles: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-border",
  success: "border-success/30 bg-success/5",
  danger: "border-danger/30 bg-danger/5",
  warning: "border-warning/30 bg-warning/5",
  primary: "border-primary/30 bg-primary/5",
};

const valueColor: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  primary: "text-primary",
};

export function KpiCard({ label, value, hint, icon, tone = "default", delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className={`p-5 border-2 ${toneStyles[tone]} transition-all hover:shadow-lg`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {icon && <div className={valueColor[tone]}>{icon}</div>}
        </div>
        <p className={`mt-3 text-2xl font-bold tracking-tight ${valueColor[tone]}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </Card>
    </motion.div>
  );
}
