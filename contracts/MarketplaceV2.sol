// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MarketplaceV2 is AccessControl, ERC1155Holder, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable usdc;
    uint256 public nextListingId;

    struct Listing {
        address seller;
        address token;
        uint256 dealId;
        uint256 amountRemaining;
        uint256 pricePerShare;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256[]) private orderbookByDeal;
    mapping(address => uint256[]) private listingsBySeller;

    event MarketplaceListingCreated(
        uint256 indexed listingId,
        uint256 indexed dealId,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 pricePerShare
    );

    event MarketplaceListingFilled(
        uint256 indexed listingId,
        uint256 indexed dealId,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint256 totalPrice,
        uint256 amountRemaining
    );

    event MarketplaceListingCancelled(
        uint256 indexed listingId,
        uint256 indexed dealId,
        address indexed seller,
        address token,
        uint256 returnedShares
    );

    event MarketplacePaused(address indexed operator, bool paused);

    constructor(address _usdc, address admin) {
        require(_usdc != address(0), "Invalid USDC");
        require(admin != address(0), "Invalid admin");

        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function createListing(address token, uint256 dealId, uint256 amount, uint256 pricePerShare)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 listingId)
    {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Invalid amount");
        require(pricePerShare > 0, "Invalid price");

        listingId = nextListingId++;
        IERC1155(token).safeTransferFrom(msg.sender, address(this), dealId, amount, "");

        listings[listingId] = Listing({
            seller: msg.sender,
            token: token,
            dealId: dealId,
            amountRemaining: amount,
            pricePerShare: pricePerShare,
            active: true
        });
        orderbookByDeal[dealId].push(listingId);
        listingsBySeller[msg.sender].push(listingId);

        emit MarketplaceListingCreated(listingId, dealId, msg.sender, token, amount, pricePerShare);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Inactive");
        require(msg.sender == listing.seller, "Not seller");

        uint256 remaining = listing.amountRemaining;
        listing.amountRemaining = 0;
        listing.active = false;

        IERC1155(listing.token).safeTransferFrom(address(this), listing.seller, listing.dealId, remaining, "");
        emit MarketplaceListingCancelled(listingId, listing.dealId, listing.seller, listing.token, remaining);
    }

    function fillListing(uint256 listingId, uint256 amount) external nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        require(listing.active, "Inactive");
        require(amount > 0 && amount <= listing.amountRemaining, "Invalid amount");

        uint256 totalPrice = amount * listing.pricePerShare;
        listing.amountRemaining -= amount;
        if (listing.amountRemaining == 0) {
            listing.active = false;
        }

        usdc.safeTransferFrom(msg.sender, listing.seller, totalPrice);
        IERC1155(listing.token).safeTransferFrom(address(this), msg.sender, listing.dealId, amount, "");

        emit MarketplaceListingFilled(
            listingId,
            listing.dealId,
            msg.sender,
            listing.seller,
            amount,
            totalPrice,
            listing.amountRemaining
        );
    }

    function getOrderbook(uint256 dealId) external view returns (uint256[] memory) {
        return orderbookByDeal[dealId];
    }

    function getSellerListings(address seller) external view returns (uint256[] memory) {
        return listingsBySeller[seller];
    }

    function pauseMarketplace(bool paused) external onlyRole(OPERATOR_ROLE) {
        if (paused) _pause();
        else _unpause();
        emit MarketplacePaused(msg.sender, paused);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
