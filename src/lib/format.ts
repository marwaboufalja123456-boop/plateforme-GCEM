export function fmtMAD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) {
    return `${(n / 1e9).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Md DH`;
  }
  if (abs >= 1e6) {
    return `${(n / 1e6).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} M DH`;
  }
  if (abs >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} K DH`;
  return `${Math.round(n).toLocaleString("fr-FR")} DH`;
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const labels = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jun",
    "Jul",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  return `${labels[Number(m) - 1]} ${y.slice(2)}`;
}
