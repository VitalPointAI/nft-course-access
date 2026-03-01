'use client';

import { useState, useEffect } from 'react';
import { useCourseAccess } from '../context/CourseAccessProvider';

interface UseNFTAccessResult {
  hasAccess: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to check if the current user has access to a course
 * 
 * Usage:
 * ```tsx
 * const { hasAccess, isLoading } = useNFTAccess('ironclaw-foundation');
 * 
 * if (isLoading) return <Spinner />;
 * if (!hasAccess) return <PurchasePrompt />;
 * return <CourseContent />;
 * ```
 */
export function useNFTAccess(courseId: string): UseNFTAccessResult {
  const { accountId, hasAccess: checkAccess } = useCourseAccess();
  const [hasAccessState, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      if (!accountId) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await checkAccess(courseId);
        if (mounted) {
          setHasAccess(result);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Access check failed'));
          setHasAccess(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, [accountId, courseId, checkAccess, refetchTrigger]);

  const refetch = () => setRefetchTrigger(prev => prev + 1);

  return { hasAccess: hasAccessState, isLoading, error, refetch };
}
