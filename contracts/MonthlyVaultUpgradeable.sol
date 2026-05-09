// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IStrategy {
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
}

contract MonthlyVaultUpgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    IERC20 public asset;

    uint256 public totalShares;
    mapping(address => uint256) public shares;

    uint256 public managementFee;
    uint256 public performanceFee;
    address public feeRecipient;

    uint256 public lastTotalAssets;
    uint256 public lastFeeTime;

    uint256 public maxWithdrawBps;
    uint256 public idleBufferBps;
    uint256 public penaltyBps;
    uint256 public withdrawalWindowStart;
    uint256 public withdrawalWindowDuration;
    uint256 public reportedNAV;
    uint256 public reportedNAVTime;

    // 🔐 SIGNATURE ORACLE
    address public oracleSigner;
    mapping(bytes32 => bool) public usedMessages;

    struct StrategyData {
        address strategy;
        uint256 weight;
        uint256 debt;

        uint256 lastSnapshotAssets;
        uint256 lastSnapshotTime;

        uint256 oracleAssets;
        uint256 lastOracleUpdate;
    }

    StrategyData[] public strategies;
    uint256 public totalWeight;

    struct WithdrawRequest {
        uint256 shares;
        uint256 requestTime;
    }

    mapping(address => WithdrawRequest) public withdrawRequests;

    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount);
    event FeesAccrued(uint256 mgmt, uint256 perf);
    event OracleUpdated(uint256 indexed id, uint256 assets);
    event WithdrawRequested(address indexed user, uint256 shares);
    event PenaltyApplied(address indexed user, uint256 grossAmount, uint256 penalty);
    event NAVUpdated(uint256 nav, uint256 timestamp);

    function initialize(address _asset) public initializer {
        __Ownable_init(msg.sender);

        asset = IERC20(_asset);

        feeRecipient = msg.sender;
        managementFee = 200;
        performanceFee = 1000;
        maxWithdrawBps = 2000;
        idleBufferBps = 1000;
        penaltyBps = 200;
        withdrawalWindowDuration = 7 days;

        lastFeeTime = block.timestamp;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ---------- ORACLE ----------

    function setOracleSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Invalid");
        oracleSigner = _signer;
    }

    function updateOracleAssetsSigned(
        uint256 index,
        uint256 assets,
        uint256 timestamp,
        bytes calldata signature
    ) external {
        require(block.timestamp - timestamp < 5 minutes, "Stale");

        bytes32 message = keccak256(
            abi.encodePacked(index, assets, timestamp, address(this))
        );

        require(!usedMessages[message], "Replay");

        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(message);
        address signer = ECDSA.recover(ethSigned, signature);

        require(signer == oracleSigner, "Invalid signer");

        usedMessages[message] = true;

        StrategyData storage s = strategies[index];
        s.oracleAssets = assets;
        s.lastOracleUpdate = block.timestamp;

        emit OracleUpdated(index, assets);
    }

    function getStrategyAssets(uint256 i) public view returns (uint256) {
        StrategyData memory s = strategies[i];

        if (block.timestamp - s.lastOracleUpdate < 1 days && s.oracleAssets > 0) {
            return s.oracleAssets;
        }

        return IStrategy(s.strategy).totalAssets();
    }

    // ---------- CONFIG ----------

    function setIdleBuffer(uint256 _bps) external onlyOwner {
        require(_bps <= 5000, "Too high");
        idleBufferBps = _bps;
    }

    function setWithdrawLimit(uint256 _bps) external onlyOwner {
        require(_bps <= 5000, "Too high");
        maxWithdrawBps = _bps;
    }

    function setPenalty(uint256 _bps) external onlyOwner {
        require(_bps <= 2000, "Too high");
        penaltyBps = _bps;
    }

    function setWithdrawalWindow(uint256 _start, uint256 _duration) external onlyOwner {
        require(_duration > 0 && _duration <= 14 days, "Invalid duration");
        withdrawalWindowStart = _start;
        withdrawalWindowDuration = _duration;
    }

    function updateNAV(uint256 nav) external onlyOwner {
        require(nav > 0, "Invalid NAV");
        reportedNAV = nav;
        reportedNAVTime = block.timestamp;
        lastTotalAssets = nav;
        emit NAVUpdated(nav, block.timestamp);
    }

    // ---------- NAV ----------

    function totalAssets() public view returns (uint256) {
        if (reportedNAV > 0 && block.timestamp - reportedNAVTime < 1 days) {
            return reportedNAV;
        }

        uint256 idle = asset.balanceOf(address(this));
        uint256 total = idle;

        for (uint256 i = 0; i < strategies.length; i++) {
            total += getStrategyAssets(i);
        }

        return total;
    }

    function pricePerShare() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (totalAssets() * 1e18) / totalShares;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * 1e18) / pricePerShare();
    }

    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return (_shares * pricePerShare()) / 1e18;
    }

    // ---------- FEES ----------

    function accrueFees() public {
        uint256 elapsed = block.timestamp - lastFeeTime;
        if (elapsed == 0) return;

        uint256 assets = totalAssets();

        uint256 mgmt = (assets * managementFee * elapsed)
            / (365 days * 10000);

        mgmt = _payAvailable(feeRecipient, mgmt);

        uint256 perf;

        if (assets > lastTotalAssets) {
            uint256 profit = assets - lastTotalAssets;
            perf = (profit * performanceFee) / 10000;

            perf = _payAvailable(feeRecipient, perf);
        }

        lastTotalAssets = assets;
        lastFeeTime = block.timestamp;

        emit FeesAccrued(mgmt, perf);
    }

    // ---------- ALLOCATION ----------

    function _allocate() internal {
        uint256 idle = asset.balanceOf(address(this));
        if (idle == 0 || totalWeight == 0) return;

        uint256 targetIdle = (totalAssets() * idleBufferBps) / 10000;
        if (idle <= targetIdle) return;

        uint256 deployable = idle - targetIdle;

        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 amount = (deployable * strategies[i].weight) / totalWeight;

            if (amount > 0) {
                asset.transfer(strategies[i].strategy, amount);
                IStrategy(strategies[i].strategy).deposit(amount);
                strategies[i].debt += amount;
            }
        }
    }

    // ---------- CORE ----------

    function deposit(uint256 amount) external {
        require(amount > 0, "Invalid");

        accrueFees();

        uint256 sharesOut = convertToShares(amount);

        asset.transferFrom(msg.sender, address(this), amount);

        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;

        emit Deposit(msg.sender, amount, sharesOut);

        _allocate();
    }

    function withdraw(uint256 shareAmount) external {
        require(shareAmount > 0, "Invalid");
        require(shares[msg.sender] >= shareAmount, "Insufficient");

        accrueFees();

        uint256 grossAssets = convertToAssets(shareAmount);

        require(
            grossAssets <= (totalAssets() * maxWithdrawBps) / 10000,
            "Withdraw too large"
        );

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;

        uint256 penalty = _inWithdrawalWindow() ? 0 : applyPenalty(grossAssets);
        uint256 assetsOut = grossAssets - penalty;

        _pullLiquidity(assetsOut);
        uint256 available = asset.balanceOf(address(this));
        if (assetsOut > available) assetsOut = available;
        require(assetsOut > 0, "Insufficient liquidity");

        asset.transfer(msg.sender, assetsOut);

        if (penalty > 0) {
            emit PenaltyApplied(msg.sender, grossAssets, penalty);
        }
        emit Withdraw(msg.sender, assetsOut);
    }

    function requestWithdraw(uint256 shareAmount) external {
        require(shareAmount > 0, "Invalid");
        require(shares[msg.sender] >= shareAmount, "Insufficient");
        require(withdrawRequests[msg.sender].shares == 0, "Pending request");

        shares[msg.sender] -= shareAmount;
        withdrawRequests[msg.sender] = WithdrawRequest({
            shares: shareAmount,
            requestTime: block.timestamp
        });

        emit WithdrawRequested(msg.sender, shareAmount);
    }

    function executeWithdraw() external {
        WithdrawRequest memory request = withdrawRequests[msg.sender];
        require(request.shares > 0, "No request");

        accrueFees();

        uint256 grossAssets = convertToAssets(request.shares);
        require(
            grossAssets <= (totalAssets() * maxWithdrawBps) / 10000,
            "Withdraw too large"
        );

        delete withdrawRequests[msg.sender];
        totalShares -= request.shares;

        uint256 penalty = _inWithdrawalWindow() ? 0 : applyPenalty(grossAssets);
        uint256 assetsOut = grossAssets - penalty;

        _pullLiquidity(assetsOut);
        uint256 available = asset.balanceOf(address(this));
        if (assetsOut > available) assetsOut = available;
        require(assetsOut > 0, "Insufficient liquidity");

        asset.transfer(msg.sender, assetsOut);

        if (penalty > 0) {
            emit PenaltyApplied(msg.sender, grossAssets, penalty);
        }
        emit Withdraw(msg.sender, assetsOut);
    }

    function applyPenalty(uint256 amount) public view returns (uint256) {
        return (amount * penaltyBps) / 10000;
    }

    function _pullLiquidity(uint256 amount) internal {
        uint256 idle = asset.balanceOf(address(this));
        if (idle >= amount) return;

        uint256 needed = amount - idle;

        for (uint256 i = 0; i < strategies.length && needed > 0; i++) {
            uint256 beforeBal = asset.balanceOf(address(this));
            IStrategy(strategies[i].strategy).withdraw(needed);
            uint256 received = asset.balanceOf(address(this)) - beforeBal;

            if (received >= needed) needed = 0;
            else needed -= received;
        }
    }

    function _payAvailable(address to, uint256 amount) internal returns (uint256 paid) {
        if (amount == 0) return 0;

        _pullLiquidity(amount);
        uint256 available = asset.balanceOf(address(this));
        paid = amount > available ? available : amount;

        if (paid > 0) asset.transfer(to, paid);
    }

    function receiveYield(uint256 amount) external {
        require(amount > 0, "Invalid");
        lastTotalAssets += amount;
    }

    // ---------- ADMIN ----------

    function addStrategy(address _strategy, uint256 _weight) external onlyOwner {
        require(_strategy != address(0), "Invalid");

        strategies.push(StrategyData({
            strategy: _strategy,
            weight: _weight,
            debt: 0,
            lastSnapshotAssets: 0,
            lastSnapshotTime: 0,
            oracleAssets: 0,
            lastOracleUpdate: 0
        }));

        totalWeight += _weight;
    }

    function _inWithdrawalWindow() internal view returns (bool) {
        if (withdrawalWindowStart == 0) return false;
        uint256 elapsed = block.timestamp >= withdrawalWindowStart
            ? (block.timestamp - withdrawalWindowStart) % 30 days
            : 30 days - ((withdrawalWindowStart - block.timestamp) % 30 days);
        return elapsed < withdrawalWindowDuration;
    }
}
