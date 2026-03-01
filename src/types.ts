// Type definitions for @vitalpoint/nft-course-access

export type AccessType = 
  | { type: 'perpetual' }
  | { type: 'time_limited'; days: number }
  | { type: 'date_range'; start: number; end: number };

export type PaymentMethod =
  | { type: 'direct_usdc' }
  | { type: 'direct_near' }
  | { type: 'near_intents'; sourceChain: string; sourceToken: string; intentId: string }
  | { type: 'stripe'; sessionId: string }
  | { type: 'admin_mint' };

export interface CoursePackage {
  packageId: string;
  courseId: string;
  name: string;
  description: string;
  /** Price in USDC (6 decimals, e.g., 49_000000 = $49) */
  priceUsdc: string;
  accessType: AccessType;
  maxSupply: number | null;
  mintedCount: number;
  isActive: boolean;
  createdAt: string;
  creator: string;
  media: string | null;
}

export interface AccessPass {
  tokenId: string;
  packageId: string;
  courseId: string;
  owner: string;
  mintedAt: string;
  expiresAt: string | null;
  paymentMethod: PaymentMethod;
  amountPaid: string;
}

export interface PurchaseWidgetProps {
  packageId: string;
  onSuccess?: (tokenId: string) => void;
  onError?: (error: Error) => void;
  theme?: 'light' | 'dark';
  /** Show Stripe payment option */
  showStripe?: boolean;
  /** Stripe publishable key (required if showStripe) */
  stripeKey?: string;
  /** Custom styles */
  className?: string;
}

export interface AccessGateProps {
  courseId: string;
  /** Component to show when user doesn't have access */
  fallback: React.ReactNode;
  /** Loading state component */
  loading?: React.ReactNode;
  children: React.ReactNode;
}

export interface CourseAccessConfig {
  contractId: string;
  networkId?: 'mainnet' | 'testnet';
  stripeKey?: string;
  /** NEAR wallet selector options */
  walletSelector?: {
    appName: string;
    appLogo?: string;
  };
}

export interface IntentsQuote {
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destChain: 'near';
  destToken: 'usdc';
  destAmount: string;
  route: string;
  estimatedTime: number;
  fees: {
    protocol: string;
    gas: string;
  };
}

export interface PurchaseState {
  status: 'idle' | 'connecting' | 'quoting' | 'approving' | 'signing' | 'confirming' | 'success' | 'error';
  quote: IntentsQuote | null;
  error: Error | null;
  txHash: string | null;
  tokenId: string | null;
}
