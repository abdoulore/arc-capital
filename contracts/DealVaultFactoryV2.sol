// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./DealVaultV2.sol";

contract DealVaultFactoryV2 is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    address public immutable usdc;
    address[] public allDeals;
    mapping(uint256 => address) public dealById;

    event DealCreated(
        uint256 indexed dealId,
        address indexed dealVault,
        address indexed operator,
        string metadataId,
        uint256 targetRaise,
        uint256 minRaise,
        uint256 pricePerShare,
        uint256 closeTime
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
        string calldata metadataId,
        string calldata uri,
        uint256 targetRaise,
        uint256 minRaise,
        uint256 pricePerShare,
        uint256 closeTime
    ) external onlyRole(OPERATOR_ROLE) returns (address dealVault) {
        uint256 dealId = allDeals.length;
        dealVault = address(
            new DealVaultV2(
                usdc,
                dealId,
                dealName,
                metadataId,
                uri,
                targetRaise,
                minRaise,
                pricePerShare,
                closeTime,
                msg.sender
            )
        );
        allDeals.push(dealVault);
        dealById[dealId] = dealVault;

        emit DealCreated(dealId, dealVault, msg.sender, metadataId, targetRaise, minRaise, pricePerShare, closeTime);
    }

    function dealCount() external view returns (uint256) {
        return allDeals.length;
    }
}
