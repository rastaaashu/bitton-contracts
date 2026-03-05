# BitTON.AI — System Diagrams

## 1. User Registration Flow (Email + Wallet + Sponsor)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant W as Wallet (MetaMask)
    participant B as Backend
    participant DB as PostgreSQL
    participant E as Email Service

    U->>F: Visit /register?ref=SPONSOR_CODE
    U->>F: Fill email + password
    U->>F: Connect wallet via RainbowKit
    U->>F: Click "Create Account"

    F->>W: Sign registration message
    W->>F: signature

    F->>B: POST /auth/register-wallet<br/>{email, password, sponsorCode, address, signature, message}
    B->>B: Verify wallet signature
    B->>DB: Check email + wallet uniqueness
    B->>DB: Validate sponsor code
    B->>DB: Create user (PENDING_EMAIL)
    B->>DB: Create verification token
    B->>E: Send verification email
    B->>F: 201 {userId, status: PENDING_EMAIL}

    U->>F: Click email link /verify-email?token=XXX
    F->>B: POST /auth/verify-email {token}
    B->>DB: Mark token used
    B->>DB: Update user → CONFIRMED
    B->>F: 200 {status: CONFIRMED}
```

## 2. Wallet Login Flow (Challenge-Sign)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant W as Wallet (MetaMask)
    participant B as Backend
    participant DB as PostgreSQL

    U->>F: Visit /login
    U->>F: Connect wallet via RainbowKit
    U->>F: Click "Sign in"

    F->>B: POST /auth/challenge {address}
    B->>F: {message, nonce}

    F->>W: Sign challenge message
    W->>F: signature

    F->>B: POST /auth/verify {address, signature, message}
    B->>B: Verify signature (ethers.verifyMessage)
    B->>DB: Find user by wallet (must exist + CONFIRMED)
    B->>DB: Create login session
    B->>F: 200 {accessToken, refreshToken, user}

    F->>F: Store tokens in localStorage
    F->>F: Redirect to /dashboard
```

## 3. Staking & Reward Lifecycle

```mermaid
flowchart TD
    A[User activates vault T1/T2/T3] -->|Pay USDT or BTN| B[VaultManager]
    B --> C[User stakes BTN]
    C -->|Short 30d or Long 180d| D[StakingVault]

    D --> E{Weekly Settlement}
    E -->|10%| F[WithdrawalWallet]
    E -->|90%| G[VestingPool]

    G -->|0.5%/day release| F

    F -->|User withdraw| H[User receives BTN]

    E --> I{Referral Bonuses}
    I -->|5% direct| J[BonusEngine]
    I -->|Level-based matching| J
    J --> F
```

## 4. TON → Base Migration Pipeline

```mermaid
flowchart LR
    A[TON Snapshot CSV] -->|Import| B[PostgreSQL]
    C[User links wallets] -->|link-wallet| B
    B -->|Build claims| D[Migration Claims]
    D -->|Dispatch batches| E[Operator Jobs]
    E -->|batchMigrate| F[CustodialDistribution]
    F -->|BTN transfer| G[User wallets on Base]
```

## 5. Contract Architecture

```mermaid
graph TD
    BTN[BTNToken<br/>ERC-20, 21M supply]
    CD[CustodialDistribution<br/>Treasury, non-upgradeable]
    VM[VaultManager<br/>T1/T2/T3 activation]
    SV[StakingVault<br/>Short/Long programs]
    RE[RewardEngine<br/>Weekly settlement]
    VP[VestingPool<br/>0.5%/day release]
    WW[WithdrawalWallet<br/>User withdrawals]
    BE[BonusEngine<br/>Direct + matching]

    CD -->|fund| RE
    CD -->|distribute| WW

    VM -->|gate| SV
    SV -->|rewards| RE
    RE -->|10%| WW
    RE -->|90%| VP
    RE -->|bonuses| BE
    VP -->|release| WW
    BE -->|credit| WW

    style BTN fill:#f9f,stroke:#333
    style CD fill:#ff9,stroke:#333
    style VM fill:#9ff,stroke:#333
    style SV fill:#9ff,stroke:#333
    style RE fill:#9ff,stroke:#333
    style VP fill:#9ff,stroke:#333
    style WW fill:#9ff,stroke:#333
    style BE fill:#9ff,stroke:#333
```

## 6. User Status State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING_EMAIL: register-wallet (email+wallet+sponsor)
    PENDING_EMAIL --> CONFIRMED: Verify email (no sponsor confirm needed)
    PENDING_EMAIL --> PENDING_SPONSOR: Verify email (has sponsor)
    PENDING_SPONSOR --> CONFIRMED: Sponsor confirms
```

## Exporting to PNG

Use `scripts/export-diagrams.sh` to render these diagrams as PNG:

```bash
chmod +x scripts/export-diagrams.sh
./scripts/export-diagrams.sh
# Output: docs/images/*.png
```
