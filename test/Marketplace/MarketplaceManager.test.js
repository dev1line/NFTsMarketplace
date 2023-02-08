const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const { parseEther, formatBytes32String } = ethers.utils;
const { MaxUint256: MAX_UINT_256, AddressZero: ADDRESS_ZERO } = ethers.constants;

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const NFT_TYPE721 = 0;
const NFT_TYPE1155 = 1;

const MARKET_ITEM_STATUS = {
    LISTING: 0,
    SOLD: 1,
    CANCELED: 2,
};

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3, treasury] = await ethers.getSigners();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(ADDRESS_ZERO, true);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, admin.address]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, ["NFT Marketplace", "nMTVS", 250, admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, ["NFT test", "NFT", token.address, 250, PRICE, admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();
        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            user3.address,
            user3.address,
            mkpManager.address,
        ]);

        MTVSManager = await ethers.getContractFactory("MarketplaceManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            mkpManager.address,
            collectionFactory.address,
            admin.address,
        ]);
        await admin.connect(owner).setAdmin(mtvsManager.address, true);
        await admin.setPermittedPaymentToken(token.address, true);
        await mkpManager.setMarketplaceManager(mtvsManager.address);
        await mkpManager.setOrderManager(orderManager.address);
        merkleTree = generateMerkleTree([user1.address, user2.address]);
        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(MkpManager, [ADDRESS_ZERO])).to.revertedWith(
                `InValidAdminContract("${ADDRESS_ZERO}")`
            );
            await expect(upgrades.deployProxy(MkpManager, [user1.address])).to.reverted;
            await expect(upgrades.deployProxy(MkpManager, [treasury.address])).to.reverted;
        });
    });

    describe("setMarketplaceManager function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setMarketplaceManager(mtvsManager.address)).to.revertedWith(
                "allerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when Invalid MarketplaceManager contract", async () => {
            await expect(mkpManager.setMarketplaceManager(ADDRESS_ZERO)).to.revertedWith(
                `InValidMarketplaceManagerContract("${ADDRESS_ZERO}")`
            );
            await expect(mkpManager.setMarketplaceManager(user1.address)).to.reverted;
            await expect(mkpManager.setMarketplaceManager(mkpManager.address)).to.reverted;
        });

        it("should set MarketplaceManager success: ", async () => {
            expect(await mkpManager.MarketplaceManager()).to.equal(ADDRESS_ZERO);

            await mkpManager.setMarketplaceManager(mtvsManager.address);
            expect(await mkpManager.MarketplaceManager()).to.equal(mtvsManager.address);
        });
    });

    describe("setOrder function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setOrderManager(orderManager.address)).to.revertedWith(
                "allerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when Invalid Order contract", async () => {
            await expect(mkpManager.setOrderManager(ADDRESS_ZERO)).to.revertedWith(
                `InValidOrderContract("${ADDRESS_ZERO}")`
            );
            await expect(mkpManager.setOrderManager(user1.address)).to.reverted;
            await expect(mkpManager.setOrderManager(mkpManager.address)).to.reverted;
        });

        it("should set MarketplaceManager success: ", async () => {
            expect(await mkpManager.orderManager()).to.equal(ADDRESS_ZERO);

            await mkpManager.setOrderManager(orderManager.address);
            expect(await mkpManager.orderManager()).to.equal(orderManager.address);
        });
    });

    describe("extTransferNFTCall function:", async () => {
        it("Only order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extTransferNFTCall(tokenERC721.address, 1, 1, mkpManager.address, user1.address)
            ).to.revertedWith("CallerIsNotOrderManager()");
        });
    });

    describe("extCreateMarketInfo function:", async () => {
        beforeEach(async () => {
            current = await getCurrentTime();
        });

        it("Only Marketplace Manger or Order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extCreateMarketInfo(
                        tokenERC721.address,
                        1,
                        1,
                        parseEther("1"),
                        user1.address,
                        current,
                        add(current, 600),
                        token.address,
                        rootHash
                    )
            ).to.revertedWith("CallerIsNotOrderManagerOrMTVSManager()");
        });

        it("should revert when Invalid time", async () => {
            startTime = (await getCurrentTime()) + 3600;
            endTime = startTime + 86400;

            await expect(
                mtvsManager
                    .connect(user2)
                    .createNFT(true, 0, 1, "this_uri", ONE_ETHER, 0, endTime, token.address, merkleTree.getHexRoot())
            ).to.be.revertedWith("InvalidTimeForCreate()");

            await expect(
                mtvsManager
                    .connect(user2)
                    .createNFT(
                        true,
                        0,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        endTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.be.revertedWith("InvalidTimeForCreate()");
        });

        it("should revert when Payment token is not supported", async () => {
            startTime = (await getCurrentTime()) + 3600;
            endTime = startTime + 86400;

            await expect(
                mtvsManager
                    .connect(user2)
                    .createNFT(
                        true,
                        0,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        tokenERC721.address,
                        merkleTree.getHexRoot()
                    )
            ).to.be.revertedWith("PaymentTokenIsNotSupported()");
        });

        it("should be ok", async () => {
            startTime = (await getCurrentTime()) + 3600;
            endTime = startTime + 86400;

            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            let marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.nftContractAddress).to.equal(tokenMintERC721.address);
            expect(marketItem.tokenId).to.equal(1);
            expect(marketItem.amount).to.equal(1);
            expect(marketItem.price).to.equal(ONE_ETHER);
            expect(marketItem.nftType).to.equal(0);
            expect(marketItem.seller).to.equal(user2.address);
            expect(marketItem.buyer).to.equal(ADDRESS_ZERO);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.LISTING);
            expect(marketItem.startTime).to.equal(startTime);
            expect(marketItem.endTime).to.equal(endTime);
            expect(marketItem.paymentToken).to.equal(token.address);
            expect(await mkpManager.isPrivate(marketItemId)).to.be.true;
        });
    });

    describe("setNewRootHash function:", async () => {
        beforeEach(async () => {
            newMerkleTree = generateMerkleTree([user1.address, user3.address]);
            newRootHash = newMerkleTree.getHexRoot();

            await mkpManager.setCollectionFactory(collectionFactory.address);

            await collectionFactory.connect(user1).create(0, "NFT", "NFT", user1.address, 250);
            collection1 = await collectionFactory.collectionIdToCollectionInfos(1);
            await collectionFactory.connect(user2).create(0, "NFT", "NFT", user2.address, 250);
            collection2 = await collectionFactory.collectionIdToCollectionInfos(2);
        });

        it("Only owner can set root hash", async () => {
            await expect(
                mkpManager.connect(user2).setNewRootHash(collection1.collectionAddress, newRootHash)
            ).to.revertedWith(`UserDidNotCreateCollection()`);
        });

        it("should be ok: ", async () => {
            expect(await mkpManager.nftAddressToRootHash(collection1.collectionAddress)).to.equal(
                formatBytes32String("")
            );
            await mkpManager.connect(user1).setNewRootHash(collection1.collectionAddress, newRootHash);
            expect(await mkpManager.nftAddressToRootHash(collection1.collectionAddress)).to.equal(newRootHash);
        });
    });

    describe("fetchMarketItemsByMarketID function:", async () => {
        it("should return market item corresponding market ID", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            let current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            const fetchId721 = await mkpManager.fetchMarketItemsByMarketID(1);
            expect(fetchId721.price.toString()).to.equal(ONE_ETHER);
        });
    });

    describe("getCurrentMarketItem function:", async () => {
        it("should return current market item id", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            let current = await getCurrentTime();

            expect(await mkpManager.getCurrentMarketItem()).to.equal(0);

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            expect(await mkpManager.getCurrentMarketItem()).to.equal(1);
        });
    });

    describe("wasBuyer function:", async () => {
        it("should return current market item id", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
            const marketItemId = await mkpManager.getCurrentMarketItem();

            expect(await mkpManager.wasBuyer(user2.address), false);
            await skipTime(10);
            await metaCitizen.mint(user2.address);
            await orderManager.connect(user2).buy(marketItemId, merkleTree.getHexProof(generateLeaf(user2.address)));

            expect(await mkpManager.wasBuyer(user2.address), true);
        });
    });

    describe("getRoyaltyInfo function:", async () => {
        it("should return correct royalInfo: ", async () => {
            await tokenMintERC721.mint(mkpManager.address, "this_uri");
            const royalInfos = await mkpManager.getRoyaltyInfo(tokenMintERC721.address, 1, 1000000000);

            expect(royalInfos[0].toString()).to.equal(treasury.address);
            expect(royalInfos[1]).to.equal((1000000000 * 250) / 10000);
        });
    });

    describe("getListingFee function:", async () => {
        it("should return listingFee: ", async () => {
            expect(await mkpManager.getListingFee(1e5)).to.equal(2500);
        });
    });

    describe("isRoyalty function:", async () => {
        beforeEach(async () => {
            await mkpManager.setCollectionFactory(collectionFactory.address);

            await collectionFactory.connect(user1).create(0, "NFT", "NFT", user1.address, 250);
            collection1 = await collectionFactory.collectionIdToCollectionInfos(1);
            await collectionFactory.connect(user2).create(0, "NFT", "NFT", user2.address, 250);
            collection2 = await collectionFactory.collectionIdToCollectionInfos(2);
        });

        it("should check royalty: ", async () => {
            expect(await mkpManager.isRoyalty(collection1.collectionAddress)).to.equal(true);
        });
    });

    describe("getMarketItemIdToMarketItem function:", async () => {
        it("should be return market item", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
            const marketItemId = await mkpManager.getCurrentMarketItem();

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.startTime).to.equal(startTime);
            expect(marketItem.endTime).to.equal(endTime);
        });
    });

    describe("setMarketItemIdToMarketItem function:", async () => {
        beforeEach(async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
        });

        it("Only order contract can call this function", async () => {
            marketItem.amount = 100;
            marketItem.price = 0;
            await expect(
                mkpManager.connect(user1).setMarketItemIdToMarketItem(marketItemId, marketItem)
            ).to.revertedWith("CallerIsNotOrderManager()");
        });
    });
});
