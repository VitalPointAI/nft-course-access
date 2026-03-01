import { connect, keyStores, KeyPair, Account } from 'near-api-js';
import type { AccessType, CoursePackage } from '../types';
import { uploadToIPFS, type IPFSConfig } from './ipfs';

export interface AdminConfig {
  contractId: string;
  adminAccountId: string;
  adminPrivateKey: string;
  networkId?: 'mainnet' | 'testnet';
}

export interface CreatePackageOptions {
  courseId: string;
  name: string;
  description: string;
  /** Price in USD (e.g., 49 for $49) */
  priceUsd: number;
  accessType: 'perpetual' | { timeLimited: number } | { dateRange: { start: Date; end: Date } };
  maxSupply?: number;
  /** IPFS URI (ipfs://CID) or HTTP URL for cover image */
  media?: string;
}

export interface CreatePackageWithImageOptions extends Omit<CreatePackageOptions, 'media'> {
  /** Image file buffer */
  imageBuffer: Buffer;
  /** Image filename (e.g., 'course-cover.png') */
  imageFilename: string;
  /** IPFS provider configuration */
  ipfsConfig: IPFSConfig;
}

export interface UpdatePackageOptions {
  name?: string;
  description?: string;
  media?: string;
  isActive?: boolean;
}

/**
 * Admin SDK for managing course packages
 * 
 * Usage:
 * ```typescript
 * const admin = new CourseAccessAdmin({
 *   contractId: 'course-access.vitalpoint.near',
 *   adminAccountId: 'admin.vitalpoint.near',
 *   adminPrivateKey: process.env.ADMIN_PRIVATE_KEY!
 * });
 * 
 * const packageId = await admin.createPackage({
 *   courseId: 'ironclaw-foundation',
 *   name: 'Foundation Course Access',
 *   priceUsd: 49,
 *   accessType: 'perpetual'
 * });
 * ```
 */
export class CourseAccessAdmin {
  private contractId: string;
  private adminAccountId: string;
  private adminPrivateKey: string;
  private networkId: 'mainnet' | 'testnet';
  private account: Account | null = null;

  constructor(config: AdminConfig) {
    this.contractId = config.contractId;
    this.adminAccountId = config.adminAccountId;
    this.adminPrivateKey = config.adminPrivateKey;
    this.networkId = config.networkId || 'mainnet';
  }

  private async getAccount(): Promise<Account> {
    if (this.account) return this.account;

    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(this.adminPrivateKey as any);
    await keyStore.setKey(this.networkId, this.adminAccountId, keyPair);

    const near = await connect({
      networkId: this.networkId,
      keyStore,
      nodeUrl: this.networkId === 'mainnet'
        ? 'https://rpc.mainnet.near.org'
        : 'https://rpc.testnet.near.org',
    });

    this.account = await near.account(this.adminAccountId);
    return this.account;
  }

  /**
   * Create a new course package
   */
  async createPackage(options: CreatePackageOptions): Promise<string> {
    const account = await this.getAccount();

    // Convert USD to USDC (6 decimals)
    const priceUsdc = (options.priceUsd * 1_000_000).toString();

    // Convert access type to contract format
    let accessType: any;
    if (options.accessType === 'perpetual') {
      accessType = 'Perpetual';
    } else if (typeof options.accessType === 'object' && 'timeLimited' in options.accessType) {
      accessType = { TimeLimited: { days: options.accessType.timeLimited } };
    } else if (typeof options.accessType === 'object' && 'dateRange' in options.accessType) {
      accessType = {
        DateRange: {
          start_ns: (options.accessType.dateRange.start.getTime() * 1_000_000).toString(),
          end_ns: (options.accessType.dateRange.end.getTime() * 1_000_000).toString(),
        }
      };
    }

    const result = await account.functionCall({
      contractId: this.contractId,
      methodName: 'create_package',
      args: {
        course_id: options.courseId,
        name: options.name,
        description: options.description,
        price_usdc: priceUsdc,
        access_type: accessType,
        max_supply: options.maxSupply || null,
        media: options.media || null,
      },
      gas: BigInt('100000000000000'),
    });

    const packageId = JSON.parse(
      Buffer.from((result.status as any).SuccessValue, 'base64').toString()
    );

    return packageId;
  }

  /**
   * Update package details
   */
  async updatePackage(packageId: string, updates: UpdatePackageOptions): Promise<void> {
    const account = await this.getAccount();

    await account.functionCall({
      contractId: this.contractId,
      methodName: 'update_package',
      args: {
        package_id: packageId,
        name: updates.name || null,
        description: updates.description || null,
        media: updates.media || null,
        is_active: updates.isActive ?? null,
      },
      gas: BigInt('50000000000000'),
    });
  }

  /**
   * Deactivate a package (stop sales)
   */
  async deactivatePackage(packageId: string): Promise<void> {
    await this.updatePackage(packageId, { isActive: false });
  }

  /**
   * Reactivate a package
   */
  async activatePackage(packageId: string): Promise<void> {
    await this.updatePackage(packageId, { isActive: true });
  }

  /**
   * Mint a free/promotional access pass
   */
  async adminMint(packageId: string, recipient: string): Promise<string> {
    const account = await this.getAccount();

    const result = await account.functionCall({
      contractId: this.contractId,
      methodName: 'admin_mint',
      args: {
        package_id: packageId,
        recipient,
      },
      gas: BigInt('100000000000000'),
    });

    const tokenId = JSON.parse(
      Buffer.from((result.status as any).SuccessValue, 'base64').toString()
    );

    return tokenId;
  }

  /**
   * Set treasury account
   */
  async setTreasury(treasury: string): Promise<void> {
    const account = await this.getAccount();

    await account.functionCall({
      contractId: this.contractId,
      methodName: 'set_treasury',
      args: { treasury },
      gas: BigInt('30000000000000'),
    });
  }

  /**
   * Whitelist an account for Intents minting
   */
  async addIntentsCaller(accountId: string): Promise<void> {
    const account = await this.getAccount();

    await account.functionCall({
      contractId: this.contractId,
      methodName: 'set_intents_caller',
      args: { account_id: accountId, allowed: true },
      gas: BigInt('30000000000000'),
    });
  }

  /**
   * Whitelist an account for Stripe minting
   */
  async addStripeCaller(accountId: string): Promise<void> {
    const account = await this.getAccount();

    await account.functionCall({
      contractId: this.contractId,
      methodName: 'set_stripe_caller',
      args: { account_id: accountId, allowed: true },
      gas: BigInt('30000000000000'),
    });
  }

  /**
   * Create a package with an image that gets uploaded to IPFS
   * 
   * Usage:
   * ```typescript
   * const packageId = await admin.createPackageWithImage({
   *   courseId: 'ironclaw-foundation',
   *   name: 'Foundation Course Access',
   *   description: 'Full access to the Foundation track',
   *   priceUsd: 49,
   *   accessType: 'perpetual',
   *   imageBuffer: fs.readFileSync('course-cover.png'),
   *   imageFilename: 'course-cover.png',
   *   ipfsConfig: {
   *     provider: 'pinata',
   *     apiKey: process.env.PINATA_API_KEY!,
   *     apiSecret: process.env.PINATA_API_SECRET!
   *   }
   * });
   * ```
   */
  async createPackageWithImage(options: CreatePackageWithImageOptions): Promise<{
    packageId: string;
    ipfsCid: string;
    ipfsUri: string;
  }> {
    // Upload image to IPFS
    const uploadResult = await uploadToIPFS(
      options.imageBuffer,
      options.imageFilename,
      options.ipfsConfig
    );

    // Create package with IPFS URI
    const packageId = await this.createPackage({
      courseId: options.courseId,
      name: options.name,
      description: options.description,
      priceUsd: options.priceUsd,
      accessType: options.accessType,
      maxSupply: options.maxSupply,
      media: uploadResult.uri, // ipfs://CID
    });

    return {
      packageId,
      ipfsCid: uploadResult.cid,
      ipfsUri: uploadResult.uri,
    };
  }

  /**
   * Update package with a new image uploaded to IPFS
   */
  async updatePackageImage(
    packageId: string,
    imageBuffer: Buffer,
    imageFilename: string,
    ipfsConfig: IPFSConfig
  ): Promise<{ ipfsCid: string; ipfsUri: string }> {
    // Upload new image to IPFS
    const uploadResult = await uploadToIPFS(imageBuffer, imageFilename, ipfsConfig);

    // Update package with new IPFS URI
    await this.updatePackage(packageId, {
      media: uploadResult.uri,
    });

    return {
      ipfsCid: uploadResult.cid,
      ipfsUri: uploadResult.uri,
    };
  }
}
