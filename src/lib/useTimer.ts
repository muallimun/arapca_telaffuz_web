import { useState, useEffect, useRef } from "react";
import { playTickSound } from "./sound";

export function useCountdown(timeLimit: number | null, onTimeout: () => void, isActive: boolean) {
  const [timeLeft, setTimeLeft] = useState<number | null>(timeLimit);
  const timeUpCalled = useRef(false);

  // Oyun başladığında veya süre limiti değiştiğinde sayacı sıfırla
  useEffect(() => {
    setTimeLeft(timeLimit);
    timeUpCalled.current = false;
  }, [timeLimit, isActive]);

  useEffect(() => {
    if (timeLimit === null || !isActive || timeLeft === null) return;

    if (timeLeft <= 0) {
      if (!timeUpCalled.current) {
        onTimeout();
        timeUpCalled.current = true;
      }
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
      
      // Son 3 saniyede (3, 2, 1) ses çal
      if (timeLeft <= 3 && timeLeft > 0) {
        playTickSound(timeLeft === 1);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, timeLimit, isActive, onTimeout]);

  return timeLeft;
}