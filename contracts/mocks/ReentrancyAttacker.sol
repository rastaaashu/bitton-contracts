// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWithdrawalWalletAttack {
    function withdraw(uint256 amount) external;
}

interface ICustodialAttack {
    function returnTokens(uint256 amount) external;
}

/// @title ReentrancyAttacker
/// @notice Test contract that attempts reentrant calls on BitTON contracts.
///         Used ONLY in security tests to verify ReentrancyGuard works.
contract ReentrancyAttacker {
    address public target;
    bytes public attackCalldata;
    uint256 public attackCount;
    uint256 public maxAttacks;

    constructor() {}

    function setTarget(address _target, bytes calldata _calldata, uint256 _maxAttacks) external {
        target = _target;
        attackCalldata = _calldata;
        maxAttacks = _maxAttacks;
        attackCount = 0;
    }

    /// @dev Called when this contract receives ETH (not relevant for ERC20 but included for completeness)
    receive() external payable {
        _reenter();
    }

    /// @dev Fallback that attempts reentrancy
    fallback() external payable {
        _reenter();
    }

    /// @dev Attempt reentrancy on ERC20 token receive callback (if token has hooks)
    function onTokenTransfer(address, uint256, bytes calldata) external returns (bool) {
        _reenter();
        return true;
    }

    function _reenter() internal {
        if (attackCount < maxAttacks && target != address(0)) {
            attackCount++;
            (bool success, ) = target.call(attackCalldata);
            // We don't care if it fails — the point is to attempt reentrancy
            success; // suppress unused warning
        }
    }

    /// @dev Initiate the attack
    function attack(address _target, bytes calldata data) external {
        (bool success, bytes memory result) = _target.call(data);
        if (!success) {
            // Bubble up the revert
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
}
