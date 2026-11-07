import type { Metadata } from "next";
import { VerifyLanding } from "@/components/site/verify-page";

export const metadata: Metadata = { title: "Verify certificate" };
export default function Page() {
  return <VerifyLanding />;
}
