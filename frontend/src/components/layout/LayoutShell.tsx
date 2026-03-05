"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const PUBLIC_ROUTES = ["/login", "/register", "/verify-email"];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname === r + "/"
  );

  if (isPublic) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <ProtectedRoute>{children}</ProtectedRoute>
        </main>
      </div>
    </div>
  );
}
