import type { Metadata } from "next";
import { AboutPage } from "@/components/site/info-pages";

export const metadata: Metadata = { title: "About" };
export default function Page() {
  return <AboutPage />;
}
