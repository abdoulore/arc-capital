// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MonthlyVaultV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant SHARE_SCALE = 1e18;
    uint256 public constant WINDOW_PERIOD = 30 days;

    IERC20 public immutable asset;

    uint256 public totalShares;
    uint256 public investorCapital;
    uint256 public routedYield;
    uint256 public reportedNAV;
    uint256 public reportedNAVTime;
    uint256 public withdrawalWindowStart;
    uint256 public withdrawalWindowDuration;
    uint256 public penaltyBps;
    uint256 public liquidityReserveBps;
    uint256 public maxWithdrawBps;
    bool public depositsPaused;
    bool public withdrawalsPaused;
    uint256 public nextWithdrawRequestId;

    mapping(address => uint256) public shares;
    mapping(address => WithdrawRequest) public withdrawRequests;

    struct WithdrawRequest {
        uint256 id;
        uint256 shares;
        uint256 requestTime;
    }

    event MonthlyDeposit(
        address indexed user,
        uint256 assets,
        uint256 shares,
        uint256 pricePerShareAfter
    );

    event MonthlyWithdrawRequested(
        address indexed user,
        uint256 indexed requestId,
        uint256 shares,
        uint256 grossAssets,
        uint256 requestTime
    );

    event MonthlyWithdrawExecuted(
        address indexed user,
        uint256 indexed requestId,
        uint256 shares,
        uint256 grossAssets,
        uint256 penalty,
        uint256 netAssets,
        bool inWindow
    );

    event MonthlyWithdrawCancelled(
        address indexed user,
        uint256 indexed requestId,
        uint256 shares
    );

    event MonthlyYieldInjected(
        address indexed operator,
        uint256 amount,
        uint256 routedYieldAfter,
        uint256 navAfter
    );

    event MonthlyNAVUpdated(
        address indexed operator,
        uint256 nav,
        uint256 timestamp
    );

    event MonthlyConfigUpdated(
        address indexed operator,
        string key,
        uint256 value
    );

    constructor(address _asset, address admin) {
        require(_asset != address(0), "Invalid asset");
        require(admin != address(0), "Invalid admin");

        asset = IERC20(_asset);
        withdrawalWindowDuration = 7 days;
        penaltyBps = 200;
        liquidityReserveBps = 1000;
        maxWithdrawBps = 2000;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function totalAssets() public view returns (uint256) {
        if (reportedNAV > 0 && block.timestamp - reportedNAVTime <= 1 days) {
            return reportedNAV;
        }
        return asset.balanceOf(address(this));
    }

    function totalInvestorCapital() external view returns (uint256) {
        return investorCapital;
    }

    function totalRoutedYield() external view returns (uint256) {
        return routedYield;
    }

    function pricePerShare() public view returns (uint256) {
        if (totalShares == 0) return SHARE_SCALE;
        return (totalAssets() * SHARE_SCALE) / totalShares;
    }

    function previewDeposit(uint256 assets) public view returns (uint256 sharesOut) {
        require(assets > 0, "Invalid assets");
        sharesOut = (assets * SHARE_SCALE) / pricePerShare();
    }

    function previewWithdraw(uint256 shareAmount)
        public
        view
        returns (uint256 grossAssets, uint256 penalty, uint256 netAssets)
    {
        require(shareAmount > 0, "Invalid shares");
        grossAssets = _convertToAssets(shareAmount);
        penalty = isWithdrawalWindowOpen() ? 0 : _applyPenalty(grossAssets);
        netAssets = grossAssets - penalty;
    }

    function isWithdrawalWindowOpen() public view returns (bool) {
        if (withdrawalWindowStart == 0 || withdrawalWindowDuration == 0) return false;
        uint256 elapsed = block.timestamp >= withdrawalWindowStart
            ? (block.timestamp - withdrawalWindowStart) % WINDOW_PERIOD
            : WINDOW_PERIOD - ((withdrawalWindowStart - block.timestamp) % WINDOW_PERIOD);
        return elapsed < withdrawalWindowDuration;
    }

    function deposit(uint256 assets) external nonReentrant whenNotPaused returns (uint256 sharesOut) {
        require(!depositsPaused, "Deposits paused");
        sharesOut = previewDeposit(assets);
        require(sharesOut > 0, "Zero shares");

        asset.safeTransferFrom(msg.sender, address(this), assets);
        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;
        investorCapital += assets;

        emit MonthlyDeposit(msg.sender, assets, sharesOut, pricePerShare());
    }

    function requestWithdraw(uint256 shareAmount) external nonReentrant whenNotPaused returns (uint256 requestId) {
        require(!withdrawalsPaused, "Withdrawals paused");
        require(shareAmount > 0, "Invalid shares");
        require(shares[msg.sender] >= shareAmount, "Insufficient shares");
        require(withdrawRequests[msg.sender].shares == 0, "Pending request");

        requestId = ++nextWithdrawRequestId;
        shares[msg.sender] -= shareAmount;
        withdrawRequests[msg.sender] = WithdrawRequest({
            id: requestId,
            shares: shareAmount,
            requestTime: block.timestamp
        });

        uint256 grossAssets = _convertToAssets(shareAmount);
        emit MonthlyWithdrawRequested(msg.sender, requestId, shareAmount, grossAssets, block.timestamp);
    }

    function executeWithdraw() external nonReentrant whenNotPaused returns (uint256 netAssets) {
        require(!withdrawalsPaused, "Withdrawals paused");
        WithdrawRequest memory request = withdrawRequests[msg.sender];
        require(request.shares > 0, "No request");

        (uint256 grossAssets, uint256 penalty, uint256 previewNetAssets) = previewWithdraw(request.shares);
        require(grossAssets <= (totalAssets() * maxWithdrawBps) / BPS, "Withdraw too large");

        bool inWindow = isWithdrawalWindowOpen();
        netAssets = previewNetAssets;
        require(netAssets > 0, "Zero assets");
        require(asset.balanceOf(address(this)) >= netAssets, "Insufficient liquidity");

        delete withdrawRequests[msg.sender];
        totalShares -= request.shares;
        investorCapital = grossAssets >= investorCapital ? 0 : investorCapital - grossAssets;

        asset.safeTransfer(msg.sender, netAssets);

        emit MonthlyWithdrawExecuted(
            msg.sender,
            request.id,
            request.shares,
            grossAssets,
            penalty,
            netAssets,
            inWindow
        );
    }

    function cancelWithdrawRequest() external nonReentrant {
        WithdrawRequest memory request = withdrawRequests[msg.sender];
        require(request.shares > 0, "No request");

        delete withdrawRequests[msg.sender];
        shares[msg.sender] += request.shares;

        emit MonthlyWithdrawCancelled(msg.sender, request.id, request.shares);
    }

    function injectYield(uint256 amount) external nonReentrant onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Invalid amount");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        routedYield += amount;
        reportedNAV = asset.balanceOf(address(this));
        reportedNAVTime = block.timestamp;

        emit MonthlyYieldInjected(msg.sender, amount, routedYield, reportedNAV);
    }

    function updateNAV(uint256 nav) external onlyRole(OPERATOR_ROLE) {
        require(nav > 0, "Invalid NAV");
        reportedNAV = nav;
        reportedNAVTime = block.timestamp;
        emit MonthlyNAVUpdated(msg.sender, nav, block.timestamp);
    }

    function configureWithdrawalWindow(uint256 start, uint256 duration) external onlyRole(OPERATOR_ROLE) {
        require(duration > 0 && duration <= 14 days, "Invalid duration");
        withdrawalWindowStart = start;
        withdrawalWindowDuration = duration;
        emit MonthlyConfigUpdated(msg.sender, "withdrawalWindowStart", start);
        emit MonthlyConfigUpdated(msg.sender, "withdrawalWindowDuration", duration);
    }

    function configurePenalty(uint256 _penaltyBps) external onlyRole(OPERATOR_ROLE) {
        require(_penaltyBps <= 2000, "Penalty too high");
        penaltyBps = _penaltyBps;
        emit MonthlyConfigUpdated(msg.sender, "penaltyBps", _penaltyBps);
    }

    function configureLiquidityReserve(uint256 reserveBps) external onlyRole(OPERATOR_ROLE) {
        require(reserveBps <= 5000, "Reserve too high");
        liquidityReserveBps = reserveBps;
        emit MonthlyConfigUpdated(msg.sender, "liquidityReserveBps", reserveBps);
    }

    function configureMaxWithdraw(uint256 _maxWithdrawBps) external onlyRole(OPERATOR_ROLE) {
        require(_maxWithdrawBps > 0 && _maxWithdrawBps <= BPS, "Invalid max");
        maxWithdrawBps = _maxWithdrawBps;
        emit MonthlyConfigUpdated(msg.sender, "maxWithdrawBps", _maxWithdrawBps);
    }

    function pauseDeposits(bool paused) external onlyRole(OPERATOR_ROLE) {
        depositsPaused = paused;
        emit MonthlyConfigUpdated(msg.sender, "depositsPaused", paused ? 1 : 0);
    }

    function pauseWithdrawals(bool paused) external onlyRole(OPERATOR_ROLE) {
        withdrawalsPaused = paused;
        emit MonthlyConfigUpdated(msg.sender, "withdrawalsPaused", paused ? 1 : 0);
    }

    function pauseVault(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (paused) _pause();
        else _unpause();
        emit MonthlyConfigUpdated(msg.sender, "vaultPaused", paused ? 1 : 0);
    }

    function _convertToAssets(uint256 shareAmount) internal view returns (uint256) {
        return (shareAmount * pricePerShare()) / SHARE_SCALE;
    }

    function _applyPenalty(uint256 amount) internal view returns (uint256) {
        return (amount * penaltyBps) / BPS;
    }
}
