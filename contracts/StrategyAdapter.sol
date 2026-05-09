// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVault {
    function receiveYield(uint256 amount) external;
}

contract StrategyAdapter {
    IERC20 public asset;
    address public vault;

    mapping(address => bool) public operators;
    address public guardian;

    uint256 public totalManaged;
    bool public paused;

    uint256 public lastReported;
    uint256 public maxDeviation = 500;

    modifier onlyOperator() {
        require(operators[msg.sender], "Not operator");
        _;
    }

    modifier onlyGuardian() {
        require(msg.sender == guardian, "Not guardian");
        _;
    }

    modifier notPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(address _asset, address _vault) {
        asset = IERC20(_asset);
        vault = _vault;

        operators[msg.sender] = true;
        guardian = msg.sender;
    }

    function setOperator(address op, bool status) external {
        require(operators[msg.sender], "Not owner");
        operators[op] = status;
    }

    function deposit(uint256 amount) external notPaused {
        require(msg.sender == vault);
        totalManaged += amount;
    }

    function report(uint256 gain, uint256 loss) external onlyOperator {
        uint256 newTotal = totalManaged + gain - loss;

        if (lastReported > 0) {
            uint256 diff = newTotal > lastReported
                ? newTotal - lastReported
                : lastReported - newTotal;

            require((diff * 10000) / lastReported <= maxDeviation);
        }

        if (gain > 0) {
            asset.transferFrom(msg.sender, address(this), gain);
            IVault(vault).receiveYield(gain);
        }

        totalManaged = newTotal;
        lastReported = newTotal;
    }

    function withdrawToVault(uint256 amount) external onlyOperator {
        asset.transfer(vault, amount);
        totalManaged -= amount;
    }

    function pause() external onlyGuardian {
        paused = true;
    }

    function unpause() external onlyGuardian {
        paused = false;
    }

    function totalAssets() external view returns (uint256) {
        return totalManaged;
    }
}