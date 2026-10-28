"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stopAllAudio } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";

export default function AudioStopper() {
  const pathname = usePathname();
  const stopStoreAudio = useAudioStore((state) => state.stop);
  const clearShadowingTimer = useAudioStore((state) => state.clearShadowingTimer);

  useEffect(() => {
    clearShadowingTimer();
    stopStoreAudio();
    stopAllAudio();

    return () => {
      clearShadowingTimer();
      stopStoreAudio();
      stopAllAudio();
    };
  }, [pathname, stopStoreAudio, clearShadowingTimer]);

  return null;
}