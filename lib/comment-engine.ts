export function generateComment(data: {
  score: number;
  dangerScore: number;
  riskLevel: string;
  operatingCF: number;
  revenue: number;
  operatingIncome: number;
  flags?: { title: string }[];
}) {
  const comments: string[] = [];

  // 総評
  if (data.score >= 95) {
    comments.push(
      "財務スコアは極めて高水準です。グロース企業として理想的に近い財務構造です。"
    );
  } else if (data.score >= 85) {
    comments.push(
      "財務スコアは非常に優秀です。成長性と安全性のバランスが良好です。"
    );
  } else if (data.score >= 70) {
    comments.push(
      "財務状態は良好ですが、一部モニタリングすべき項目があります。"
    );
  } else if (data.score >= 50) {
    comments.push(
      "成長余地はありますが、財務面に複数の注意点があります。"
    );
  } else {
    comments.push(
      "財務リスクが高く、慎重な分析が必要な状態です。"
    );
  }

  // 売上規模
  if (data.revenue >= 30000000000) {
    comments.push("売上規模は大きく、事業基盤は比較的安定しています。");
  } else if (data.revenue <= 3000000000) {
    comments.push("売上規模はまだ小さく、事業拡大フェーズと考えられます。");
  }

  // 利益 × CF クロス分析
  if (data.operatingIncome > 0 && data.operatingCF > 0) {
    comments.push(
      "営業利益・営業CFともにプラスで、利益の質は高いと評価できます。"
    );
  } else if (data.operatingIncome > 0 && data.operatingCF <= 0) {
    comments.push(
      "営業黒字ですが営業CFがマイナスです。利益が現金創出に結びついていない可能性があります。"
    );
  } else if (data.operatingIncome <= 0 && data.operatingCF > 0) {
    comments.push(
      "営業赤字でも営業CFはプラスです。先行投資型グロースとしては一定の評価余地があります。"
    );
  } else {
    comments.push(
      "営業利益・営業CFともにマイナスで、資金繰りには注意が必要です。"
    );
  }

  // Danger
  if (data.dangerScore >= 70) {
    comments.push(
      "Danger Score が高く、潜在的なレッドフラッグが複数存在します。"
    );
  } else if (data.dangerScore >= 40) {
    comments.push(
      "重大ではないものの、注意すべき財務シグナルがあります。"
    );
  }

  // 個別フラグ
  if (data.flags?.some((f) => f.title.includes("MSワラント"))) {
    comments.push(
      "MSワラントが確認され、将来的な株式希薄化リスクがあります。"
    );
  }

  if (data.flags?.some((f) => f.title.includes("継続企業"))) {
    comments.push(
      "継続企業の前提に関する注記があり、最重要警戒銘柄です。"
    );
  }

  return comments.join(" ");
}