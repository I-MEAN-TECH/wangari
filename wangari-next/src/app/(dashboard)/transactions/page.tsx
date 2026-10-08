"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TransactionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/finances");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" />
    </div>
  );
}
