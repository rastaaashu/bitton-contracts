// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AirdropBonus is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public btnToken;

    struct ReferralInfo {
        address referrer;
        uint256 rank;
    }

    mapping(address => ReferralInfo) public referrals;
    mapping(uint256 => uint256[10]) public bonusPercentages;

    uint256 public constant LEVELS = 10;

    event AirdropDistributed(address indexed buyer, address indexed receiver, uint256 amount, uint256 level);

    constructor(address _btnToken) Ownable(msg.sender) {
        btnToken = IERC20(_btnToken);

        // Correct percentages (basis points: 1% = 100)
        bonusPercentages[1] = [300, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // Bronze: 3%
        bonusPercentages[2] = [100, 200, 300, 0, 0, 0, 0, 0, 0, 0]; // Silver: 1%, 2%, 3%
        bonusPercentages[3] = [100, 200, 300, 0, 0, 0, 0, 0, 0, 0]; // Gold: 1%, 2%, 3%
        bonusPercentages[4] = [100, 100, 100, 200, 200, 200, 300, 0, 0, 0]; // Platinum
        bonusPercentages[5] = [100, 100, 100, 100, 100, 100, 200, 300, 400, 0]; // Sapphire
        bonusPercentages[6] = [100, 100, 100, 200, 200, 200, 300, 300, 300, 400]; // Ruby
        bonusPercentages[7] = [100, 100, 100, 200, 200, 200, 200, 300, 400, 500]; // Emerald
        bonusPercentages[8] = [100, 100, 200, 200, 200, 200, 200, 400, 600, 700]; // Diamond
        bonusPercentages[9] = [100, 200, 200, 200, 200, 300, 400, 500, 600, 700]; // Blue Diamond
    }

    function setReferrer(address user, address referrer) external onlyOwner {
        require(referrals[user].referrer == address(0), "Referrer already set");
        referrals[user].referrer = referrer;
    }

    function setUserRank(address user, uint256 rank) external onlyOwner {
        require(rank >= 1 && rank <= 9, "Invalid rank");
        referrals[user].rank = rank;
    }

    // Getter for tests
    function referrers(address user) external view returns (address) {
        return referrals[user].referrer;
    }

    function distributeAirdrop(address buyer, uint256 purchaseAmount) external onlyOwner nonReentrant {
        address current = buyer;

        for (uint256 level = 1; level <= LEVELS; level++) {
            current = referrals[current].referrer;
            if (current == address(0)) break;

            uint256 userRank = referrals[current].rank;
            if (userRank == 0) continue;

            uint256 basisPoints = bonusPercentages[userRank][level - 1];
            if (basisPoints == 0) continue;

            uint256 bonus = (purchaseAmount * basisPoints) / 10000;
            if (bonus > 0) {
                btnToken.safeTransfer(current, bonus);
                emit AirdropDistributed(buyer, current, bonus, level);
            }
        }
    }
}
