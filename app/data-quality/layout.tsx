import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/data-quality",
  },
};

export default function DataQualityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
