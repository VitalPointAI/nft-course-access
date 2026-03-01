'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { CourseAccessConfig, CoursePackage, AccessPass } from '../../types';

interface CourseAccessContextValue {
  config: CourseAccessConfig;
  isConnected: boolean;
  accountId: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  hasAccess: (courseId: string) => Promise<boolean>;
  getUserPasses: () => Promise<AccessPass[]>;
  getPackage: (packageId: string) => Promise<CoursePackage | null>;
}

const CourseAccessContext = createContext<CourseAccessContextValue | null>(null);

export function useCourseAccess() {
  const context = useContext(CourseAccessContext);
  if (!context) {
    throw new Error('useCourseAccess must be used within CourseAccessProvider');
  }
  return context;
}

interface Props {
  children: React.ReactNode;
  config: CourseAccessConfig;
}

export function CourseAccessProvider({ children, config }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accessCache, setAccessCache] = useState<Map<string, boolean>>(new Map());

  // Check for existing wallet connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      // Check localStorage for saved account
      const savedAccount = localStorage.getItem('near_account_id');
      if (savedAccount) {
        setAccountId(savedAccount);
        setIsConnected(true);
      }
    };
    checkConnection();
  }, []);

  const connect = useCallback(async () => {
    // For now, use a simple NEAR wallet connection
    // In production, integrate with @near-wallet-selector
    try {
      // Redirect to NEAR wallet for login
      const callbackUrl = window.location.href;
      const walletUrl = config.networkId === 'testnet'
        ? 'https://testnet.mynearwallet.com'
        : 'https://app.mynearwallet.com';
      
      window.location.href = `${walletUrl}/login/?referrer=${encodeURIComponent(config.walletSelector?.appName || 'Course Access')}&success_url=${encodeURIComponent(callbackUrl)}&failure_url=${encodeURIComponent(callbackUrl)}`;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }, [config]);

  const disconnect = useCallback(() => {
    localStorage.removeItem('near_account_id');
    setAccountId(null);
    setIsConnected(false);
    setAccessCache(new Map());
  }, []);

  const hasAccess = useCallback(async (courseId: string): Promise<boolean> => {
    if (!accountId) return false;

    const cacheKey = `${accountId}:${courseId}`;
    if (accessCache.has(cacheKey)) {
      return accessCache.get(cacheKey)!;
    }

    try {
      const rpcUrl = config.networkId === 'testnet'
        ? 'https://rpc.testnet.near.org'
        : 'https://rpc.mainnet.near.org';

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'access-check',
          method: 'query',
          params: {
            request_type: 'call_function',
            account_id: config.contractId,
            method_name: 'has_access',
            args_base64: btoa(JSON.stringify({ account_id: accountId, course_id: courseId })),
            finality: 'final',
          },
        }),
      });

      const data = await response.json();
      if (data.result?.result) {
        const result = JSON.parse(
          new TextDecoder().decode(new Uint8Array(data.result.result))
        );
        setAccessCache(prev => new Map(prev).set(cacheKey, result));
        return result;
      }
      return false;
    } catch (error) {
      console.error('Access check failed:', error);
      return false;
    }
  }, [accountId, config, accessCache]);

  const getUserPasses = useCallback(async (): Promise<AccessPass[]> => {
    if (!accountId) return [];

    try {
      const rpcUrl = config.networkId === 'testnet'
        ? 'https://rpc.testnet.near.org'
        : 'https://rpc.mainnet.near.org';

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'user-passes',
          method: 'query',
          params: {
            request_type: 'call_function',
            account_id: config.contractId,
            method_name: 'get_user_passes',
            args_base64: btoa(JSON.stringify({ account_id: accountId })),
            finality: 'final',
          },
        }),
      });

      const data = await response.json();
      if (data.result?.result) {
        return JSON.parse(new TextDecoder().decode(new Uint8Array(data.result.result)));
      }
      return [];
    } catch (error) {
      console.error('Failed to get user passes:', error);
      return [];
    }
  }, [accountId, config]);

  const getPackage = useCallback(async (packageId: string): Promise<CoursePackage | null> => {
    try {
      const rpcUrl = config.networkId === 'testnet'
        ? 'https://rpc.testnet.near.org'
        : 'https://rpc.mainnet.near.org';

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-package',
          method: 'query',
          params: {
            request_type: 'call_function',
            account_id: config.contractId,
            method_name: 'get_package',
            args_base64: btoa(JSON.stringify({ package_id: packageId })),
            finality: 'final',
          },
        }),
      });

      const data = await response.json();
      if (data.result?.result) {
        return JSON.parse(new TextDecoder().decode(new Uint8Array(data.result.result)));
      }
      return null;
    } catch (error) {
      console.error('Failed to get package:', error);
      return null;
    }
  }, [config]);

  const value: CourseAccessContextValue = {
    config,
    isConnected,
    accountId,
    connect,
    disconnect,
    hasAccess,
    getUserPasses,
    getPackage,
  };

  return (
    <CourseAccessContext.Provider value={value}>
      {children}
    </CourseAccessContext.Provider>
  );
}
