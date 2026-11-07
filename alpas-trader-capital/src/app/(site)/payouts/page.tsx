import type { Metadata } from "next";
import { PayoutPolicyPage } from "@/components/site/info-pages";

export const metadata: Metadata = { title: "Payout policy" };
export default function Page() {
  return <PayoutPolicyPage />;
}
