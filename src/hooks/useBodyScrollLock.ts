import { useEffect } from 'react';

export const useBodyScrollLock = (isLocked: boolean) => {
  useEffect(() => {
    if (isLocked) {
      // Store original values
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyTop = document.body.style.top;
      const originalBodyWidth = document.body.style.width;
      
      // Get current scroll position
      const scrollY = window.scrollY;
      
      // Apply stronger scroll lock
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      // Lock only the page. Dialog content must retain native wheel/touch
      // scrolling; cancelling document-wide events makes long editors unusable.
      
      return () => {
        // Restore original styles
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        
        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [isLocked]);
};
