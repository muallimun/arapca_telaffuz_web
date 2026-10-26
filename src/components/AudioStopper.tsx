"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stopAllAudio } from "@/lib/audio";

export default function AudioStopper() {
  const pathname = usePathname();

  useEffect(() => {
    // Sayfa değiştiği an (veya ilk yüklendiğinde) çalışır ve tüm sesleri keser
    stopAllAudio();

    // Sayfa kapanırken (unmount) de sesi kes (çifte güvence)
    return () => {
      stopAllAudio();
    };
  }, [pathname]);

  return null;
}