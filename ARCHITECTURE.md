# @vitalpoint/nft-course-access

NFT-based course access with NEAR Intents cross-chain payments + Stripe fallback.

## Overview

Enables course creators to sell NFT-based access passes with:
- Price in USDC (stable)
- Accept payment in any token on any chain via NEAR Intents
- Auto-swap to USDC and deposit to treasury
- Stripe fallback for fiat payments
- Token gating for course content
- Time-limited or perpetual access

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
├─────────────────────────────────────────────────────────────────┤
│  <PurchaseWidget />          │  <AccessGate />                  │
│  - Chain selector            │  - Wraps protected content       │
│  - Token selector            │  - Checks NFT ownership          │
│  - Price display (USDC)      │  - Shows unlock prompt if !owned │
│  - Stripe option             │                                  │
└────────────┬─────────────────┴──────────────┬───────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐      ┌─────────────────────────────────┐
│    NEAR Intents        │      │       Course Access NFT         │
│    (defuse.org)        │      │       Smart Contract            │
├────────────────────────┤      ├─────────────────────────────────┤
│ - Cross-chain swaps    │      │ - NEP-171 compliant             │
│ - Any token → USDC     │      │ - Package metadata              │
│ - Gas abstraction      │      │ - Access verification           │
│ - Sign once            │      │ - Time-based expiry             │
└────────────┬───────────┘      └────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     vitalpointai.near                           │
│                     (Treasury - receives USDC)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Smart Contract: `course-access.vitalpoint.near`

```rust
struct CoursePackage {
    package_id: String,
    course_id: String,           // External course identifier
    name: String,
    description: String,
    price_usdc: U128,            // Price in USDC (6 decimals)
    access_type: AccessType,     // Perpetual | TimeLimited
    duration_days: Option<u32>,  // For TimeLimited
    max_supply: Option<u32>,     // None = unlimited
    minted_count: u32,
    is_active: bool,
    created_at: u64,
    creator: AccountId,
}

enum AccessType {
    Perpetual,                   // Never expires
    TimeLimited { days: u32 },   // Expires after N days from mint
    DateRange { start: u64, end: u64 }, // Fixed date window
}

struct AccessPass {
    token_id: String,
    package_id: String,
    owner: AccountId,
    minted_at: u64,
    expires_at: Option<u64>,     // None = never expires
    payment_method: PaymentMethod,
    amount_paid: U128,           // In USDC
}

enum PaymentMethod {
    NearIntents { source_chain: String, source_token: String },
    DirectNear,
    DirectUsdc,
    Stripe { session_id: String },
}
```

### Contract Methods

```rust
// Admin methods (owner only)
fn create_package(course_id, name, description, price_usdc, access_type, max_supply) -> PackageId
fn update_package(package_id, updates)
fn deactivate_package(package_id)
fn set_treasury(account_id)

// Purchase methods
#[payable]
fn purchase_with_usdc(package_id) -> TokenId  // Direct USDC payment
fn purchase_with_near(package_id) -> TokenId  // Direct NEAR (auto-swap)
fn mint_from_intents(package_id, intent_id) -> TokenId  // Called by Intents callback
fn mint_from_stripe(package_id, user_id, stripe_session_id) -> TokenId  // Backend webhook

// Access verification
fn has_access(account_id, course_id) -> bool
fn get_access_details(account_id, course_id) -> Option<AccessInfo>
fn get_user_passes(account_id) -> Vec<AccessPass>

// Queries
fn get_package(package_id) -> CoursePackage
fn get_packages_for_course(course_id) -> Vec<CoursePackage>
fn get_all_active_packages() -> Vec<CoursePackage>
```

## npm Package Structure

```
@vitalpoint/nft-course-access/
├── src/
│   ├── index.ts                 # Main exports
│   ├── client/
│   │   ├── components/
│   │   │   ├── PurchaseWidget.tsx
│   │   │   ├── AccessGate.tsx
│   │   │   ├── StripeCheckout.tsx
│   │   │   ├── ChainSelector.tsx
│   │   │   └── TokenSelector.tsx
│   │   ├── hooks/
│   │   │   ├── useNFTAccess.ts
│   │   │   ├── usePurchase.ts
│   │   │   └── useIntentsQuote.ts
│   │   └── context/
│   │       └── CourseAccessProvider.tsx
│   ├── server/
│   │   ├── verify.ts            # Access verification
│   │   ├── admin.ts             # Admin SDK
│   │   ├── stripe.ts            # Stripe integration
│   │   └── intents.ts           # NEAR Intents helpers
│   └── contract/
│       └── abi.ts               # Contract interface
├── contracts/
│   └── course-access-nft/       # Rust smart contract
├── package.json
└── tsconfig.json
```

## React Components

### `<PurchaseWidget />`

```tsx
<PurchaseWidget
  packageId="pkg-ironclaw-foundation"
  onSuccess={(tokenId) => router.push('/course')}
  onError={(err) => toast.error(err.message)}
  theme="dark"
  treasury="vitalpointai.near"
  stripePublishableKey="pk_live_..."
/>
```

Features:
- Shows package details (name, price in USDC)
- Chain selector (NEAR, Ethereum, Polygon, Arbitrum, etc.)
- Token selector (filters by user's balances)
- Real-time quote from NEAR Intents
- "Pay with Card" Stripe option
- Progress states during purchase
- Success/error handling

### `<AccessGate />`

```tsx
<AccessGate 
  courseId="ironclaw-foundation"
  fallback={<PurchasePrompt />}
>
  <ProtectedCourseContent />
</AccessGate>
```

### `usePurchase()` Hook

```tsx
const { 
  quote,           // Current price quote
  isLoading,
  purchase,        // Trigger purchase
  status,          // 'idle' | 'quoting' | 'signing' | 'confirming' | 'success' | 'error'
  error,
  txHash
} = usePurchase({
  packageId: 'pkg-123',
  sourceChain: 'ethereum',
  sourceToken: 'USDC',
  onSuccess: (tokenId) => {}
});
```

## NEAR Intents Integration

Using defuse.org / intents.near.org:

1. **Get Quote**: Query price to swap user's token → USDC
2. **Create Intent**: User signs single transaction
3. **Execute**: Relayer handles multi-chain swap
4. **Callback**: Contract mints NFT when USDC received

```typescript
// Client: Create purchase intent
const intent = await createPurchaseIntent({
  packageId: 'pkg-123',
  sourceChain: 'ethereum',
  sourceToken: '0xa0b86991...',  // USDC on ETH
  amount: quote.sourceAmount,
  recipient: 'course-access.vitalpoint.near',
  treasury: 'vitalpointai.near'
});

// User signs the intent
await wallet.signAndSendTransaction(intent.transaction);
```

## Stripe Integration

For users who prefer fiat:

1. Create Stripe Checkout session with course package metadata
2. User completes payment
3. Webhook calls backend
4. Backend calls contract `mint_from_stripe()`
5. NFT minted to user's NEAR account (or created on their behalf)

```typescript
// Server: Handle Stripe webhook
app.post('/api/stripe/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(...);
  
  if (event.type === 'checkout.session.completed') {
    const { package_id, near_account_id } = event.data.object.metadata;
    
    // Mint NFT via contract
    await contract.mint_from_stripe({
      package_id,
      user_account_id: near_account_id,
      stripe_session_id: event.data.object.id,
      amount_usd: event.data.object.amount_total / 100
    });
  }
});
```

## Admin SDK

```typescript
import { CourseAccessAdmin } from '@vitalpoint/nft-course-access/server';

const admin = new CourseAccessAdmin({
  contractId: 'course-access.vitalpoint.near',
  adminAccountId: 'admin.vitalpoint.near',
  privateKey: process.env.ADMIN_PRIVATE_KEY
});

// Create a new course package
await admin.createPackage({
  courseId: 'ironclaw-foundation',
  name: 'Ironclaw Foundation Course',
  description: 'Complete access to the Foundation track',
  priceUsdc: 49_000000,  // $49 USDC (6 decimals)
  accessType: 'perpetual',
  maxSupply: null  // Unlimited
});

// Time-limited access
await admin.createPackage({
  courseId: 'ironclaw-developer',
  name: 'Developer Track - 1 Year Access',
  priceUsdc: 149_000000,  // $149
  accessType: 'time_limited',
  durationDays: 365
});
```

## Database Integration (Academy)

```sql
-- Link NEAR accounts to users
ALTER TABLE users ADD COLUMN near_account_id TEXT;

-- Track NFT access (cache, verified on-chain)
CREATE TABLE course_access_nfts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  course_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  expires_at DATETIME,
  verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, token_id)
);
```

## Implementation Phases

### Phase 1: Core Contract (Week 1)
- [ ] Course package management
- [ ] Direct USDC minting
- [ ] Access verification
- [ ] Basic admin methods

### Phase 2: NEAR Intents (Week 2)
- [ ] Intents callback handler
- [ ] Cross-chain quote API
- [ ] React purchase widget
- [ ] Chain/token selectors

### Phase 3: Stripe + npm Package (Week 3)
- [ ] Stripe checkout integration
- [ ] Webhook handler
- [ ] Full npm package build
- [ ] Documentation

### Phase 4: Academy Integration (Week 4)
- [ ] Admin UI for packages
- [ ] Token gating middleware
- [ ] User NEAR account linking
- [ ] Purchase flow in Academy

## Security Considerations

1. **Contract Security**
   - Admin-only package creation
   - Verified Intents callbacks only
   - Rate limiting on mints
   - Reentrancy guards

2. **Server Security**
   - Stripe webhook signature verification
   - Admin key management (env vars)
   - Access cache invalidation

3. **Client Security**
   - No private keys in browser
   - Validate all contract responses
   - HTTPS only for API calls

## Treasury Flow

All payments end up in `vitalpointai.near`:

```
User pays $49 USDC (any chain)
    → NEAR Intents swaps to USDC on NEAR
    → Contract receives USDC
    → Contract transfers to vitalpointai.near
    → Contract mints NFT to user
```

Stripe payments:
```
User pays $49 USD via Stripe
    → Stripe deposits to bank
    → Webhook triggers NFT mint
    → User gets access
```

## Example Usage in Academy

```tsx
// app/courses/[slug]/page.tsx
import { AccessGate, CourseAccessProvider } from '@vitalpoint/nft-course-access';

export default function CoursePage({ course }) {
  return (
    <CourseAccessProvider
      contractId="course-access.vitalpoint.near"
      stripeKey={process.env.NEXT_PUBLIC_STRIPE_KEY}
    >
      <AccessGate
        courseId={course.id}
        fallback={<PurchasePage course={course} />}
      >
        <CourseContent course={course} />
      </AccessGate>
    </CourseAccessProvider>
  );
}
```
