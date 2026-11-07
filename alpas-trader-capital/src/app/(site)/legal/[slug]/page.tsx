import { notFound } from "next/navigation";
import { LegalPage } from "@/components/site/legal-page";

const SLUGS = ["terms", "privacy", "risk", "refunds"] as const;
type Slug = (typeof SLUGS)[number];

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as Slug)) notFound();
  return <LegalPage slug={slug as Slug} />;
}
