"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RegisterRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      // Preserve referral code
      localStorage.setItem("bitton_ref_code", ref);
      router.replace(`/?ref=${encodeURIComponent(ref)}`);
    } else {
      router.replace("/");
    }
  }, [router, searchParams]);
  return null;
}

export default function RegisterRedirect() {
  return (
    <Suspense fallback={null}>
      <RegisterRedirectContent />
    </Suspense>
  );
}
