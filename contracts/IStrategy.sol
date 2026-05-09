// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrategy {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;

    function report(uint256 gain, uint256 loss) external;

    function totalAssets() external view returns (uint256);
}