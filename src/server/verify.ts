import { providers } from 'near-api-js';
import type { AccessPass, CoursePackage } from '../types';

export interface VerifierConfig {
  contractId: string;
  networkId?: 'mainnet' | 'testnet';
  /** Cache TTL in seconds (default: 60) */
  cacheTtl?: number;
}

interface CacheEntry {
  hasAccess: boolean;
  details: AccessPass | null;
  expiresAt: number;
}

/**
 * Server-side access verification for course content.
 * 
 * Usage:
 * ```typescript
 * const verifier = new CourseAccessVerifier({
 *   contractId: 'course-access.vitalpoint.near',
 *   networkId: 'mainnet',
 *   cacheTtl: 60
 * });
 * 
 * // In your API route or middleware:
 * const hasAccess = await verifier.hasAccess(nearAccountId, courseId);
 * ```
 */
export class CourseAccessVerifier {
  private provider: providers.JsonRpcProvider;
  private contractId: string;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtl: number;

  constructor(config: VerifierConfig) {
    const network = config.networkId || 'mainnet';
    const rpcUrl = network === 'mainnet'
      ? 'https://rpc.mainnet.near.org'
      : 'https://rpc.testnet.near.org';
    
    this.provider = new providers.JsonRpcProvider({ url: rpcUrl });
    this.contractId = config.contractId;
    this.cacheTtl = (config.cacheTtl || 60) * 1000; // Convert to ms
  }

  /**
   * Check if an account has valid access to a course
   */
  async hasAccess(accountId: string, courseId: string): Promise<boolean> {
    const cacheKey = `${accountId}:${courseId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.hasAccess;
    }

    try {
      const result = await this.provider.query({
        request_type: 'call_function',
        account_id: this.contractId,
        method_name: 'has_access',
        args_base64: Buffer.from(JSON.stringify({ 
          account_id: accountId, 
          course_id: courseId 
        })).toString('base64'),
        finality: 'final',
      }) as any;

      const hasAccess = JSON.parse(Buffer.from(result.result).toString());
      
      this.cache.set(cacheKey, {
        hasAccess,
        details: null,
        expiresAt: Date.now() + this.cacheTtl,
      });

      return hasAccess;
    } catch (error) {
      console.error('Access verification failed:', error);
      return false;
    }
  }

  /**
   * Get detailed access information for an account and course
   */
  async getAccessDetails(accountId: string, courseId: string): Promise<AccessPass | null> {
    try {
      const result = await this.provider.query({
        request_type: 'call_function',
        account_id: this.contractId,
        method_name: 'get_access_details',
        args_base64: Buffer.from(JSON.stringify({ 
          account_id: accountId, 
          course_id: courseId 
        })).toString('base64'),
        finality: 'final',
      }) as any;

      const details = JSON.parse(Buffer.from(result.result).toString());
      return details ? this.parseAccessPass(details) : null;
    } catch (error) {
      console.error('Failed to get access details:', error);
      return null;
    }
  }

  /**
   * Get all access passes for an account
   */
  async getUserPasses(accountId: string): Promise<AccessPass[]> {
    try {
      const result = await this.provider.query({
        request_type: 'call_function',
        account_id: this.contractId,
        method_name: 'get_user_passes',
        args_base64: Buffer.from(JSON.stringify({ account_id: accountId })).toString('base64'),
        finality: 'final',
      }) as any;

      const passes = JSON.parse(Buffer.from(result.result).toString());
      return passes.map(this.parseAccessPass);
    } catch (error) {
      console.error('Failed to get user passes:', error);
      return [];
    }
  }

  /**
   * Get package details
   */
  async getPackage(packageId: string): Promise<CoursePackage | null> {
    try {
      const result = await this.provider.query({
        request_type: 'call_function',
        account_id: this.contractId,
        method_name: 'get_package',
        args_base64: Buffer.from(JSON.stringify({ package_id: packageId })).toString('base64'),
        finality: 'final',
      }) as any;

      const pkg = JSON.parse(Buffer.from(result.result).toString());
      return pkg ? this.parsePackage(pkg) : null;
    } catch (error) {
      console.error('Failed to get package:', error);
      return null;
    }
  }

  /**
   * Get all packages for a course
   */
  async getPackagesForCourse(courseId: string): Promise<CoursePackage[]> {
    try {
      const result = await this.provider.query({
        request_type: 'call_function',
        account_id: this.contractId,
        method_name: 'get_packages_for_course',
        args_base64: Buffer.from(JSON.stringify({ course_id: courseId })).toString('base64'),
        finality: 'final',
      }) as any;

      const packages = JSON.parse(Buffer.from(result.result).toString());
      return packages.map(this.parsePackage);
    } catch (error) {
      console.error('Failed to get packages:', error);
      return [];
    }
  }

  /**
   * Clear the access cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache for a specific account
   */
  invalidateAccount(accountId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // Parse contract response to typed AccessPass
  private parseAccessPass(raw: any): AccessPass {
    return {
      tokenId: raw.token_id,
      packageId: raw.package_id,
      courseId: raw.course_id,
      owner: raw.owner,
      mintedAt: raw.minted_at,
      expiresAt: raw.expires_at || null,
      paymentMethod: this.parsePaymentMethod(raw.payment_method),
      amountPaid: raw.amount_paid,
    };
  }

  private parsePaymentMethod(raw: any): AccessPass['paymentMethod'] {
    if (raw === 'DirectUsdc') return { type: 'direct_usdc' };
    if (raw === 'DirectNear') return { type: 'direct_near' };
    if (raw === 'AdminMint') return { type: 'admin_mint' };
    if (raw.NearIntents) {
      return {
        type: 'near_intents',
        sourceChain: raw.NearIntents.source_chain,
        sourceToken: raw.NearIntents.source_token,
        intentId: raw.NearIntents.intent_id,
      };
    }
    if (raw.Stripe) {
      return { type: 'stripe', sessionId: raw.Stripe.session_id };
    }
    return { type: 'direct_usdc' };
  }

  private parsePackage(raw: any): CoursePackage {
    let accessType: CoursePackage['accessType'];
    if (raw.access_type === 'Perpetual') {
      accessType = { type: 'perpetual' };
    } else if (raw.access_type.TimeLimited) {
      accessType = { type: 'time_limited', days: raw.access_type.TimeLimited.days };
    } else if (raw.access_type.DateRange) {
      accessType = {
        type: 'date_range',
        start: parseInt(raw.access_type.DateRange.start_ns),
        end: parseInt(raw.access_type.DateRange.end_ns),
      };
    } else {
      accessType = { type: 'perpetual' };
    }

    return {
      packageId: raw.package_id,
      courseId: raw.course_id,
      name: raw.name,
      description: raw.description,
      priceUsdc: raw.price_usdc,
      accessType,
      maxSupply: raw.max_supply || null,
      mintedCount: raw.minted_count,
      isActive: raw.is_active,
      createdAt: raw.created_at,
      creator: raw.creator,
      media: raw.media || null,
    };
  }
}
