// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DealVault is ERC1155Supply, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant DEAL_SHARE_ID = 0;
    uint256 public constant ACC_PRECISION = 1e18;

    IERC20 public immutable usdc;
    string public dealName;
    uint256 public immutable targetRaise;
    uint256 public immutable minRaise;
    uint256 public immutable pricePerShare;
    uint256 public immutable closeTime;

    uint256 public totalRaised;
    uint256 public accRevenuePerShare;
    bool public capitalDeployed;
    bool public raiseClosed;

    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public accruedRevenue;

    event Invested(address indexed investor, uint256 assets, uint256 shares);
    event RevenueDistributed(address indexed source, uint256 amount);
    event YieldClaimed(address indexed investor, uint256 amount);
    event CapitalMarkedDeployed(uint256 amount);
    event RaiseClosed();

    constructor(
        address _usdc,
        string memory _dealName,
        string memory _uri,
        uint256 _targetRaise,
        uint256 _minRaise,
        uint256 _pricePerShare,
        uint256 _closeTime,
        address admin
    ) ERC1155(_uri) {
        require(_usdc != address(0), "Invalid USDC");
        require(admin != address(0), "Invalid admin");
        require(_targetRaise >= _minRaise && _targetRaise > 0, "Invalid raise");
        require(_pricePerShare > 0, "Invalid price");
        require(_closeTime > block.timestamp, "Invalid close");

        usdc = IERC20(_usdc);
        dealName = _dealName;
        targetRaise = _targetRaise;
        minRaise = _minRaise;
        pricePerShare = _pricePerShare;
        closeTime = _closeTime;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function invest(uint256 amount) external nonReentrant {
        require(!raiseClosed && block.timestamp <= closeTime, "Raise closed");
        require(amount > 0, "Invalid amount");
        require(totalRaised + amount <= targetRaise, "Exceeds target");

        uint256 shares = amount / pricePerShare;
        require(shares > 0 && shares * pricePerShare == amount, "Invalid share amount");

        _accrue(msg.sender);
        totalRaised += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, DEAL_SHARE_ID, shares, "");
        rewardDebt[msg.sender] = (balanceOf(msg.sender, DEAL_SHARE_ID) * accRevenuePerShare) / ACC_PRECISION;

        emit Invested(msg.sender, amount, shares);
    }

    function closeRaise() external onlyRole(OPERATOR_ROLE) {
        require(!raiseClosed, "Already closed");
        require(totalRaised >= minRaise || block.timestamp > closeTime, "Cannot close");
        raiseClosed = true;
        emit RaiseClosed();
    }

    function adminCloseRaise() external onlyRole(OPERATOR_ROLE) {
        require(!raiseClosed, "Already closed");
        raiseClosed = true;
        emit RaiseClosed();
    }

    function markCapitalDeployed() external onlyRole(OPERATOR_ROLE) {
        require(raiseClosed && totalRaised >= minRaise, "Raise incomplete");
        capitalDeployed = true;
        emit CapitalMarkedDeployed(totalRaised);
    }

    function distributeRevenue(uint256 amount) external nonReentrant onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Invalid amount");
        uint256 supply = totalSupply(DEAL_SHARE_ID);
        require(supply > 0, "No shares");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        accRevenuePerShare += (amount * ACC_PRECISION) / supply;

        emit RevenueDistributed(msg.sender, amount);
    }

    function claimYield() external nonReentrant returns (uint256 amount) {
        _accrue(msg.sender);
        amount = accruedRevenue[msg.sender];
        require(amount > 0, "No yield");

        accruedRevenue[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit YieldClaimed(msg.sender, amount);
    }

    function pendingYield(address user) external view returns (uint256) {
        uint256 accumulated = (balanceOf(user, DEAL_SHARE_ID) * accRevenuePerShare) / ACC_PRECISION;
        return accruedRevenue[user] + accumulated - rewardDebt[user];
    }

    function getShareBalance(address user) external view returns (uint256) {
        return balanceOf(user, DEAL_SHARE_ID);
    }

    function _accrue(address user) internal {
        if (user == address(0)) return;
        uint256 accumulated = (balanceOf(user, DEAL_SHARE_ID) * accRevenuePerShare) / ACC_PRECISION;
        uint256 debt = rewardDebt[user];
        if (accumulated > debt) {
            accruedRevenue[user] += accumulated - debt;
        }
        rewardDebt[user] = accumulated;
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155Supply) {
        _accrue(from);
        _accrue(to);
        super._update(from, to, ids, values);
        _accrue(from);
        _accrue(to);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
