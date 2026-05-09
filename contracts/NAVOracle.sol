// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract NAVOracle is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct NAVReport {
        uint256 nav;
        uint256 timestamp;
    }

    mapping(address => NAVReport) public reports;

    event NAVUpdated(address indexed vault, uint256 nav, uint256 timestamp);

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function updateNAV(address vault, uint256 nav) external onlyRole(OPERATOR_ROLE) {
        require(vault != address(0), "Invalid vault");
        reports[vault] = NAVReport(nav, block.timestamp);
        emit NAVUpdated(vault, nav, block.timestamp);
    }

    function latestNAV(address vault) external view returns (uint256 nav, uint256 timestamp) {
        NAVReport memory report = reports[vault];
        return (report.nav, report.timestamp);
    }
}
