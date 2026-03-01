# @vitalpoint/nft-course-access

NFT-based course access with NEAR Intents cross-chain payments and Stripe fallback.

## Features

- 🎓 **NFT Access Passes** - Mint NEP-171 compliant NFTs for course access
- ⛓️ **Cross-Chain Payments** - Pay with any token on any chain via NEAR Intents
- 💳 **Stripe Fallback** - Accept credit card payments
- 🔐 **Token Gating** - React components for protecting content
- 💰 **USDC Treasury** - All payments settle to your NEAR account in USDC

## Installation

```bash
npm install @vitalpoint/nft-course-access
```

## Quick Start

### 1. Wrap your app with the provider

```tsx
import { CourseAccessProvider } from '@vitalpoint/nft-course-access';

function App({ children }) {
  return (
    <CourseAccessProvider
      config={{
        contractId: 'course-access.yourname.near',
        networkId: 'mainnet',
        stripeKey: process.env.NEXT_PUBLIC_STRIPE_KEY,
      }}
    >
      {children}
    </CourseAccessProvider>
  );
}
```

### 2. Add purchase widget

```tsx
import { PurchaseWidget } from '@vitalpoint/nft-course-access';

function PurchasePage() {
  return (
    <PurchaseWidget
      packageId="pkg-1"
      onSuccess={(tokenId) => router.push('/course')}
      showStripe={true}
    />
  );
}
```

### 3. Gate your content

```tsx
import { AccessGate, PurchaseWidget } from '@vitalpoint/nft-course-access';

function CoursePage() {
  return (
    <AccessGate
      courseId="my-course"
      fallback={<PurchaseWidget packageId="pkg-1" />}
    >
      <ProtectedContent />
    </AccessGate>
  );
}
```

## Server-Side Verification

```typescript
import { CourseAccessVerifier } from '@vitalpoint/nft-course-access/server';

const verifier = new CourseAccessVerifier({
  contractId: 'course-access.yourname.near',
  networkId: 'mainnet',
});

// In your API route
const hasAccess = await verifier.hasAccess(nearAccountId, courseId);
```

## Admin SDK

```typescript
import { CourseAccessAdmin } from '@vitalpoint/nft-course-access/server';

const admin = new CourseAccessAdmin({
  contractId: 'course-access.yourname.near',
  adminAccountId: 'admin.yourname.near',
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY,
});

// Create a package
const packageId = await admin.createPackage({
  courseId: 'my-course',
  name: 'Full Course Access',
  description: 'Lifetime access to the complete course',
  priceUsd: 49,
  accessType: 'perpetual',
});

// Mint promotional access
await admin.adminMint(packageId, 'student.near');
```

## Access Types

- **Perpetual** - Never expires
- **Time Limited** - Expires N days after purchase
- **Date Range** - Active between specific dates

```typescript
// Time limited (1 year)
await admin.createPackage({
  courseId: 'my-course',
  name: '1 Year Access',
  priceUsd: 29,
  accessType: { timeLimited: 365 },
});

// Date range (cohort)
await admin.createPackage({
  courseId: 'my-course',
  name: 'Spring 2026 Cohort',
  priceUsd: 199,
  accessType: {
    dateRange: {
      start: new Date('2026-03-01'),
      end: new Date('2026-06-01'),
    },
  },
});
```

## Payment Flow

```
User selects token (ETH, USDC, MATIC, etc.)
    ↓
NEAR Intents quotes the swap
    ↓
User approves & signs transaction
    ↓
Cross-chain swap executes
    ↓
USDC arrives at contract
    ↓
NFT minted to user
    ↓
USDC transferred to treasury
```

## Contract Deployment

```bash
# Build contract
cd contracts && ./build.sh

# Deploy (requires NEAR CLI)
near deploy course-access.yourname.near deploy/course_access_nft.wasm \
  --initFunction new \
  --initArgs '{"owner_id":"admin.yourname.near","treasury":"treasury.yourname.near","usdc_token":"usdc.near"}'
```

## License

MIT
