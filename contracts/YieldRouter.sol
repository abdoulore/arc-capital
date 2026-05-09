// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract YieldRouter is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable usdc;
    address public treasury;

    event YieldRouted(address indexed source, address indexed destination, uint256 amount, string yieldType);
    event TreasuryUpdated(address indexed treasury);

    constructor(address _usdc, address _treasury, address admin) {
        require(_usdc != address(0), "Invalid USDC");
        require(_treasury != address(0), "Invalid treasury");
        require(admin != address(0), "Invalid admin");

        usdc = IERC20(_usdc);
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function routeYield(address destination, uint256 amount, string calldata yieldType)
        external
        onlyRole(OPERATOR_ROLE)
    {
        require(destination != address(0), "Invalid destination");
        require(amount > 0, "Invalid amount");

        usdc.safeTransferFrom(msg.sender, destination, amount);
        emit YieldRouted(msg.sender, destination, amount, yieldType);
    }

    function collectFee(uint256 amount, string calldata yieldType) external onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Invalid amount");
        usdc.safeTransferFrom(msg.sender, treasury, amount);
        emit YieldRouted(msg.sender, treasury, amount, yieldType);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
}
