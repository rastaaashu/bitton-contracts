# BitTON.AI — System Diagrams

## 1. User Registration Flow (Email + Sponsor)

```mermaid
sequenceDiagram
    participant U as User
    participant B as Backend
    participant DB as PostgreSQL
    participant E as Email Service

    U->>B: POST /auth/register-email<br/>{email, password, sponsorCode}
    B->>DB: Create user (PENDING_EMAIL)
    B->>DB: Create verification token
    B->>E: Send verification email
    B->>U: 201 {userId, status: PENDING_EMAIL}

    U->>B: POST /auth/verify-email {token}
    B->>DB: Mark token used
    B->>DB: Update user → PENDING_SPONSOR
    B->>E: Notify sponsor
    B->>U: 200 {status: PENDING_SPONSOR}

    Note over U,B: Sponsor logs in and confirms

    U->>B: POST /auth/sponsor/confirm {userId}
    B->>DB: Update user → CONFIRMED
    B->>U: 200 {status: CONFIRMED}

    U->>B: POST /auth/login-email {email, password}
    B->>DB: Verify credentials
    B->>DB: Create login session
    B->>U: 200 {accessToken, refreshToken}
```

## 2. Wallet Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Wallet (MetaMask)
    participant B as Backend
    participant DB as PostgreSQL

    U->>B: POST /auth/challenge {address}
    B->>U: {message, nonce}

    U->>W: Sign message
    W->>U: signature

    U->>B: POST /auth/verify {address, signature, message}
    B->>B: Verify signature (ethers.verifyMessage)
    B->>DB: Find or create user (CONFIRMED)
    B->>DB: Create login session
    B->>U: 200 {accessToken, refreshToken}
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
    [*] --> PENDING_EMAIL: Email registration
    PENDING_EMAIL --> CONFIRMED: Verify email (no sponsor)
    PENDING_EMAIL --> PENDING_SPONSOR: Verify email (has sponsor)
    PENDING_SPONSOR --> CONFIRMED: Sponsor confirms
    [*] --> CONFIRMED: Wallet auth (immediate)
```

## Exporting to PNG

Use `scripts/export-diagrams.sh` to render these diagrams as PNG:

```bash
chmod +x scripts/export-diagrams.sh
./scripts/export-diagrams.sh
# Output: docs/images/*.png
```
