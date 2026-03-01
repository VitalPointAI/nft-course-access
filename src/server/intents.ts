import type { IntentsQuote } from '../types';

const DEFUSE_API = 'https://api.defuse.org';

export interface IntentsConfig {
  contractId: string;
  treasury: string;
  /** Account that calls mint_from_intents on the contract */
  minterAccountId: string;
  minterPrivateKey: string;
  networkId?: 'mainnet' | 'testnet';
}

export interface SupportedChain {
  chainId: string;
  name: string;
  icon: string;
}

export interface SupportedToken {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

/**
 * Get quote for cross-chain swap to USDC on NEAR
 */
export async function getIntentsQuote(options: {
  sourceChain: string;
  sourceToken: string;
  amountUsdc: string; // Target USDC amount (6 decimals)
}): Promise<IntentsQuote> {
  // Query Defuse for best route
  const response = await fetch(`${DEFUSE_API}/v1/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromChain: options.sourceChain,
      fromToken: options.sourceToken,
      toChain: 'near',
      toToken: 'usdc.near', // USDC on NEAR
      toAmount: options.amountUsdc,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get quote: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    sourceChain: options.sourceChain,
    sourceToken: options.sourceToken,
    sourceAmount: data.fromAmount,
    destChain: 'near',
    destToken: 'usdc',
    destAmount: options.amountUsdc,
    route: data.route,
    estimatedTime: data.estimatedTime || 60,
    fees: {
      protocol: data.fees?.protocol || '0',
      gas: data.fees?.gas || '0',
    },
  };
}

/**
 * Get list of supported chains
 */
export async function getSupportedChains(): Promise<SupportedChain[]> {
  // Common chains supported by NEAR Intents
  return [
    { chainId: 'near', name: 'NEAR', icon: '/chains/near.svg' },
    { chainId: 'ethereum', name: 'Ethereum', icon: '/chains/eth.svg' },
    { chainId: 'polygon', name: 'Polygon', icon: '/chains/polygon.svg' },
    { chainId: 'arbitrum', name: 'Arbitrum', icon: '/chains/arbitrum.svg' },
    { chainId: 'optimism', name: 'Optimism', icon: '/chains/optimism.svg' },
    { chainId: 'base', name: 'Base', icon: '/chains/base.svg' },
    { chainId: 'bsc', name: 'BNB Chain', icon: '/chains/bsc.svg' },
    { chainId: 'avalanche', name: 'Avalanche', icon: '/chains/avax.svg' },
  ];
}

/**
 * Get tokens available on a chain
 */
export async function getTokensForChain(chainId: string): Promise<SupportedToken[]> {
  // Common tokens per chain
  const commonTokens: Record<string, SupportedToken[]> = {
    near: [
      { chainId: 'near', address: 'near', symbol: 'NEAR', name: 'NEAR', decimals: 24, icon: '/tokens/near.svg' },
      { chainId: 'near', address: 'usdc.near', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '/tokens/usdc.svg' },
      { chainId: 'near', address: 'usdt.near', symbol: 'USDT', name: 'Tether', decimals: 6, icon: '/tokens/usdt.svg' },
    ],
    ethereum: [
      { chainId: 'ethereum', address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, icon: '/tokens/eth.svg' },
      { chainId: 'ethereum', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '/tokens/usdc.svg' },
      { chainId: 'ethereum', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether', decimals: 6, icon: '/tokens/usdt.svg' },
    ],
    polygon: [
      { chainId: 'polygon', address: '0x0000000000000000000000000000000000000000', symbol: 'MATIC', name: 'Polygon', decimals: 18, icon: '/tokens/matic.svg' },
      { chainId: 'polygon', address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '/tokens/usdc.svg' },
    ],
    arbitrum: [
      { chainId: 'arbitrum', address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, icon: '/tokens/eth.svg' },
      { chainId: 'arbitrum', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '/tokens/usdc.svg' },
      { chainId: 'arbitrum', address: '0x912ce59144191c1204e64559fe8253a0e49e6548', symbol: 'ARB', name: 'Arbitrum', decimals: 18, icon: '/tokens/arb.svg' },
    ],
    base: [
      { chainId: 'base', address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, icon: '/tokens/eth.svg' },
      { chainId: 'base', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '/tokens/usdc.svg' },
    ],
  };

  return commonTokens[chainId] || [];
}

/**
 * Handle Intents callback and mint NFT
 */
export class IntentsCallback {
  private contractId: string;
  private minterAccountId: string;
  private minterPrivateKey: string;
  private networkId: 'mainnet' | 'testnet';

  constructor(config: IntentsConfig) {
    this.contractId = config.contractId;
    this.minterAccountId = config.minterAccountId;
    this.minterPrivateKey = config.minterPrivateKey;
    this.networkId = config.networkId || 'mainnet';
  }

  /**
   * Called when NEAR Intents completes the swap
   * Mints the NFT to the recipient
   */
  async handleSwapComplete(params: {
    packageId: string;
    recipient: string;
    intentId: string;
    sourceChain: string;
    sourceToken: string;
    amountUsdc: string;
  }): Promise<string> {
    const { connect, keyStores, KeyPair } = await import('near-api-js');

    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(this.minterPrivateKey as any);
    await keyStore.setKey(this.networkId, this.minterAccountId, keyPair);

    const near = await connect({
      networkId: this.networkId,
      keyStore,
      nodeUrl: this.networkId === 'mainnet'
        ? 'https://rpc.mainnet.near.org'
        : 'https://rpc.testnet.near.org',
    });

    const account = await near.account(this.minterAccountId);

    const result = await account.functionCall({
      contractId: this.contractId,
      methodName: 'mint_from_intents',
      args: {
        package_id: params.packageId,
        recipient: params.recipient,
        intent_id: params.intentId,
        source_chain: params.sourceChain,
        source_token: params.sourceToken,
        amount_usdc: params.amountUsdc,
      },
      gas: BigInt('100000000000000'),
    });

    const tokenId = JSON.parse(
      Buffer.from((result.status as any).SuccessValue, 'base64').toString()
    );

    return tokenId;
  }
}
