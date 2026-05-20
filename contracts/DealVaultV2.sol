// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DealVaultV2 is ERC1155Supply, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant DEAL_SHARE_ID = 0;
    uint256 public constant ACC_PRECISION = 1e18;

    IERC20 public immutable usdc;
    uint256 public immutable dealId;
    string public dealName;
    string public metadataId;
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

    event DealInvestment(
        uint256 indexed dealId,
        address indexed investor,
        uint256 assets,
        uint256 shares,
        uint256 totalRaisedAfter
    );

    event DealRaiseClosed(
        uint256 indexed dealId,
        address indexed operator,
        uint256 totalRaised,
        uint256 closedAt
    );

    event DealCapitalDeployed(
        uint256 indexed dealId,
        address indexed operator,
        uint256 amount
    );

    event DealRevenueDistributed(
        uint256 indexed dealId,
        address indexed operator,
        uint256 amount,
        uint256 accRevenuePerShareAfter
    );

    event DealYieldClaimed(
        uint256 indexed dealId,
        address indexed investor,
        uint256 amount
    );

    event DealConfigUpdated(
        uint256 indexed dealId,
        address indexed operator,
        string key,
        uint256 value
    );

    constructor(
        address _usdc,
        uint256 _dealId,
        string memory _dealName,
        string memory _metadataId,
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
        dealId = _dealId;
        dealName = _dealName;
        metadataId = _metadataId;
        targetRaise = _targetRaise;
        minRaise = _minRaise;
        pricePerShare = _pricePerShare;
        closeTime = _closeTime;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function invest(uint256 amount) external nonReentrant whenNotPaused {
        require(dealStatus() == 0, "Raise closed");
        require(amount > 0, "Invalid amount");
        require(totalRaised + amount <= targetRaise, "Exceeds target");

        uint256 shares = previewInvestment(amount);
        require(shares > 0, "Zero shares");

        _accrue(msg.sender);
        totalRaised += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, DEAL_SHARE_ID, shares, "");
        rewardDebt[msg.sender] = (balanceOf(msg.sender, DEAL_SHARE_ID) * accRevenuePerShare) / ACC_PRECISION;

        emit DealInvestment(dealId, msg.sender, amount, shares, totalRaised);
    }

    function closeRaise() external onlyRole(OPERATOR_ROLE) {
        require(!raiseClosed, "Already closed");
        require(totalRaised >= minRaise || block.timestamp > closeTime, "Cannot close");
        raiseClosed = true;
        emit DealRaiseClosed(dealId, msg.sender, totalRaised, block.timestamp);
    }

    function adminCloseRaise() external onlyRole(OPERATOR_ROLE) {
        require(!raiseClosed, "Already closed");
        raiseClosed = true;
        emit DealRaiseClosed(dealId, msg.sender, totalRaised, block.timestamp);
    }

    function markCapitalDeployed() external onlyRole(OPERATOR_ROLE) {
        require(raiseClosed && totalRaised >= minRaise, "Raise incomplete");
        capitalDeployed = true;
        emit DealCapitalDeployed(dealId, msg.sender, totalRaised);
    }

    function distributeRevenue(uint256 amount) external nonReentrant onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Invalid amount");
        uint256 supply = totalSupply(DEAL_SHARE_ID);
        require(supply > 0, "No shares");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        accRevenuePerShare += (amount * ACC_PRECISION) / supply;

        emit DealRevenueDistributed(dealId, msg.sender, amount, accRevenuePerShare);
    }

    function claimYield() external nonReentrant returns (uint256 amount) {
        _accrue(msg.sender);
        amount = accruedRevenue[msg.sender];
        require(amount > 0, "No yield");

        accruedRevenue[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit DealYieldClaimed(dealId, msg.sender, amount);
    }

    function pendingYield(address user) external view returns (uint256) {
        uint256 accumulated = (balanceOf(user, DEAL_SHARE_ID) * accRevenuePerShare) / ACC_PRECISION;
        return accruedRevenue[user] + accumulated - rewardDebt[user];
    }

    function getShareBalance(address user) external view returns (uint256) {
        return balanceOf(user, DEAL_SHARE_ID);
    }

    function previewInvestment(uint256 assets) public view returns (uint256 shares) {
        require(assets % pricePerShare == 0, "Invalid share amount");
        shares = assets / pricePerShare;
    }

    function dealStatus() public view returns (uint8) {
        if (raiseClosed) return 1;
        if (block.timestamp > closeTime) return 2;
        if (capitalDeployed) return 3;
        return 0;
    }

    function pauseDeal(bool paused) external onlyRole(OPERATOR_ROLE) {
        if (paused) _pause();
        else _unpause();
        emit DealConfigUpdated(dealId, msg.sender, "paused", paused ? 1 : 0);
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
