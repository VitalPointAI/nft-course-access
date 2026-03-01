/**
 * IPFS upload utilities for NFT media
 * 
 * Supports multiple IPFS providers:
 * - Pinata (default)
 * - NFT.Storage
 * - Web3.Storage
 * - Custom IPFS node
 */

export interface IPFSConfig {
  provider: 'pinata' | 'nft.storage' | 'web3.storage' | 'custom';
  /** API key (for legacy auth) or JWT token (for Pinata JWT auth) */
  apiKey: string;
  /** API secret (for legacy Pinata auth) */
  apiSecret?: string;
  /** Custom IPFS node endpoint */
  endpoint?: string;
  /** Use JWT authentication (recommended for Pinata) */
  useJwt?: boolean;
  /** Custom gateway URL (e.g., https://yourname.mypinata.cloud) */
  gateway?: string;
}

export interface UploadResult {
  cid: string;
  uri: string;       // ipfs://CID
  gateway: string;   // https://ipfs.io/ipfs/CID
  size: number;
}

/**
 * Upload a file to IPFS
 * 
 * @param file - File buffer or base64 string
 * @param filename - Original filename
 * @param config - IPFS provider configuration
 * @returns CID and URLs
 * 
 * Usage:
 * ```typescript
 * const result = await uploadToIPFS(imageBuffer, 'course-cover.png', {
 *   provider: 'pinata',
 *   apiKey: process.env.PINATA_API_KEY!,
 *   apiSecret: process.env.PINATA_API_SECRET!
 * });
 * 
 * // Use result.uri in createPackage:
 * await admin.createPackage({
 *   courseId: 'my-course',
 *   name: 'Course Access',
 *   priceUsd: 49,
 *   accessType: 'perpetual',
 *   media: result.uri  // ipfs://QmXxx...
 * });
 * ```
 */
export async function uploadToIPFS(
  file: Buffer | string,
  filename: string,
  config: IPFSConfig
): Promise<UploadResult> {
  const buffer = typeof file === 'string' 
    ? Buffer.from(file, 'base64')
    : file;

  switch (config.provider) {
    case 'pinata':
      return uploadToPinata(buffer, filename, config);
    case 'nft.storage':
      return uploadToNFTStorage(buffer, filename, config);
    case 'web3.storage':
      return uploadToWeb3Storage(buffer, filename, config);
    case 'custom':
      return uploadToCustomNode(buffer, filename, config);
    default:
      throw new Error(`Unknown IPFS provider: ${config.provider}`);
  }
}

/**
 * Upload JSON metadata to IPFS
 * Useful for NFT metadata JSON files
 */
export async function uploadMetadataToIPFS(
  metadata: Record<string, any>,
  config: IPFSConfig
): Promise<UploadResult> {
  const json = JSON.stringify(metadata, null, 2);
  const buffer = Buffer.from(json, 'utf-8');
  return uploadToIPFS(buffer, 'metadata.json', config);
}

// === Provider implementations ===

async function uploadToPinata(
  buffer: Buffer,
  filename: string,
  config: IPFSConfig
): Promise<UploadResult> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append('file', blob, filename);

  const isJwt = config.useJwt || config.apiKey.startsWith('ey');
  
  if (isJwt) {
    // Use the newer Files API (v3) for JWT auth
    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json();
    const cid = result.data.cid;

    const gatewayBase = config.gateway || 'https://gateway.pinata.cloud';
    return {
      cid,
      uri: `ipfs://${cid}`,
      gateway: `${gatewayBase}/ipfs/${cid}`,
      size: result.data.size,
    };
  } else {
    // Legacy API key auth
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': config.apiKey,
        'pinata_secret_api_key': config.apiSecret || '',
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const data = await response.json();
    const cid = data.IpfsHash;

    const gatewayBase = config.gateway || 'https://gateway.pinata.cloud';
    return {
      cid,
      uri: `ipfs://${cid}`,
      gateway: `${gatewayBase}/ipfs/${cid}`,
      size: data.PinSize,
    };
  }
}

async function uploadToNFTStorage(
  buffer: Buffer,
  filename: string,
  config: IPFSConfig
): Promise<UploadResult> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append('file', blob, filename);

  const response = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NFT.Storage upload failed: ${error}`);
  }

  const data = await response.json();
  const cid = data.value.cid;

  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://nftstorage.link/ipfs/${cid}`,
    size: buffer.length,
  };
}

async function uploadToWeb3Storage(
  buffer: Buffer,
  filename: string,
  config: IPFSConfig
): Promise<UploadResult> {
  // Web3.Storage uses the same API as NFT.Storage
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append('file', blob, filename);

  const response = await fetch('https://api.web3.storage/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Web3.Storage upload failed: ${error}`);
  }

  const data = await response.json();
  const cid = data.cid;

  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://w3s.link/ipfs/${cid}`,
    size: buffer.length,
  };
}

async function uploadToCustomNode(
  buffer: Buffer,
  filename: string,
  config: IPFSConfig
): Promise<UploadResult> {
  const endpoint = config.endpoint || 'http://localhost:5001';
  
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append('file', blob, filename);

  const response = await fetch(`${endpoint}/api/v0/add`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`IPFS node upload failed: ${error}`);
  }

  const data = await response.json();
  const cid = data.Hash;

  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://ipfs.io/ipfs/${cid}`,
    size: data.Size,
  };
}

/**
 * Resolve IPFS URI to HTTP gateway URL
 */
export function resolveIPFSUri(uri: string, gateway = 'https://ipfs.io'): string {
  if (!uri) return '';
  
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return `${gateway}/ipfs/${cid}`;
  }
  
  // Already an HTTP URL
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  
  // Assume it's a CID
  return `${gateway}/ipfs/${uri}`;
}

/**
 * Extract CID from various IPFS URL formats
 */
export function extractCID(uri: string): string | null {
  if (!uri) return null;
  
  // ipfs://CID
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', '').split('/')[0];
  }
  
  // https://gateway.example.com/ipfs/CID
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (match) {
    return match[1];
  }
  
  // Assume it's a raw CID if it looks like one (Qm... or bafy...)
  if (uri.match(/^(Qm[a-zA-Z0-9]{44}|bafy[a-zA-Z0-9]+)$/)) {
    return uri;
  }
  
  return null;
}
