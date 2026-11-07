import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterPage } from "@/components/site/auth-pages";

export const metadata: Metadata = { title: "Create account" };
export default function Page() {
  return (
    <Suspense>
      <RegisterPage />
    </Suspense>
  );
}
