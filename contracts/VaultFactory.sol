// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./MonthlyVaultUpgradeable.sol";
import "./LongTermVault.sol";

contract VaultFactory is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    address public immutable usdc;
    address[] public monthlyVaults;
    address[] public longTermVaults;

    event MonthlyVaultCreated(address indexed proxy, address indexed implementation);
    event LongTermVaultCreated(address indexed vault);

    constructor(address _usdc, address admin) {
        require(_usdc != address(0), "Invalid USDC");
        require(admin != address(0), "Invalid admin");

        usdc = _usdc;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function createMonthlyVault() external onlyRole(OPERATOR_ROLE) returns (address vaultProxy) {
        MonthlyVaultUpgradeable implementation = new MonthlyVaultUpgradeable();
        bytes memory initData = abi.encodeCall(MonthlyVaultUpgradeable.initialize, (usdc));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vaultProxy = address(proxy);
        monthlyVaults.push(vaultProxy);

        emit MonthlyVaultCreated(vaultProxy, address(implementation));
    }

    function createLongTermVault(address treasury) external onlyRole(OPERATOR_ROLE) returns (address vault) {
        vault = address(new LongTermVault(usdc, treasury, msg.sender));
        longTermVaults.push(vault);

        emit LongTermVaultCreated(vault);
    }

    function monthlyVaultCount() external view returns (uint256) {
        return monthlyVaults.length;
    }

    function longTermVaultCount() external view returns (uint256) {
        return longTermVaults.length;
    }
}
