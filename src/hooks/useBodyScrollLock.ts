import { useEffect } from 'react';
import { lockDocumentScroll } from '@/lib/documentScrollLock';

export const useBodyScrollLock = (isLocked: boolean) => {
  useEffect(() => {
    if (isLocked) return lockDocumentScroll();
  }, [isLocked]);
};
