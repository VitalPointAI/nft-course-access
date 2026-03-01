'use client';

import React from 'react';
import { useNFTAccess } from '../hooks/useNFTAccess';
import type { AccessGateProps } from '../../types';

/**
 * Token gate component that wraps protected content
 * Shows fallback (purchase prompt) when user doesn't have access
 * 
 * Usage:
 * ```tsx
 * <AccessGate 
 *   courseId="ironclaw-foundation"
 *   fallback={<PurchaseWidget packageId="pkg-1" />}
 *   loading={<Spinner />}
 * >
 *   <ProtectedCourseContent />
 * </AccessGate>
 * ```
 */
export function AccessGate({ 
  courseId, 
  fallback, 
  loading,
  children 
}: AccessGateProps) {
  const { hasAccess, isLoading, error } = useNFTAccess(courseId);

  if (isLoading) {
    return loading ? <>{loading}</> : (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p>Failed to verify access. Please try again.</p>
      </div>
    );
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
