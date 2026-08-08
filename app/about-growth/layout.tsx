import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/about-growth",
  },
};

export default function AboutGrowthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
