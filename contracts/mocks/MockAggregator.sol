// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockAggregator
 * @dev Mock Chainlink AggregatorV3Interface for testing BTN/USD price feed
 */
contract MockAggregator {
    int256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(int256 initialPrice, uint8 decimalsVal) {
        _price = initialPrice;
        _decimals = decimalsVal;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    // --- Test helpers ---

    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function setPriceWithTimestamp(int256 newPrice, uint256 timestamp) external {
        _price = newPrice;
        _updatedAt = timestamp;
        _roundId++;
    }

    function setUpdatedAt(uint256 timestamp) external {
        _updatedAt = timestamp;
    }
}
