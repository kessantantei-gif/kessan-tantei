import { IndustryType } from "./industry-classifier";

export type AuditFirmType = "big4" | "midSmall" | "unknown";

export type RedFlagInput = {
  industryType: IndustryType;
  goingConcern: boolean;
  msWarrant: boolean;
  convertibleBond: boolean;
  equityFinancing: boolean;
  ocfNegativeStreak: number;
  currentAssets: number;
  currentLiabilities: number;
  equityRatio: number;
  previousAuditorType: AuditFirmType;
  currentAuditorType: AuditFirmType;
};

export function analyzeRedFlags(input: RedFlagInput) {
  const flags: { title: string; scoreImpact: number }[] = [];
  let dangerScore = 0;

  if (input.goingConcern) {
    return {
      dangerScore: 100,
      riskLevel: "REJECT",
      flags: [{ title: "継続企業注記", scoreImpact: 100 }],
    };
  }

  const financeLike = input.industryType === "finance";

  if (!financeLike) {
    if (input.ocfNegativeStreak >= 3) {
      dangerScore += 45;
      flags.push({ title: "営業CF 3期連続マイナス", scoreImpact: 45 });
    } else if (input.ocfNegativeStreak === 2) {
      dangerScore += 25;
      flags.push({ title: "営業CF 2期連続マイナス", scoreImpact: 25 });
    } else if (input.ocfNegativeStreak === 1) {
      dangerScore += 10;
      flags.push({ title: "営業CF 単期マイナス", scoreImpact: 10 });
    }
  } else if (input.ocfNegativeStreak >= 3) {
    dangerScore += 10;
    flags.push({
      title: "金融業: 営業CF 3期マイナス（参考）",
      scoreImpact: 10,
    });
  }

  if (
    input.currentAssets > 0 &&
    input.currentLiabilities > 0 &&
    input.currentAssets < input.currentLiabilities
  ) {
    dangerScore += 20;
    flags.push({ title: "流動資産 < 流動負債", scoreImpact: 20 });
  }

  if (input.equityRatio > 0 && input.equityRatio < 30) {
    dangerScore += 15;
    flags.push({ title: "自己資本比率30%未満", scoreImpact: 15 });
  }

  if (
    input.previousAuditorType === "big4" &&
    input.currentAuditorType === "midSmall"
  ) {
    dangerScore += 50;
    flags.push({ title: "Big4→中小監査法人", scoreImpact: 50 });
  } else if (
    input.previousAuditorType === "midSmall" &&
    input.currentAuditorType === "midSmall"
  ) {
    dangerScore += 25;
    flags.push({ title: "中小→中小監査法人", scoreImpact: 25 });
  }

  if (input.msWarrant) {
    dangerScore += 40;
    flags.push({ title: "MSワラント", scoreImpact: 40 });
  }

  if (input.convertibleBond) {
    dangerScore += 35;
    flags.push({ title: "CB", scoreImpact: 35 });
  }

  if (input.equityFinancing) {
    dangerScore += 25;
    flags.push({ title: "危険な増資・第三者割当", scoreImpact: 25 });
  }

  const normalizedDangerScore = Math.min(dangerScore, 100);

  let riskLevel = "SAFE";
  if (normalizedDangerScore >= 70) riskLevel = "DANGEROUS";
  else if (normalizedDangerScore >= 45) riskLevel = "WARNING";
  else if (normalizedDangerScore >= 20) riskLevel = "WATCH";

  return {
    dangerScore: normalizedDangerScore,
    riskLevel,
    flags,
  };
}