// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Marketplace is ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

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

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed token,
        uint256 dealId,
        uint256 amount,
        uint256 pricePerShare
    );
    event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalPrice);
    event ListingCancelled(uint256 indexed listingId);

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);
    }

    function createListing(address token, uint256 dealId, uint256 amount, uint256 pricePerShare)
        external
        nonReentrant
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

        emit ListingCreated(listingId, msg.sender, token, dealId, amount, pricePerShare);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Inactive");
        require(msg.sender == listing.seller, "Not seller");

        uint256 remaining = listing.amountRemaining;
        listing.amountRemaining = 0;
        listing.active = false;

        IERC1155(listing.token).safeTransferFrom(address(this), listing.seller, listing.dealId, remaining, "");
        emit ListingCancelled(listingId);
    }

    function fillListing(uint256 listingId, uint256 amount) external nonReentrant {
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

        emit ListingFilled(listingId, msg.sender, amount, totalPrice);
    }

    function getOrderbook(uint256 dealId) external view returns (uint256[] memory) {
        return orderbookByDeal[dealId];
    }
}
