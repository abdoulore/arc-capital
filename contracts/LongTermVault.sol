// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LongTermVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MONTH = 30 days;

    IERC20 public immutable asset;
    address public treasury;

    struct TrancheConfig {
        uint256 duration;
        uint256 apyBps;
        bool enabled;
    }

    struct Position {
        address owner;
        uint256 principal;
        uint256 duration;
        uint256 apyBps;
        uint256 start;
        uint256 maturity;
        uint256 lastClaim;
        bool redeemed;
    }

    uint256 public nextPositionId;
    mapping(uint256 => TrancheConfig) public tranches;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    event Deposited(address indexed user, uint256 indexed positionId, uint256 amount, uint256 duration, uint256 apyBps);
    event YieldClaimed(address indexed user, uint256 indexed positionId, uint256 amount);
    event Redeemed(address indexed user, uint256 indexed positionId, uint256 principal);
    event EarlyExited(address indexed user, uint256 indexed positionId, uint256 returnedPrincipal, uint256 penalty);
    event TrancheConfigured(uint256 duration, uint256 apyBps, bool enabled);

    constructor(address _asset, address _treasury, address admin) {
        require(_asset != address(0), "Invalid asset");
        require(_treasury != address(0), "Invalid treasury");
        require(admin != address(0), "Invalid admin");

        asset = IERC20(_asset);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        _setTranche(365 days, 800, true);
        _setTranche(730 days, 1200, true);
        _setTranche(1095 days, 1800, true);
    }

    function deposit(uint256 amount, uint256 duration) external nonReentrant returns (uint256 positionId) {
        TrancheConfig memory tranche = tranches[duration];
        require(tranche.enabled, "Invalid duration");
        require(amount > 0, "Invalid amount");

        positionId = nextPositionId++;
        positions[positionId] = Position({
            owner: msg.sender,
            principal: amount,
            duration: duration,
            apyBps: tranche.apyBps,
            start: block.timestamp,
            maturity: block.timestamp + duration,
            lastClaim: block.timestamp,
            redeemed: false
        });
        userPositions[msg.sender].push(positionId);

        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, positionId, amount, duration, tranche.apyBps);
    }

    function claimYield(uint256 positionId) external nonReentrant returns (uint256 amount) {
        Position storage position = _activeOwnedPosition(positionId);
        amount = claimableYield(positionId);
        require(amount > 0, "No yield");

        position.lastClaim = _claimEnd(position);
        asset.safeTransfer(msg.sender, amount);

        emit YieldClaimed(msg.sender, positionId, amount);
    }

    function redeemAtMaturity(uint256 positionId) external nonReentrant {
        Position storage position = _activeOwnedPosition(positionId);
        require(block.timestamp >= position.maturity, "Not mature");

        uint256 yieldAmount = claimableYield(positionId);
        uint256 principal = position.principal;
        position.lastClaim = position.maturity;
        position.redeemed = true;

        asset.safeTransfer(msg.sender, principal + yieldAmount);
        emit YieldClaimed(msg.sender, positionId, yieldAmount);
        emit Redeemed(msg.sender, positionId, principal);
    }

    function earlyExit(uint256 positionId) external nonReentrant {
        Position storage position = _activeOwnedPosition(positionId);
        require(block.timestamp < position.maturity, "Already mature");

        uint256 returnedPrincipal = (position.principal * 9000) / BPS;
        uint256 penalty = position.principal - returnedPrincipal;
        position.redeemed = true;

        asset.safeTransfer(treasury, penalty);
        asset.safeTransfer(msg.sender, returnedPrincipal);

        emit EarlyExited(msg.sender, positionId, returnedPrincipal, penalty);
    }

    function claimableYield(uint256 positionId) public view returns (uint256) {
        Position memory position = positions[positionId];
        if (position.redeemed || position.principal == 0) return 0;

        uint256 end = _claimEnd(position);
        if (end <= position.lastClaim) return 0;

        uint256 elapsedMonths = (end - position.lastClaim) / MONTH;
        return (position.principal * position.apyBps * elapsedMonths * MONTH) / (BPS * YEAR);
    }

    function configureTranche(uint256 duration, uint256 apyBps, bool enabled)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setTranche(duration, apyBps, enabled);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function _setTranche(uint256 duration, uint256 apyBps, bool enabled) internal {
        require(duration == 365 days || duration == 730 days || duration == 1095 days, "Unsupported duration");
        require(apyBps <= 3000, "APY too high");
        tranches[duration] = TrancheConfig(duration, apyBps, enabled);
        emit TrancheConfigured(duration, apyBps, enabled);
    }

    function _activeOwnedPosition(uint256 positionId) internal view returns (Position storage position) {
        position = positions[positionId];
        require(position.owner == msg.sender, "Not owner");
        require(!position.redeemed, "Redeemed");
    }

    function _claimEnd(Position memory position) internal view returns (uint256) {
        uint256 end = block.timestamp < position.maturity ? block.timestamp : position.maturity;
        return position.lastClaim + (((end - position.lastClaim) / MONTH) * MONTH);
    }
}
