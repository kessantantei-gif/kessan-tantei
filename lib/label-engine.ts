export type FinancialLabel = {
  title: string;
  tone: "good" | "watch" | "danger" | "neutral";
};

export function generateLabels(data: {
  score: number;
  dangerScore: number;
  riskLevel: string;
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  flags?: { title: string }[];
}): FinancialLabel[] {
  const labels: FinancialLabel[] = [];

  if (data.dangerScore >= 80 || data.riskLevel === "REJECT") {
    labels.push({ title: "重大リスク", tone: "danger" });
  } else if (data.dangerScore >= 45) {
    labels.push({ title: "要注意", tone: "watch" });
  }

  if (data.operatingIncome > 0) {
    labels.push({ title: "営業黒字", tone: "good" });
  } else {
    labels.push({ title: "営業赤字", tone: "watch" });
  }

  if (data.operatingCF > 0) {
    labels.push({ title: "営業CFプラス", tone: "good" });
  } else {
    labels.push({ title: "営業CFマイナス", tone: "watch" });
  }

  if (data.flags?.some((f) => f.title.includes("継続企業"))) {
    labels.push({ title: "継続企業注記", tone: "danger" });
  }

  if (data.flags?.some((f) => f.title.includes("MSワラント"))) {
    labels.push({ title: "MSワラント注意", tone: "danger" });
  }

  if (data.flags?.some((f) => f.title.includes("CB"))) {
    labels.push({ title: "CB注意", tone: "watch" });
  }

  if (data.flags?.some((f) => f.title.includes("増資"))) {
    labels.push({ title: "増資注意", tone: "watch" });
  }

  const unique = new Map<string, FinancialLabel>();

  for (const label of labels) {
    if (!unique.has(label.title)) {
      unique.set(label.title, label);
    }
  }

  return Array.from(unique.values()).slice(0, 5);
}
