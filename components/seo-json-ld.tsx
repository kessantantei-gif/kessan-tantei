type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

export default function SeoJsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "決算探偵",
    url: "https://kessan-tantei.jp",
    description: "グロース市場に特化した財務分析ランキング。",
    inLanguage: "ja-JP",
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "決算探偵",
    url: "https://kessan-tantei.jp",
    logo: "https://kessan-tantei.jp/og-image-all-markets.png",
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function rankingJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "グロース市場 財務分析ランキング",
    url: "https://kessan-tantei.jp/ranking",
    description: "グロース市場企業の財務分析ランキングです。",
    inLanguage: "ja-JP",
    isPartOf: {
      "@type": "WebSite",
      name: "決算探偵",
      url: "https://kessan-tantei.jp",
    },
  };
}

export function companyJsonLd({ ticker, name }: { ticker: string; name: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    headline: `${name}（${ticker}）の財務分析`,
    name: `${name}（${ticker}）の財務分析`,
    url: `https://kessan-tantei.jp/company/${ticker}`,
    description: `${name}（${ticker}）の財務スコア、リスク、決算推移を確認できます。`,
    inLanguage: "ja-JP",
    isPartOf: {
      "@type": "WebSite",
      name: "決算探偵",
      url: "https://kessan-tantei.jp",
    },
    publisher: {
      "@type": "Organization",
      name: "決算探偵",
      url: "https://kessan-tantei.jp",
    },
  };
}
