import type { Metadata } from "next";
import { HelpPage } from "@/components/site/info-pages";

export const metadata: Metadata = { title: "Help center" };
export default function Page() {
  return <HelpPage />;
}
