import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/admin";

export const metadata: Metadata = { title: "Operations (demo)" };
export default function Page() {
  return <AdminPanel />;
}
