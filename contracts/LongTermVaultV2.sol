// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LongTermVaultV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MONTH = 30 days;

    IERC20 public immutable asset;
    address public treasury;
    uint256 public earlyExitPenaltyBps;
    bool public depositsPaused;

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
    mapping(address => uint256[]) private userPositions;

    event FixedIncomePositionOpened(
        address indexed user,
        uint256 indexed positionId,
        uint256 principal,
        uint256 duration,
        uint256 apyBps,
        uint256 start,
        uint256 maturity
    );

    event FixedIncomeYieldClaimed(
        address indexed user,
        uint256 indexed positionId,
        uint256 amount,
        uint256 lastClaimAfter
    );

    event FixedIncomeRedeemed(
        address indexed user,
        uint256 indexed positionId,
        uint256 principal,
        uint256 yieldPaid
    );

    event FixedIncomeEarlyExited(
        address indexed user,
        uint256 indexed positionId,
        uint256 returnedPrincipal,
        uint256 penalty
    );

    event FixedIncomeTrancheConfigured(
        address indexed operator,
        uint256 duration,
        uint256 apyBps,
        bool enabled
    );

    event FixedIncomeConfigUpdated(
        address indexed operator,
        string key,
        uint256 value
    );

    constructor(address _asset, address _treasury, address admin) {
        require(_asset != address(0), "Invalid asset");
        require(_treasury != address(0), "Invalid treasury");
        require(admin != address(0), "Invalid admin");

        asset = IERC20(_asset);
        treasury = _treasury;
        earlyExitPenaltyBps = 1000;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        _setTranche(365 days, 800, true, admin);
        _setTranche(730 days, 1200, true, admin);
        _setTranche(1095 days, 1800, true, admin);
    }

    function deposit(uint256 amount, uint256 duration)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        require(!depositsPaused, "Deposits paused");
        TrancheConfig memory trancheConfig = tranches[duration];
        require(trancheConfig.enabled, "Invalid duration");
        require(amount > 0, "Invalid amount");

        positionId = nextPositionId++;
        uint256 start = block.timestamp;
        uint256 maturity = start + duration;

        positions[positionId] = Position({
            owner: msg.sender,
            principal: amount,
            duration: duration,
            apyBps: trancheConfig.apyBps,
            start: start,
            maturity: maturity,
            lastClaim: start,
            redeemed: false
        });
        userPositions[msg.sender].push(positionId);

        asset.safeTransferFrom(msg.sender, address(this), amount);

        emit FixedIncomePositionOpened(msg.sender, positionId, amount, duration, trancheConfig.apyBps, start, maturity);
    }

    function claimYield(uint256 positionId) external nonReentrant returns (uint256 amount) {
        Position storage position = _activeOwnedPosition(positionId);
        amount = claimableYield(positionId);
        require(amount > 0, "No yield");

        uint256 lastClaimAfter = _claimEnd(position);
        position.lastClaim = lastClaimAfter;
        asset.safeTransfer(msg.sender, amount);

        emit FixedIncomeYieldClaimed(msg.sender, positionId, amount, lastClaimAfter);
    }

    function redeemAtMaturity(uint256 positionId) external nonReentrant {
        Position storage position = _activeOwnedPosition(positionId);
        require(block.timestamp >= position.maturity, "Not mature");

        uint256 yieldAmount = claimableYield(positionId);
        uint256 principal = position.principal;
        position.lastClaim = position.maturity;
        position.redeemed = true;

        asset.safeTransfer(msg.sender, principal + yieldAmount);

        if (yieldAmount > 0) {
            emit FixedIncomeYieldClaimed(msg.sender, positionId, yieldAmount, position.maturity);
        }
        emit FixedIncomeRedeemed(msg.sender, positionId, principal, yieldAmount);
    }

    function earlyExit(uint256 positionId) external nonReentrant {
        Position storage position = _activeOwnedPosition(positionId);
        require(block.timestamp < position.maturity, "Already mature");

        (uint256 returnedPrincipal, uint256 penalty) = previewEarlyExit(positionId);
        position.redeemed = true;

        asset.safeTransfer(treasury, penalty);
        asset.safeTransfer(msg.sender, returnedPrincipal);

        emit FixedIncomeEarlyExited(msg.sender, positionId, returnedPrincipal, penalty);
    }

    function claimableYield(uint256 positionId) public view returns (uint256) {
        Position memory position = positions[positionId];
        if (position.redeemed || position.principal == 0) return 0;

        uint256 end = _claimEnd(position);
        if (end <= position.lastClaim) return 0;

        uint256 elapsedMonths = (end - position.lastClaim) / MONTH;
        return (position.principal * position.apyBps * elapsedMonths * MONTH) / (BPS * YEAR);
    }

    function previewEarlyExit(uint256 positionId)
        public
        view
        returns (uint256 returnedPrincipal, uint256 penalty)
    {
        Position memory position = positions[positionId];
        require(position.principal > 0, "Invalid position");
        require(!position.redeemed, "Redeemed");

        penalty = (position.principal * earlyExitPenaltyBps) / BPS;
        returnedPrincipal = position.principal - penalty;
    }

    function tranche(uint256 duration) external view returns (uint256 apyBps, bool enabled) {
        TrancheConfig memory config = tranches[duration];
        return (config.apyBps, config.enabled);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function configureTranche(uint256 duration, uint256 apyBps, bool enabled)
        external
        onlyRole(OPERATOR_ROLE)
    {
        _setTranche(duration, apyBps, enabled, msg.sender);
    }

    function configureEarlyExitPenalty(uint256 penaltyBps) external onlyRole(OPERATOR_ROLE) {
        require(penaltyBps <= 3000, "Penalty too high");
        earlyExitPenaltyBps = penaltyBps;
        emit FixedIncomeConfigUpdated(msg.sender, "earlyExitPenaltyBps", penaltyBps);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit FixedIncomeConfigUpdated(msg.sender, "treasury", uint256(uint160(_treasury)));
    }

    function pauseDeposits(bool paused) external onlyRole(OPERATOR_ROLE) {
        depositsPaused = paused;
        emit FixedIncomeConfigUpdated(msg.sender, "depositsPaused", paused ? 1 : 0);
    }

    function pauseVault(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (paused) _pause();
        else _unpause();
        emit FixedIncomeConfigUpdated(msg.sender, "vaultPaused", paused ? 1 : 0);
    }

    function _setTranche(uint256 duration, uint256 apyBps, bool enabled, address operator) internal {
        require(duration == 365 days || duration == 730 days || duration == 1095 days, "Unsupported duration");
        require(apyBps <= 3000, "APY too high");
        tranches[duration] = TrancheConfig(duration, apyBps, enabled);
        emit FixedIncomeTrancheConfigured(operator, duration, apyBps, enabled);
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
