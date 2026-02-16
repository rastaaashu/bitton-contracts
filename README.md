\# BitTON Staking \& 10-Level Referral Contracts



Smart contracts for the BitTON (BTN) multi-chain staking and referral system on \*\*Base\*\* (Ethereum L2).  

This repo contains the on-chain logic for:



\- BTN token (mintable/burnable with global 21M cap)

\- Per-second staking rewards with lock periods

\- 10-level airdrop referral bonuses based on rank table



---



\## Contracts



\### 1. BTNToken.sol

\- ERC20 token `BitTON (BTN)` with \*\*21,000,000\*\* initial supply \[file:16]\[file:17].

\- `mint()` and `burn()` for cross-chain bridge mechanics (burn on source, mint on destination).

\- `Ownable` – minting restricted to admin/bridge.



\### 2. StakingRewards.sol

Core staking logic:



\- Users stake BTN and earn rewards with \*\*per-second\*\* precision.

\- Default lock period: \*\*135 days\*\* (configurable) \[file:16].

\- Default reward rate: \*\*2% per day\*\* (configurable).

\- Claiming allowed \*\*only on a specific day of the week\*\* (e.g. Monday).

\- Admin methods:

&nbsp; - `setWhitelistedToken(address token, bool status)`

&nbsp; - `setDefaultRewardRate(uint256 rate)`

&nbsp; - `setDefaultLockPeriod(uint256 period)`

&nbsp; - `setClaimDayOfWeek(uint256 day)`

\- Protected with \*\*ReentrancyGuard\*\* and \*\*Ownable\*\*.



\### 3. AirdropBonus.sol

10-level referral airdrop logic using rank-based percentages \[file:15]:



\- Ranks: Bronze → Silver → Gold → Platinum → Sapphire → Ruby → Emerald → Diamond → Blue Diamond.

\- `bonusPercentages\[rank]\[level]` stored in \*\*basis points\*\* (1% = 100).

\- For each purchase/stake, airdrop distributes BTN up to \*\*10 uplines\*\*.

\- Admin methods:

&nbsp; - `setReferrer(address user, address referrer)`

&nbsp; - `setUserRank(address user, uint256 rank)`

\- Emits `AirdropDistributed` events for backend accounting.



---



\## Project Structure



```text

bitton-contracts/

├── contracts/

│   ├── BTNToken.sol

│   ├── AirdropBonus.sol

│   └── StakingRewards.sol

├── test/

│   ├── 



