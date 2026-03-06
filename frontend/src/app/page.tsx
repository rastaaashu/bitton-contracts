"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Suspense } from "react";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const ref = searchParams.get("ref");

    if (isAuthenticated) {
      router.replace("/dashboard");
    } else if (ref) {
      // Preserve referral code when redirecting to register
      router.replace(`/register?ref=${encodeURIComponent(ref)}`);
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  return null;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
