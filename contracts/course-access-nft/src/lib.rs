use near_sdk::store::{LookupMap, UnorderedMap, UnorderedSet, LazyOption};
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

/// NFT-based Course Access Passes
/// 
/// Each NFT represents access to a course or course package.
/// Supports perpetual, time-limited, and date-range access types.
/// Integrates with NEAR Intents for cross-chain payments and Stripe for fiat.

pub type TokenId = String;
pub type PackageId = String;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    TokensPerOwner,
    TokenPerOwnerInner { account_id_hash: Vec<u8> },
    TokensById,
    TokenMetadataById,
    AccessPassById,
    NFTContractMetadata,
    CoursePackages,
    PackagesPerCourse { course_id_hash: Vec<u8> },
    TokensPerPackage { package_id_hash: Vec<u8> },
    IntentsWhitelist,
    StripeWhitelist,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Access type for course packages
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub enum AccessType {
    /// Never expires
    Perpetual,
    /// Expires N days after mint
    TimeLimited { days: u32 },
    /// Fixed date window (Unix timestamps in nanoseconds)
    DateRange { start_ns: U64, end_ns: U64 },
}

/// Payment method used for purchase
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub enum PaymentMethod {
    /// Direct USDC on NEAR
    DirectUsdc,
    /// Direct NEAR (swapped internally)
    DirectNear,
    /// Cross-chain via NEAR Intents
    NearIntents { source_chain: String, source_token: String, intent_id: String },
    /// Fiat via Stripe
    Stripe { session_id: String },
    /// Admin mint (free/promotional)
    AdminMint,
}

/// Course package definition
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct CoursePackage {
    pub package_id: PackageId,
    pub course_id: String,
    pub name: String,
    pub description: String,
    /// Price in USDC (6 decimals, e.g., 49_000000 = $49)
    pub price_usdc: U128,
    pub access_type: AccessType,
    /// Maximum number of passes that can be minted (None = unlimited)
    pub max_supply: Option<u32>,
    pub minted_count: u32,
    pub is_active: bool,
    pub created_at: U64,
    pub creator: AccountId,
    /// Optional image/media for the NFT
    pub media: Option<String>,
}

/// Individual access pass (NFT)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AccessPass {
    pub token_id: TokenId,
    pub package_id: PackageId,
    pub course_id: String,
    pub owner: AccountId,
    pub minted_at: U64,
    /// None = never expires
    pub expires_at: Option<U64>,
    pub payment_method: PaymentMethod,
    /// Amount paid in USDC (6 decimals)
    pub amount_paid: U128,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Token {
    pub owner_id: AccountId,
    pub next_approval_id: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CourseAccessNFT {
    pub owner_id: AccountId,
    pub treasury: AccountId,
    
    // NFT storage
    pub tokens_per_owner: LookupMap<AccountId, UnorderedSet<TokenId>>,
    pub tokens_by_id: UnorderedMap<TokenId, Token>,
    pub token_metadata_by_id: UnorderedMap<TokenId, TokenMetadata>,
    pub access_pass_by_id: UnorderedMap<TokenId, AccessPass>,
    
    // Package storage
    pub packages: UnorderedMap<PackageId, CoursePackage>,
    pub packages_per_course: LookupMap<String, UnorderedSet<PackageId>>,
    pub tokens_per_package: LookupMap<PackageId, UnorderedSet<TokenId>>,
    
    // Contract metadata
    pub metadata: LazyOption<NFTContractMetadata>,
    
    // Counters
    pub next_token_id: u64,
    pub next_package_id: u64,
    
    // Whitelists for minting permissions
    pub intents_callers: UnorderedSet<AccountId>,
    pub stripe_callers: UnorderedSet<AccountId>,
    
    // USDC token contract on NEAR
    pub usdc_token: AccountId,
}

#[near]
impl CourseAccessNFT {
    #[init]
    pub fn new(
        owner_id: AccountId,
        treasury: AccountId,
        usdc_token: AccountId,
    ) -> Self {
        let metadata = NFTContractMetadata {
            spec: "nft-1.0.0".to_string(),
            name: "Course Access Pass".to_string(),
            symbol: "CACC".to_string(),
            icon: Some("https://academy.vitalpoint.ai/icon.png".to_string()),
            base_uri: Some("https://academy.vitalpoint.ai/api/nft".to_string()),
            reference: None,
            reference_hash: None,
        };

        Self {
            owner_id: owner_id.clone(),
            treasury,
            tokens_per_owner: LookupMap::new(StorageKey::TokensPerOwner),
            tokens_by_id: UnorderedMap::new(StorageKey::TokensById),
            token_metadata_by_id: UnorderedMap::new(StorageKey::TokenMetadataById),
            access_pass_by_id: UnorderedMap::new(StorageKey::AccessPassById),
            packages: UnorderedMap::new(StorageKey::CoursePackages),
            packages_per_course: LookupMap::new(StorageKey::PackagesPerCourse { course_id_hash: vec![] }),
            tokens_per_package: LookupMap::new(StorageKey::TokensPerPackage { package_id_hash: vec![] }),
            metadata: LazyOption::new(StorageKey::NFTContractMetadata, Some(metadata)),
            next_token_id: 1,
            next_package_id: 1,
            intents_callers: UnorderedSet::new(StorageKey::IntentsWhitelist),
            stripe_callers: UnorderedSet::new(StorageKey::StripeWhitelist),
            usdc_token,
        }
    }

    // ==================== ADMIN METHODS ====================

    /// Create a new course package
    pub fn create_package(
        &mut self,
        course_id: String,
        name: String,
        description: String,
        price_usdc: U128,
        access_type: AccessType,
        max_supply: Option<u32>,
        media: Option<String>,
    ) -> PackageId {
        self.assert_owner();
        
        let package_id = format!("pkg-{}", self.next_package_id);
        self.next_package_id += 1;

        let package = CoursePackage {
            package_id: package_id.clone(),
            course_id: course_id.clone(),
            name,
            description,
            price_usdc,
            access_type,
            max_supply,
            minted_count: 0,
            is_active: true,
            created_at: U64(env::block_timestamp()),
            creator: env::predecessor_account_id(),
            media,
        };

        self.packages.insert(package_id.clone(), package);

        // Add to course index
        let course_hash = env::sha256(course_id.as_bytes()).to_vec();
        if let Some(pkg_set) = self.packages_per_course.get_mut(&course_id) {
            pkg_set.insert(package_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::PackagesPerCourse { course_id_hash: course_hash });
            new_set.insert(package_id.clone());
            self.packages_per_course.insert(course_id, new_set);
        }

        // Initialize token set for package
        let pkg_hash = env::sha256(package_id.as_bytes()).to_vec();
        let token_set = UnorderedSet::new(StorageKey::TokensPerPackage { package_id_hash: pkg_hash });
        self.tokens_per_package.insert(package_id.clone(), token_set);

        env::log_str(&format!("Created package: {}", package_id));
        package_id
    }

    /// Update package details (not price or access type after minting starts)
    pub fn update_package(
        &mut self,
        package_id: PackageId,
        name: Option<String>,
        description: Option<String>,
        media: Option<String>,
        is_active: Option<bool>,
    ) {
        self.assert_owner();
        
        let mut package = self.packages.get(&package_id)
            .expect("Package not found")
            .clone();

        if let Some(n) = name { package.name = n; }
        if let Some(d) = description { package.description = d; }
        if let Some(m) = media { package.media = Some(m); }
        if let Some(a) = is_active { package.is_active = a; }

        self.packages.insert(package_id, package);
    }

    /// Set treasury account
    pub fn set_treasury(&mut self, treasury: AccountId) {
        self.assert_owner();
        self.treasury = treasury;
    }

    /// Add/remove intents caller whitelist
    pub fn set_intents_caller(&mut self, account_id: AccountId, allowed: bool) {
        self.assert_owner();
        if allowed {
            self.intents_callers.insert(account_id);
        } else {
            self.intents_callers.remove(&account_id);
        }
    }

    /// Add/remove stripe webhook whitelist
    pub fn set_stripe_caller(&mut self, account_id: AccountId, allowed: bool) {
        self.assert_owner();
        if allowed {
            self.stripe_callers.insert(account_id);
        } else {
            self.stripe_callers.remove(&account_id);
        }
    }

    /// Admin mint (for promotions/giveaways)
    /// Admin mint (for promotions/giveaways)
    /// Callable by owner OR whitelisted stripe callers (minter accounts)
    pub fn admin_mint(
        &mut self,
        package_id: PackageId,
        recipient: AccountId,
    ) -> TokenId {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner_id || self.stripe_callers.contains(&caller),
            "Caller not authorized for admin minting"
        );
        self.internal_mint(package_id, recipient, PaymentMethod::AdminMint, U128(0))
    }

    // ==================== PURCHASE METHODS ====================

    /// Mint from NEAR Intents callback (called by whitelisted Intents contract)
    pub fn mint_from_intents(
        &mut self,
        package_id: PackageId,
        recipient: AccountId,
        intent_id: String,
        source_chain: String,
        source_token: String,
        amount_usdc: U128,
    ) -> TokenId {
        require!(
            self.intents_callers.contains(&env::predecessor_account_id()),
            "Caller not authorized for Intents minting"
        );

        let package = self.packages.get(&package_id).expect("Package not found");
        require!(
            amount_usdc.0 >= package.price_usdc.0,
            "Insufficient payment"
        );

        let payment_method = PaymentMethod::NearIntents {
            source_chain,
            source_token,
            intent_id,
        };

        self.internal_mint(package_id, recipient, payment_method, amount_usdc)
    }

    /// Mint from Stripe webhook (called by whitelisted backend)
    pub fn mint_from_stripe(
        &mut self,
        package_id: PackageId,
        recipient: AccountId,
        session_id: String,
        amount_usd_cents: u64,
    ) -> TokenId {
        require!(
            self.stripe_callers.contains(&env::predecessor_account_id()),
            "Caller not authorized for Stripe minting"
        );

        // Convert USD cents to USDC (6 decimals)
        // $49.00 = 4900 cents = 49_000000 USDC
        let amount_usdc = U128((amount_usd_cents as u128) * 10000);

        let package = self.packages.get(&package_id).expect("Package not found");
        require!(
            amount_usdc.0 >= package.price_usdc.0,
            "Insufficient payment"
        );

        let payment_method = PaymentMethod::Stripe { session_id };
        self.internal_mint(package_id, recipient, payment_method, amount_usdc)
    }

    // Internal mint helper
    fn internal_mint(
        &mut self,
        package_id: PackageId,
        recipient: AccountId,
        payment_method: PaymentMethod,
        amount_paid: U128,
    ) -> TokenId {
        let mut package = self.packages.get(&package_id)
            .expect("Package not found")
            .clone();
        
        require!(package.is_active, "Package is not active");
        
        if let Some(max) = package.max_supply {
            require!(package.minted_count < max, "Package sold out");
        }

        let token_id = format!("cap-{}", self.next_token_id);
        self.next_token_id += 1;
        package.minted_count += 1;

        // Calculate expiry
        let expires_at = match &package.access_type {
            AccessType::Perpetual => None,
            AccessType::TimeLimited { days } => {
                let duration_ns = (*days as u64) * 24 * 60 * 60 * 1_000_000_000;
                Some(U64(env::block_timestamp() + duration_ns))
            }
            AccessType::DateRange { end_ns, .. } => Some(end_ns.clone()),
        };

        // Create access pass
        let access_pass = AccessPass {
            token_id: token_id.clone(),
            package_id: package_id.clone(),
            course_id: package.course_id.clone(),
            owner: recipient.clone(),
            minted_at: U64(env::block_timestamp()),
            expires_at: expires_at.clone(),
            payment_method,
            amount_paid,
        };

        // Create token
        let token = Token {
            owner_id: recipient.clone(),
            next_approval_id: 0,
        };

        // Create NFT metadata
        let token_metadata = TokenMetadata {
            title: Some(package.name.clone()),
            description: Some(package.description.clone()),
            media: package.media.clone(),
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: expires_at.as_ref().map(|e| e.0.to_string()),
            starts_at: None,
            updated_at: Some(env::block_timestamp().to_string()),
            extra: Some(format!(
                "{{\"course_id\":\"{}\",\"package_id\":\"{}\"}}",
                package.course_id, package_id
            )),
            reference: None,
            reference_hash: None,
        };

        // Store everything
        self.tokens_by_id.insert(token_id.clone(), token);
        self.token_metadata_by_id.insert(token_id.clone(), token_metadata);
        self.access_pass_by_id.insert(token_id.clone(), access_pass);
        self.packages.insert(package_id.clone(), package);

        // Add to owner's tokens
        if let Some(tokens_set) = self.tokens_per_owner.get_mut(&recipient) {
            tokens_set.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(recipient.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(recipient.clone(), new_set);
        }

        // Add to package's tokens
        if let Some(tokens_set) = self.tokens_per_package.get_mut(&package_id) {
            tokens_set.insert(token_id.clone());
        }

        // Emit mint event
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_mint\",\"data\":[{{\"owner_id\":\"{}\",\"token_ids\":[\"{}\"]}}]}}",
            recipient, token_id
        ));

        token_id
    }

    // ==================== ACCESS VERIFICATION ====================

    /// Check if account has valid access to a course
    pub fn has_access(&self, account_id: AccountId, course_id: String) -> bool {
        let tokens = match self.tokens_per_owner.get(&account_id) {
            Some(t) => t,
            None => return false,
        };

        let current_time = env::block_timestamp();

        for token_id in tokens.iter() {
            if let Some(pass) = self.access_pass_by_id.get(token_id) {
                if pass.course_id == course_id {
                    // Check expiry
                    if let Some(expires) = &pass.expires_at {
                        if current_time <= expires.0 {
                            return true;
                        }
                    } else {
                        // No expiry = perpetual access
                        return true;
                    }
                }
            }
        }

        false
    }

    /// Get detailed access info for a user and course
    pub fn get_access_details(
        &self,
        account_id: AccountId,
        course_id: String,
    ) -> Option<AccessPass> {
        let tokens = self.tokens_per_owner.get(&account_id)?;
        let current_time = env::block_timestamp();

        for token_id in tokens.iter() {
            if let Some(pass) = self.access_pass_by_id.get(token_id) {
                if pass.course_id == course_id {
                    // Return if not expired
                    if let Some(expires) = &pass.expires_at {
                        if current_time <= expires.0 {
                            return Some(pass.clone());
                        }
                    } else {
                        return Some(pass.clone());
                    }
                }
            }
        }

        None
    }

    /// Get all access passes for a user
    pub fn get_user_passes(&self, account_id: AccountId) -> Vec<AccessPass> {
        self.tokens_per_owner
            .get(&account_id)
            .map(|tokens| {
                tokens
                    .iter()
                    .filter_map(|token_id| self.access_pass_by_id.get(token_id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    // ==================== QUERY METHODS ====================

    /// Get package details
    pub fn get_package(&self, package_id: PackageId) -> Option<CoursePackage> {
        self.packages.get(&package_id).cloned()
    }

    /// Get all packages for a course
    pub fn get_packages_for_course(&self, course_id: String) -> Vec<CoursePackage> {
        self.packages_per_course
            .get(&course_id)
            .map(|pkg_ids| {
                pkg_ids
                    .iter()
                    .filter_map(|id| self.packages.get(id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get all active packages
    pub fn get_active_packages(&self) -> Vec<CoursePackage> {
        self.packages
            .iter()
            .filter(|(_, p)| p.is_active)
            .map(|(_, p)| p.clone())
            .collect()
    }

    /// Get access pass by token ID
    pub fn get_access_pass(&self, token_id: TokenId) -> Option<AccessPass> {
        self.access_pass_by_id.get(&token_id).cloned()
    }

    // ==================== HELPERS ====================

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only contract owner can call this method"
        );
    }

    // ==================== NEP-171 STANDARD ====================

    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonToken> {
        let token = self.tokens_by_id.get(&token_id)?;
        let metadata = self.token_metadata_by_id.get(&token_id)?;
        
        Some(JsonToken {
            token_id,
            owner_id: token.owner_id.clone(),
            metadata: metadata.clone(),
        })
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().as_ref().expect("Metadata not initialized").clone()
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.tokens_by_id.len() as u128)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens_per_owner
            .get(&account_id)
            .map(|set| U128(set.len() as u128))
            .unwrap_or(U128(0))
    }

    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        _approval_id: Option<u64>,
        _memo: Option<String>,
    ) {
        let sender = env::predecessor_account_id();
        let token = self.tokens_by_id.get(&token_id).expect("Token not found").clone();
        require!(token.owner_id == sender, "Not token owner");
        
        self.internal_transfer(&sender, &receiver_id, &token_id);
        
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"]}}]}}",
            sender, receiver_id, token_id
        ));
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonToken> {
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.tokens_per_owner
            .get(&account_id)
            .map(|token_set| {
                token_set
                    .iter()
                    .skip(start)
                    .take(limit)
                    .filter_map(|token_id| self.nft_token(token_id.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token_id: &TokenId) {
        // Remove from old owner
        if let Some(from_tokens) = self.tokens_per_owner.get_mut(from) {
            from_tokens.remove(token_id);
        }

        // Add to new owner
        if let Some(to_tokens) = self.tokens_per_owner.get_mut(to) {
            to_tokens.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(to.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(to.clone(), new_set);
        }

        // Update token owner
        if let Some(token) = self.tokens_by_id.get_mut(token_id) {
            token.owner_id = to.clone();
        }

        // Update access pass owner
        if let Some(pass) = self.access_pass_by_id.get_mut(token_id) {
            pass.owner = to.clone();
        }
    }
}

#[near(serializers = [json])]
pub struct JsonToken {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
}
