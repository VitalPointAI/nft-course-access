'use client';

import { useState, useCallback } from 'react';
import { useCourseAccess } from '../context/CourseAccessProvider';
import type { PurchaseState, IntentsQuote, CoursePackage } from '../../types';

interface UsePurchaseOptions {
  packageId: string;
  onSuccess?: (tokenId: string) => void;
  onError?: (error: Error) => void;
}

interface UsePurchaseResult extends PurchaseState {
  package: CoursePackage | null;
  getQuote: (sourceChain: string, sourceToken: string) => Promise<IntentsQuote | null>;
  purchaseWithIntents: (quote: IntentsQuote) => Promise<void>;
  purchaseWithStripe: () => Promise<void>;
  reset: () => void;
}

/**
 * Hook to handle the purchase flow
 * 
 * Usage:
 * ```tsx
 * const { 
 *   package: pkg,
 *   quote,
 *   status,
 *   getQuote,
 *   purchaseWithIntents,
 *   purchaseWithStripe
 * } = usePurchase({ 
 *   packageId: 'pkg-1',
 *   onSuccess: (tokenId) => router.push('/course')
 * });
 * 
 * // Get quote for cross-chain payment
 * const q = await getQuote('ethereum', 'USDC');
 * 
 * // Complete purchase
 * await purchaseWithIntents(q);
 * ```
 */
export function usePurchase(options: UsePurchaseOptions): UsePurchaseResult {
  const { config, accountId, connect, getPackage } = useCourseAccess();
  const [pkg, setPkg] = useState<CoursePackage | null>(null);
  const [state, setState] = useState<PurchaseState>({
    status: 'idle',
    quote: null,
    error: null,
    txHash: null,
    tokenId: null,
  });

  // Load package on mount
  useState(() => {
    getPackage(options.packageId).then(setPkg);
  });

  const getQuote = useCallback(async (
    sourceChain: string,
    sourceToken: string
  ): Promise<IntentsQuote | null> => {
    if (!pkg) return null;

    setState(prev => ({ ...prev, status: 'quoting', error: null }));

    try {
      // Call quote API
      const response = await fetch('/api/intents/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChain,
          sourceToken,
          amountUsdc: pkg.priceUsdc,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get quote');
      }

      const quote = await response.json() as IntentsQuote;
      setState(prev => ({ ...prev, status: 'idle', quote }));
      return quote;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Quote failed');
      setState(prev => ({ ...prev, status: 'error', error: err }));
      options.onError?.(err);
      return null;
    }
  }, [pkg, options]);

  const purchaseWithIntents = useCallback(async (quote: IntentsQuote) => {
    if (!accountId) {
      setState(prev => ({ ...prev, status: 'connecting' }));
      await connect();
      return;
    }

    setState(prev => ({ ...prev, status: 'approving', quote }));

    try {
      // Create the intent transaction
      const response = await fetch('/api/intents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: options.packageId,
          recipient: accountId,
          quote,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create intent');
      }

      const { intentId, transaction } = await response.json();

      setState(prev => ({ ...prev, status: 'signing' }));

      // User signs transaction via wallet
      // This would integrate with NEAR Wallet Selector
      // For now, we'll simulate
      const txHash = await signTransaction(transaction);

      setState(prev => ({ ...prev, status: 'confirming', txHash }));

      // Poll for completion
      const tokenId = await pollForCompletion(intentId);

      setState(prev => ({ 
        ...prev, 
        status: 'success', 
        tokenId 
      }));

      options.onSuccess?.(tokenId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Purchase failed');
      setState(prev => ({ ...prev, status: 'error', error: err }));
      options.onError?.(err);
    }
  }, [accountId, connect, options]);

  const purchaseWithStripe = useCallback(async () => {
    if (!pkg) return;

    setState(prev => ({ ...prev, status: 'connecting' }));

    try {
      // Ensure user has NEAR account (for NFT delivery)
      if (!accountId) {
        await connect();
        return;
      }

      // Create Stripe checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: options.packageId,
          nearAccountId: accountId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout');
      }

      const { checkoutUrl } = await response.json();

      // Redirect to Stripe
      window.location.href = checkoutUrl;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Checkout failed');
      setState(prev => ({ ...prev, status: 'error', error: err }));
      options.onError?.(err);
    }
  }, [accountId, connect, pkg, options]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      quote: null,
      error: null,
      txHash: null,
      tokenId: null,
    });
  }, []);

  return {
    ...state,
    package: pkg,
    getQuote,
    purchaseWithIntents,
    purchaseWithStripe,
    reset,
  };
}

// Helper functions (would integrate with NEAR Wallet Selector)
async function signTransaction(transaction: any): Promise<string> {
  // In production, use @near-wallet-selector
  throw new Error('Wallet integration required');
}

async function pollForCompletion(intentId: string): Promise<string> {
  // Poll the backend for intent completion
  for (let i = 0; i < 60; i++) {
    const response = await fetch(`/api/intents/status/${intentId}`);
    const data = await response.json();
    
    if (data.status === 'completed') {
      return data.tokenId;
    }
    
    if (data.status === 'failed') {
      throw new Error(data.error || 'Intent failed');
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  throw new Error('Timeout waiting for completion');
}
