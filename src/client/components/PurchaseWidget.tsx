'use client';

import React, { useState, useEffect } from 'react';
import { usePurchase } from '../hooks/usePurchase';
import { useCourseAccess } from '../context/CourseAccessProvider';
import type { PurchaseWidgetProps, IntentsQuote } from '../../types';

const CHAINS = [
  { id: 'near', name: 'NEAR', icon: '◈' },
  { id: 'ethereum', name: 'Ethereum', icon: '⟠' },
  { id: 'polygon', name: 'Polygon', icon: '⬡' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '△' },
  { id: 'base', name: 'Base', icon: '◯' },
];

const TOKENS: Record<string, { symbol: string; name: string }[]> = {
  near: [
    { symbol: 'NEAR', name: 'NEAR' },
    { symbol: 'USDC', name: 'USD Coin' },
  ],
  ethereum: [
    { symbol: 'ETH', name: 'Ether' },
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'USDT', name: 'Tether' },
  ],
  polygon: [
    { symbol: 'MATIC', name: 'Polygon' },
    { symbol: 'USDC', name: 'USD Coin' },
  ],
  arbitrum: [
    { symbol: 'ETH', name: 'Ether' },
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'ARB', name: 'Arbitrum' },
  ],
  base: [
    { symbol: 'ETH', name: 'Ether' },
    { symbol: 'USDC', name: 'USD Coin' },
  ],
};

/**
 * Purchase widget with chain/token selection and Stripe fallback
 * 
 * Usage:
 * ```tsx
 * <PurchaseWidget
 *   packageId="pkg-ironclaw-foundation"
 *   onSuccess={(tokenId) => router.push('/course')}
 *   showStripe={true}
 *   stripeKey={process.env.NEXT_PUBLIC_STRIPE_KEY}
 * />
 * ```
 */
export function PurchaseWidget({
  packageId,
  onSuccess,
  onError,
  theme = 'dark',
  showStripe = true,
  className = '',
}: PurchaseWidgetProps) {
  const { isConnected, accountId, connect } = useCourseAccess();
  const {
    package: pkg,
    quote,
    status,
    error,
    getQuote,
    purchaseWithIntents,
    purchaseWithStripe,
    reset,
  } = usePurchase({ packageId, onSuccess, onError });

  const [selectedChain, setSelectedChain] = useState('near');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [currentQuote, setCurrentQuote] = useState<IntentsQuote | null>(null);

  // Get quote when chain/token changes
  useEffect(() => {
    if (pkg && selectedChain && selectedToken) {
      getQuote(selectedChain, selectedToken).then(setCurrentQuote);
    }
  }, [selectedChain, selectedToken, pkg, getQuote]);

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-900' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-gray-900';
  const borderClass = isDark ? 'border-slate-700' : 'border-gray-200';
  const inputBgClass = isDark ? 'bg-slate-800' : 'bg-gray-50';

  if (!pkg) {
    return (
      <div className={`${bgClass} ${textClass} rounded-2xl p-6 ${className}`}>
        <div className="animate-pulse">
          <div className={`h-6 ${isDark ? 'bg-slate-700' : 'bg-gray-200'} rounded w-3/4 mb-4`} />
          <div className={`h-4 ${isDark ? 'bg-slate-700' : 'bg-gray-200'} rounded w-1/2`} />
        </div>
      </div>
    );
  }

  const priceUsd = parseInt(pkg.priceUsdc) / 1_000_000;

  return (
    <div className={`${bgClass} ${textClass} rounded-2xl border ${borderClass} p-6 ${className}`}>
      {/* Package Info */}
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-2">{pkg.name}</h3>
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
          {pkg.description}
        </p>
        <div className="text-3xl font-bold text-green-500">
          ${priceUsd.toFixed(2)} <span className="text-sm font-normal">USD</span>
        </div>
      </div>

      {/* Status Messages */}
      {status === 'success' && (
        <div className="mb-4 p-4 bg-green-500/20 border border-green-500/40 rounded-lg text-green-400">
          🎉 Purchase complete! Your access pass has been minted.
        </div>
      )}
      
      {status === 'error' && error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400">
          {error.message}
          <button 
            onClick={reset}
            className="ml-2 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {status !== 'success' && (
        <>
          {/* Crypto Payment */}
          <div className="mb-6">
            <h4 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Pay with Crypto
            </h4>

            {/* Chain Selector */}
            <div className="mb-3">
              <label className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'} mb-1 block`}>
                Select Chain
              </label>
              <div className="flex gap-2 flex-wrap">
                {CHAINS.map(chain => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      setSelectedChain(chain.id);
                      setSelectedToken(TOKENS[chain.id][0].symbol);
                    }}
                    className={`px-3 py-2 rounded-lg text-sm transition ${
                      selectedChain === chain.id
                        ? 'bg-blue-600 text-white'
                        : `${inputBgClass} ${textClass} hover:bg-opacity-80`
                    }`}
                  >
                    {chain.icon} {chain.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Token Selector */}
            <div className="mb-4">
              <label className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'} mb-1 block`}>
                Pay With
              </label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg ${inputBgClass} border ${borderClass} ${textClass} focus:outline-none focus:border-blue-500`}
              >
                {TOKENS[selectedChain]?.map(token => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quote Display */}
            {currentQuote && (
              <div className={`p-3 rounded-lg ${inputBgClass} mb-4`}>
                <div className="flex justify-between text-sm">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>You pay:</span>
                  <span className="font-semibold">
                    {currentQuote.sourceAmount} {selectedToken}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Est. time:</span>
                  <span>{currentQuote.estimatedTime}s</span>
                </div>
              </div>
            )}

            {/* Purchase Button */}
            <button
              onClick={() => {
                if (!isConnected) {
                  connect();
                } else if (currentQuote) {
                  purchaseWithIntents(currentQuote);
                }
              }}
              disabled={status === 'confirming' || status === 'signing' || status === 'quoting'}
              className={`w-full py-4 rounded-xl font-semibold transition ${
                status === 'confirming' || status === 'signing'
                  ? 'bg-blue-600/50 cursor-wait'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
              } text-white`}
            >
              {!isConnected ? (
                'Connect Wallet'
              ) : status === 'quoting' ? (
                'Getting quote...'
              ) : status === 'approving' ? (
                'Approve in wallet...'
              ) : status === 'signing' ? (
                'Sign transaction...'
              ) : status === 'confirming' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Confirming...
                </span>
              ) : currentQuote ? (
                `Pay ${currentQuote.sourceAmount} ${selectedToken}`
              ) : (
                'Select payment method'
              )}
            </button>
          </div>

          {/* Divider */}
          {showStripe && (
            <div className="relative mb-6">
              <div className={`absolute inset-0 flex items-center`}>
                <div className={`w-full border-t ${borderClass}`} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className={`px-2 ${bgClass} ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                  or
                </span>
              </div>
            </div>
          )}

          {/* Stripe Payment */}
          {showStripe && (
            <button
              onClick={purchaseWithStripe}
              disabled={status !== 'idle'}
              className={`w-full py-4 rounded-xl font-semibold transition border ${borderClass} ${textClass} hover:bg-opacity-10 ${isDark ? 'hover:bg-white' : 'hover:bg-gray-900'}`}
            >
              💳 Pay with Card
            </button>
          )}
        </>
      )}

      {/* Footer */}
      <p className={`text-xs text-center mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Powered by NEAR Intents • Secure cross-chain payments
      </p>
    </div>
  );
}
