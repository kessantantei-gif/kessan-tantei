type CommentaryMetrics = {
  revenueGrowth: number;
  operatingMargin: number;
  ocfMargin: number;
};

export function generateDetectiveComment(metrics: CommentaryMetrics) {
  const comments: string[] = [];

  // 成長性
  if (metrics.revenueGrowth >= 30) {
    comments.push("売上成長は非常に良好で、高い市場成長を享受できている。");
  } else if (metrics.revenueGrowth >= 15) {
    comments.push("売上は堅調に成長している。");
  } else {
    comments.push("売上成長はやや鈍化傾向にある。");
  }

  // 収益性
  if (metrics.operatingMargin < 0) {
    if (metrics.operatingMargin <= -15) {
      comments.push("営業赤字は大きく、収益構造の改善余地が大きい。");
    } else {
      comments.push("営業赤字は残るものの、許容範囲内と見られる。");
    }
  } else {
    comments.push("営業黒字を確保しており、収益性は良好。");
  }

  // キャッシュ
  if (metrics.ocfMargin > 0) {
    comments.push(
      "少なくともOCFは黒字であり、資金繰り面の短期懸念は限定的。"
    );
  } else {
    comments.push(
      "OCFがマイナスであり、資金調達依存度の上昇に注意したい。"
    );
  }

  // 会計士視点
  if (
    metrics.revenueGrowth >= 20 &&
    metrics.operatingMargin < 0 &&
    metrics.ocfMargin > 0
  ) {
    comments.push(
      "成長投資先行型の健全赤字モデルの可能性があり、研究開発費や人材投資の内訳確認が重要。"
    );
  }

  return comments.join("");
}