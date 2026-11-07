import { isPublicHydration } from "@/ui/public-hydration";
import { useState, useEffect } from 'react';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(() => typeof window === "undefined" || isPublicHydration() ? true : navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    // Listen for online/offline events - these are reliable and don't cause false positives
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Only do connection verification when the user actively tries to use the app
    // Remove the periodic checking that was causing false offline detections

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Method to manually check connection (used by retry buttons)
  const checkRealConnection = async (): Promise<boolean> => {
    if (!navigator.onLine) {
      return false;
    }

    try {
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  return { isOnline, wasOffline, checkRealConnection };
};