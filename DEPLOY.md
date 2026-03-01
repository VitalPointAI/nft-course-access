# NFT Course Access - Deployment Guide

## Prerequisites

1. **Rust 1.86** (nearcore doesn't support 1.87+)
   ```bash
   rustup default 1.86.0
   ```

2. **cargo-near**
   ```bash
   cargo install cargo-near
   ```

3. **NEAR CLI** (for deployment)
   ```bash
   npm install -g near-cli
   # or
   cargo install near-cli-rs
   ```

## Build the Contract

```bash
cd contracts/course-access-nft
cargo near build
```

This produces: `target/near/course_access_nft.wasm`

## Deploy to Mainnet

### 1. Create the subaccount (if not exists)
```bash
near create-account course-access.vpacademy.near --masterAccount vpacademy.near --initialBalance 5
```

### 2. Deploy the contract
```bash
near deploy course-access.vpacademy.near target/near/course_access_nft.wasm
```

### 3. Initialize the contract
```bash
near call course-access.vpacademy.near new '{
  "owner_id": "vpacademy.near",
  "treasury": "vpacademy.near",
  "metadata": {
    "spec": "nft-1.0.0",
    "name": "VP Academy Course Access",
    "symbol": "VPACCESS"
  }
}' --accountId vpacademy.near
```

### 4. Whitelist the backend for minting (after you deploy the Academy backend caller)
```bash
# For NEAR Intents minting
near call course-access.vpacademy.near set_intents_caller '{
  "account_id": "vpacademy.near",
  "allowed": true
}' --accountId vpacademy.near

# For Stripe minting  
near call course-access.vpacademy.near set_stripe_caller '{
  "account_id": "vpacademy.near", 
  "allowed": true
}' --accountId vpacademy.near
```

### 5. Create a course package
```bash
near call course-access.vpacademy.near create_package '{
  "course_id": "ironclaw-foundation",
  "name": "Ironclaw Foundation Course",
  "description": "Complete access to the Ironclaw Foundation track",
  "price_usdc": "49000000",
  "access_type": "Perpetual",
  "max_supply": null,
  "media": null
}' --accountId vpacademy.near --deposit 0.1
```

## View Methods (no gas needed)

```bash
# List all packages
near view course-access.vpacademy.near get_packages '{}'

# Check user access
near view course-access.vpacademy.near has_valid_access '{
  "account_id": "user.near",
  "course_id": "ironclaw-foundation"
}'

# Get user's tokens
near view course-access.vpacademy.near nft_tokens_for_owner '{
  "account_id": "user.near"
}'
```

## Contract Addresses

- **Contract:** `course-access.vpacademy.near`
- **Treasury:** `vpacademy.near` (receives USDC payments)
- **Owner:** `vpacademy.near`

## NPM Package

After deployment, the npm package can be installed:
```bash
npm install @vitalpoint/nft-course-access
```

Usage in Academy:
```typescript
import { CourseAccessAdmin } from '@vitalpoint/nft-course-access/server';

const admin = new CourseAccessAdmin({
  contractId: 'course-access.vpacademy.near',
  adminAccountId: 'vpacademy.near',
  adminPrivateKey: process.env.NEAR_ADMIN_PRIVATE_KEY!
});

// Check access
const hasAccess = await admin.verifyAccess('user.near', 'ironclaw-foundation');

// Mint after Stripe payment
const tokenId = await admin.mintAfterStripe({
  packageId: 'ironclaw-foundation-perpetual',
  recipient: 'user.near',
  stripeSessionId: 'cs_xxx'
});
```
