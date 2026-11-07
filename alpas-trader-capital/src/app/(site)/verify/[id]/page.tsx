import type { Metadata } from "next";
import { VerifyResult } from "@/components/site/verify-page";

export const metadata: Metadata = { title: "Certificate verification" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { id } = await params;
  const { c } = await searchParams;
  return <VerifyResult id={decodeURIComponent(id)} code={c ?? null} />;
}
