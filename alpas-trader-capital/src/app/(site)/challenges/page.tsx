import type { Metadata } from "next";
import { ChallengesPage } from "@/components/site/challenges-page";

export const metadata: Metadata = { title: "Challenges" };
export default function Page() {
  return <ChallengesPage />;
}
