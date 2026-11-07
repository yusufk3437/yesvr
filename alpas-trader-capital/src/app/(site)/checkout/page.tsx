import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutPage } from "@/components/site/checkout-page";

export const metadata: Metadata = { title: "Checkout" };
export default function Page() {
  return (
    <Suspense>
      <CheckoutPage />
    </Suspense>
  );
}
