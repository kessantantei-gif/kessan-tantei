import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/disclaimer",
  },
};

export default function DisclaimerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
