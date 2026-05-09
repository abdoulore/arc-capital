// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStrategy {
    IERC20 public asset;
    address public vault;

    uint256 public totalManaged;

    uint256 public lastUpdate;
    uint256 public ratePerSecond; // scaled 1e18

    constructor(address _asset, address _vault) {
        asset = IERC20(_asset);
        vault = _vault;

        lastUpdate = block.timestamp;

        // ~10% APY
        ratePerSecond = 317097920; // ≈ 10% annual
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Not vault");
        _;
    }

    // ---------- INTERNAL YIELD ----------
    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastUpdate;

        if (elapsed > 0 && totalManaged > 0) {
            uint256 yield = (totalManaged * ratePerSecond * elapsed) / 1e18;

            totalManaged += yield;
        }

        lastUpdate = block.timestamp;
    }

    // ---------- VAULT INTERFACE ----------
    function deposit(uint256 amount) external onlyVault {
        _accrue();
        totalManaged += amount;
    }

    function withdraw(uint256 amount) external onlyVault {
        _accrue();

        require(totalManaged >= amount, "Not enough");

        totalManaged -= amount;

        uint256 available = asset.balanceOf(address(this));
        uint256 payout = amount > available ? available : amount;
        if (payout > 0) asset.transfer(vault, payout);
    }

    function totalAssets() external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdate;

        if (elapsed == 0 || totalManaged == 0) {
            return totalManaged;
        }

        uint256 yield = (totalManaged * ratePerSecond * elapsed) / 1e18;

        return totalManaged + yield;
    }

    // ---------- ADMIN ----------
    function setRate(uint256 _rate) external {
        _accrue();
        ratePerSecond = _rate;
    }
}
