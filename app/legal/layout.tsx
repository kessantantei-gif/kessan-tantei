import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/legal",
  },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
