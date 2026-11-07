import type { Metadata } from "next";
import { ScalingPage } from "@/components/site/info-pages";

export const metadata: Metadata = { title: "Scaling" };
export default function Page() {
  return <ScalingPage />;
}
