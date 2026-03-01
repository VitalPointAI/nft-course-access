import Stripe from 'stripe';
import type { CoursePackage } from '../types';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  contractId: string;
  /** Account that calls mint_from_stripe on the contract */
  minterAccountId: string;
  minterPrivateKey: string;
  networkId?: 'mainnet' | 'testnet';
}

/**
 * Create a Stripe Checkout session for course purchase
 */
export async function createStripeCheckout(
  stripe: Stripe,
  options: {
    package: CoursePackage;
    nearAccountId: string;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<Stripe.Checkout.Session> {
  // Convert USDC (6 decimals) to cents (2 decimals)
  // e.g., 49_000000 USDC = $49.00 = 4900 cents
  const priceInCents = Math.round(parseInt(options.package.priceUsdc) / 10000);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: options.package.name,
            description: options.package.description,
            images: options.package.media ? [options.package.media] : [],
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: {
      package_id: options.package.packageId,
      course_id: options.package.courseId,
      near_account_id: options.nearAccountId,
    },
  });

  return session;
}

/**
 * Handle Stripe webhook events and mint NFTs
 */
export class StripeWebhookHandler {
  private stripe: Stripe;
  private webhookSecret: string;
  private contractId: string;
  private minterAccountId: string;
  private minterPrivateKey: string;
  private networkId: 'mainnet' | 'testnet';

  constructor(config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey);
    this.webhookSecret = config.webhookSecret;
    this.contractId = config.contractId;
    this.minterAccountId = config.minterAccountId;
    this.minterPrivateKey = config.minterPrivateKey;
    this.networkId = config.networkId || 'mainnet';
  }

  /**
   * Verify and parse webhook event
   */
  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  /**
   * Handle checkout.session.completed event
   * Returns the minted token ID
   */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<string> {
    const { package_id, near_account_id } = session.metadata || {};
    
    if (!package_id || !near_account_id) {
      throw new Error('Missing required metadata: package_id or near_account_id');
    }

    const amountCents = session.amount_total || 0;

    // Mint NFT via contract
    const tokenId = await this.mintFromStripe(
      package_id,
      near_account_id,
      session.id,
      amountCents
    );

    return tokenId;
  }

  /**
   * Call contract to mint NFT from Stripe payment
   */
  private async mintFromStripe(
    packageId: string,
    nearAccountId: string,
    sessionId: string,
    amountCents: number
  ): Promise<string> {
    // Import NEAR libraries
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
      methodName: 'mint_from_stripe',
      args: {
        package_id: packageId,
        recipient: nearAccountId,
        session_id: sessionId,
        amount_usd_cents: amountCents,
      },
      gas: BigInt('100000000000000'), // 100 TGas
    });

    // Extract token ID from result
    const status = result.status as { SuccessValue?: string };
    const tokenId = JSON.parse(
      Buffer.from(status.SuccessValue || '', 'base64').toString()
    );

    return tokenId;
  }
}
