const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MarketplaceV2", function () {
  async function deployFixture() {
    const [admin, operator, seller, buyer] = await ethers.getSigners();
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const usdc = await ERC20Mock.deploy("Mock USDC", "USDC", admin.address, ethers.parseUnits("1000000", 6));

    const DealVaultFactoryV2 = await ethers.getContractFactory("DealVaultFactoryV2");
    const factory = await DealVaultFactoryV2.deploy(await usdc.getAddress(), admin.address);
    await factory.grantRole(await factory.OPERATOR_ROLE(), operator.address);

    const latest = await ethers.provider.getBlock("latest");
    const tx = await factory.connect(operator).createDeal(
      "Northstar Solar Income Pool",
      "deal-metadata-001",
      "ipfs://deal",
      ethers.parseUnits("500", 6),
      ethers.parseUnits("100", 6),
      ethers.parseUnits("10", 6),
      latest.timestamp + 30 * 24 * 60 * 60,
    );
    const receipt = await tx.wait();
    const event = receipt.logs.map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return undefined;
      }
    }).find((log) => log?.name === "DealCreated");
    const deal = await ethers.getContractAt("DealVaultV2", event.args.dealVault);

    const MarketplaceV2 = await ethers.getContractFactory("MarketplaceV2");
    const marketplace = await MarketplaceV2.deploy(await usdc.getAddress(), admin.address);
    await marketplace.grantRole(await marketplace.OPERATOR_ROLE(), operator.address);

    await usdc.mint(seller.address, ethers.parseUnits("1000", 6));
    await usdc.mint(buyer.address, ethers.parseUnits("1000", 6));

    const investment = ethers.parseUnits("100", 6);
    await usdc.connect(seller).approve(await deal.getAddress(), investment);
    await deal.connect(seller).invest(investment);

    return { admin, operator, seller, buyer, usdc, deal, marketplace };
  }

  it("creates a listing and indexes it by deal and seller", async function () {
    const { seller, deal, marketplace } = await deployFixture();
    const dealAddress = await deal.getAddress();

    await deal.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await expect(marketplace.connect(seller).createListing(dealAddress, 0, 5, ethers.parseUnits("12", 6)))
      .to.emit(marketplace, "MarketplaceListingCreated")
      .withArgs(0, 0, seller.address, dealAddress, 5, ethers.parseUnits("12", 6));

    expect(await marketplace.getOrderbook(0)).to.deep.equal([0n]);
    expect(await marketplace.getSellerListings(seller.address)).to.deep.equal([0n]);
  });

  it("partially fills a listing and emits remaining shares", async function () {
    const { seller, buyer, usdc, deal, marketplace } = await deployFixture();
    const dealAddress = await deal.getAddress();
    const price = ethers.parseUnits("12", 6);

    await deal.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(seller).createListing(dealAddress, 0, 5, price);
    await usdc.connect(buyer).approve(await marketplace.getAddress(), ethers.parseUnits("24", 6));

    await expect(marketplace.connect(buyer).fillListing(0, 2))
      .to.emit(marketplace, "MarketplaceListingFilled")
      .withArgs(0, 0, buyer.address, seller.address, 2, ethers.parseUnits("24", 6), 3);

    const listing = await marketplace.listings(0);
    expect(listing.amountRemaining).to.equal(3);
    expect(listing.active).to.equal(true);
    expect(await deal.getShareBalance(buyer.address)).to.equal(2);
  });

  it("cancels a listing and returns remaining shares", async function () {
    const { seller, deal, marketplace } = await deployFixture();
    const dealAddress = await deal.getAddress();

    await deal.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(seller).createListing(dealAddress, 0, 5, ethers.parseUnits("12", 6));

    await expect(marketplace.connect(seller).cancelListing(0))
      .to.emit(marketplace, "MarketplaceListingCancelled")
      .withArgs(0, 0, seller.address, dealAddress, 5);

    expect(await deal.getShareBalance(seller.address)).to.equal(10);
  });

  it("pauses fills and new listings while allowing seller cancellation", async function () {
    const { operator, seller, buyer, usdc, deal, marketplace } = await deployFixture();
    const dealAddress = await deal.getAddress();

    await deal.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(seller).createListing(dealAddress, 0, 5, ethers.parseUnits("12", 6));
    await expect(marketplace.connect(operator).pauseMarketplace(true))
      .to.emit(marketplace, "MarketplacePaused")
      .withArgs(operator.address, true);

    await expect(marketplace.connect(seller).createListing(dealAddress, 0, 1, ethers.parseUnits("12", 6)))
      .to.be.revertedWithCustomError(marketplace, "EnforcedPause");
    await usdc.connect(buyer).approve(await marketplace.getAddress(), ethers.parseUnits("12", 6));
    await expect(marketplace.connect(buyer).fillListing(0, 1)).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

    await expect(marketplace.connect(seller).cancelListing(0))
      .to.emit(marketplace, "MarketplaceListingCancelled");
  });
});
