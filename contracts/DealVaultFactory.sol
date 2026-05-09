// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./DealVault.sol";

contract DealVaultFactory is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    address public immutable usdc;
    address[] public allDeals;

    event DealCreated(
        uint256 indexed dealIndex,
        address indexed dealVault,
        string dealName,
        uint256 targetRaise,
        uint256 pricePerShare
    );

    constructor(address _usdc, address admin) {
        require(_usdc != address(0), "Invalid USDC");
        require(admin != address(0), "Invalid admin");

        usdc = _usdc;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function createDeal(
        string calldata dealName,
        string calldata uri,
        uint256 targetRaise,
        uint256 minRaise,
        uint256 pricePerShare,
        uint256 closeTime
    ) external onlyRole(OPERATOR_ROLE) returns (address dealVault) {
        dealVault = address(
            new DealVault(
                usdc,
                dealName,
                uri,
                targetRaise,
                minRaise,
                pricePerShare,
                closeTime,
                msg.sender
            )
        );
        allDeals.push(dealVault);

        emit DealCreated(allDeals.length - 1, dealVault, dealName, targetRaise, pricePerShare);
    }

    function dealCount() external view returns (uint256) {
        return allDeals.length;
    }
}
