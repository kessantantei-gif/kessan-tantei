type SignalInput = {
  score: number;
  dangerScore: number;
  operatingCF: number;
  operatingIncome: number;
  flags?: { title: string }[];
};

export function generateSignal(data: SignalInput) {
  const reasons: string[] = [];

  if (data.operatingCF < 0) {
    reasons.push("営業CFがマイナス");
  }

  if (data.operatingIncome < 0) {
    reasons.push("営業利益が赤字");
  }

  if (data.flags?.some((f) => f.title.includes("MSワラント"))) {
    reasons.push("MSワラントあり");
  }

  if (data.flags?.some((f) => f.title.includes("継続企業"))) {
    reasons.push("継続企業注記");
  }

  if (data.score >= 90 && data.dangerScore <= 20) {
    return {
      signal: "STRONG BUY WATCH",
      color: "green",
      reasons:
        reasons.length > 0 ? reasons : ["成長性・安全性ともに非常に高い"],
    };
  }

  if (data.score >= 75 && data.dangerScore <= 35) {
    return {
      signal: "WATCH",
      color: "cyan",
      reasons:
        reasons.length > 0 ? reasons : ["高品質グロース候補"],
    };
  }

  if (data.dangerScore >= 70) {
    return {
      signal: "AVOID",
      color: "red",
      reasons:
        reasons.length > 0 ? reasons : ["高リスク"],
    };
  }

  return {
    signal: "NEUTRAL",
    color: "yellow",
    reasons:
      reasons.length > 0 ? reasons : ["追加分析推奨"],
  };
}