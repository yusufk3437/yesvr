import type { Metadata } from "next";
import { Suspense } from "react";
import { RulesPage } from "@/components/site/rules-page";

export const metadata: Metadata = { title: "Trading rules" };
export default function Page() {
  return (
    <Suspense>
      <RulesPage />
    </Suspense>
  );
}
