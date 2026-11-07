import type { Metadata } from "next";
import { ContactPage } from "@/components/site/info-pages";

export const metadata: Metadata = { title: "Contact" };
export default function Page() {
  return <ContactPage />;
}
