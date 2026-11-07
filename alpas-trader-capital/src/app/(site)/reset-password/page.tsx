import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordPage } from "@/components/site/auth-pages";

export const metadata: Metadata = { title: "Reset password" };
export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}
