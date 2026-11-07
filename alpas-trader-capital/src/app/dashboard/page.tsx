import type { Metadata } from "next";
import { OverviewPage } from "@/components/dashboard/overview";

export const metadata: Metadata = { title: "Dashboard" };
export default function Page() {
  return <OverviewPage />;
}
