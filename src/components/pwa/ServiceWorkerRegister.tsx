"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Sadece production modunda SW'yi aktif et (geliştirirken sürekli önbellek sorunu yaşamamak için)
      // Test etmek istersen process.env.NODE_ENV kontrolünü kaldırabilirsin.
      if (process.env.NODE_ENV === "production") {
        window.addEventListener("load", () => {
          navigator.serviceWorker
            .register("/sw.js")
            .then((registration) => {
              console.log("SW registered: ", registration);
            })
            .catch((registrationError) => {
              console.log("SW registration failed: ", registrationError);
            });
        });
      }
    }
  }, []);

  return null;
}