"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stopAllAudio } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";

export default function AudioStopper() {
  const pathname = usePathname();
  const stopStoreAudio = useAudioStore((state) => state.stop);

  useEffect(() => {
    stopStoreAudio();
    stopAllAudio();

    return () => {
      stopStoreAudio();
      stopAllAudio();
    };
  }, [pathname, stopStoreAudio]);

  return null;
}