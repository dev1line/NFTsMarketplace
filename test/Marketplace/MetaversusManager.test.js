const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { add } = require("js-big-decimal");
const { generateMerkleTree, generateLeaf, getCurrentTime } = require("../utils");

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const AMOUNT = ethers.utils.parseEther("1000000000000");
const ONE_ETHER = ethers.utils.parseEther("1");
const ONE_DAY = 86400;
const ONE_HOUR = 3600;
const NFTType = { ERC721: 0, ERC1155: 1 };

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        startTime = (await getCurrentTime()) + ONE_HOUR;
        endTime = startTime + ONE_DAY;

        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, ["NFT Marketplace", "nMTVS", 250, admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        // Collection
        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();

        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            AddressZero,
            user1.address,
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

        await collectionFactory.setMarketplaceManager(mtvsManager.address);
        await mkpManager.setMarketplaceManager(mtvsManager.address);
        await admin.setPermittedPaymentToken(token.address, true);
    });

    describe("Deployment:", async () => {
        it("Should be revert when NFT721 Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    AddressZero,
                    tokenMintERC1155.address,
                    token.address,
                    mkpManager.address,
                    collectionFactory.address,
                    admin.address,
                ])
            ).to.be.revertedWith(`InValidTokenMintERC721Contract("${AddressZero}")`);
        });

        it("Should be revert when NFT1155 Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    AddressZero,
                    token.address,
                    mkpManager.address,
                    collectionFactory.address,
                    admin.address,
                ])
            ).to.be.reverted;
        });

        it("Should be revert when token Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    AddressZero,
                    mkpManager.address,
                    collectionFactory.address,
                    admin.address,
                ])
            ).to.be.reverted;
        });

        it("Should be revert when Marketplace Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    AddressZero,
                    collectionFactory.address,
                    admin.address,
                ])
            ).to.be.reverted;
        });

        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    mkpManager.address,
                    collectionFactory.address,
                    AddressZero,
                ])
            ).to.revertedWith(`InValidAdminContract("${AddressZero}")`);
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    mkpManager.address,
                    collectionFactory.address,
                    user1.address,
                ])
            ).to.reverted;
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    mkpManager.address,
                    collectionFactory.address,
                    treasury.address,
                ])
            ).to.reverted;
        });

        it("Check all address token were set: ", async () => {
            expect(await mtvsManager.paymentToken()).to.equal(token.address);
            expect(await mtvsManager.tokenMintERC721()).to.equal(tokenMintERC721.address);
            expect(await mtvsManager.tokenMintERC1155()).to.equal(tokenMintERC1155.address);
            expect(await mtvsManager.collectionFactory()).to.equal(collectionFactory.address);
            expect(await mtvsManager.marketplace()).to.equal(mkpManager.address);
        });
    });

    describe("setMarketplace function:", async () => {
        it("Only admin can call this function", async () => {
            await expect(mtvsManager.connect(user1).setMarketplace(user2.address)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when address equal to zero address: ", async () => {
            await expect(mtvsManager.setMarketplace(AddressZero)).to.be.revertedWith(
                `InValidMarketplaceManagerContract("${AddressZero}")`
            );
        });

        it("should set marketplace address success: ", async () => {
            const mkpManager_v2 = await upgrades.deployProxy(MkpManager, [admin.address]);
            await mtvsManager.setMarketplace(mkpManager_v2.address);
            expect(await mtvsManager.marketplace()).to.equal(mkpManager_v2.address);
        });
    });

    describe("setCollectionFactory function:", async () => {
        it("Only admin can call this function", async () => {
            await expect(mtvsManager.connect(user1).setCollectionFactory(user2.address)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when address equal to zero address: ", async () => {
            await expect(mtvsManager.setCollectionFactory(AddressZero)).to.be.revertedWith(
                `InValidCollectionFactoryContract("${AddressZero}")`
            );
        });

        it("should set collectionFactory address success: ", async () => {
            const collectionFactory_v2 = await upgrades.deployProxy(CollectionFactory, [
                tokenERC721.address,
                tokenERC1155.address,
                admin.address,
                user1.address,
                user2.address,
            ]);
            await mtvsManager.setCollectionFactory(collectionFactory_v2.address);
            expect(await mtvsManager.collectionFactory()).to.equal(collectionFactory_v2.address);
        });
    });

    describe("createNFT function:", async () => {
        beforeEach(async () => {
            merkleTree = generateMerkleTree([user1.address, user2.address]);
        });

        it("should revert when contract pause: ", async () => {
            await mtvsManager.setPause(true);
            await admin.setAdmin(mtvsManager.address, true);

            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFT(
                        true,
                        NFTType.ERC1155,
                        0,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert when amount equal to zero amount: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFT(
                        true,
                        NFTType.ERC1155,
                        0,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    ),
                token.address
            ).to.be.revertedWith("InvalidAmount()");
        });

        it("should revert when amount equal to zero price: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFT(
                        true,
                        NFTType.ERC1155,
                        1,
                        "this_uri",
                        0,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    ),
                token.address
            ).to.be.revertedWith("InvalidAmount()");
        });

        it("should create NFT success: ", async () => {
            await admin.setAdmin(mtvsManager.address, true);
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    NFTType.ERC721,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            // check owner nft
            let curentId = await tokenMintERC721.getTokenCounter();
            expect(await tokenMintERC721.ownerOf(curentId)).to.equal(mkpManager.address);

            let lastMarketItemId = await mkpManager.getCurrentMarketItem();
            let marketItem = await mkpManager.fetchMarketItemsByMarketID(lastMarketItemId);

            expect(marketItem.nftContractAddress).to.equal(tokenMintERC721.address, "Invalid nftContractAddress");
            expect(marketItem.tokenId).to.equal(curentId, "Invalid tokenId");
            expect(marketItem.amount).to.equal(1, "Invalid amount");
            expect(marketItem.price).to.equal(ONE_ETHER), "Invalid price";
            expect(marketItem.nftType).to.equal(NFTType.ERC721, "Invalid nftType");
            expect(marketItem.seller).to.equal(user2.address, "Invalid seller");
            expect(marketItem.buyer).to.equal(AddressZero, "Invalid buyer");
            expect(marketItem.status).to.equal(0, "Invalid status");
            expect(marketItem.startTime).to.equal(startTime, "Invalid startTime");
            expect(marketItem.endTime).to.equal(endTime, "Invalid endTime");
            expect(marketItem.paymentToken).to.equal(token.address, "Invalid paymentToken");

            const amount = 100;

            await admin.setPermittedPaymentToken(token.address, true);
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    NFTType.ERC1155,
                    amount,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            curentId = await tokenMintERC1155.getTokenCounter();
            const balanceOf = await tokenMintERC1155.balanceOf(mkpManager.address, curentId);

            expect(balanceOf).to.equal(amount);

            lastMarketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.fetchMarketItemsByMarketID(lastMarketItemId);

            expect(marketItem.nftContractAddress).to.equal(tokenMintERC1155.address, "Invalid nftContractAddress");
            expect(marketItem.tokenId).to.equal(curentId, "Invalid tokenId");
            expect(marketItem.amount).to.equal(amount, "Invalid amount");
            expect(marketItem.price).to.equal(ONE_ETHER), "Invalid price";
            expect(marketItem.nftType).to.equal(NFTType.ERC1155, "Invalid nftType");
            expect(marketItem.seller).to.equal(user2.address, "Invalid seller");
            expect(marketItem.buyer).to.equal(AddressZero, "Invalid buyer");
            expect(marketItem.status).to.equal(0, "Invalid status");
            expect(marketItem.startTime).to.equal(startTime, "Invalid startTime");
            expect(marketItem.endTime).to.equal(endTime, "Invalid endTime");
            expect(marketItem.paymentToken).to.equal(token.address, "Invalid paymentToken");
        });

        it("should create NFT to Wallet success: ", async () => {
            await admin.setAdmin(mtvsManager.address, true);
            await expect(() =>
                mtvsManager
                    .connect(user2)
                    .createNFT(
                        false,
                        NFTType.ERC721,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.changeTokenBalance(tokenMintERC721, user2, 1);

            // check owner nft
            let curentId = await tokenMintERC721.getTokenCounter();
            expect(await tokenMintERC721.ownerOf(curentId)).to.equal(user2.address);

            const amount = 100;

            await admin.setPermittedPaymentToken(token.address, true);
            await mtvsManager
                .connect(user2)
                .createNFT(
                    false,
                    NFTType.ERC1155,
                    amount,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            curentId = await tokenMintERC1155.getTokenCounter();
            const balanceOf = await tokenMintERC1155.balanceOf(user2.address, curentId);

            expect(balanceOf).to.equal(amount);
        });

        it("should create and sale NFT success: ", async () => {
            await admin.setAdmin(mtvsManager.address, true);

            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    NFTType.ERC721,
                    1,
                    "this_uri",
                    1000,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            // check owner nft
            let curentId = await tokenMintERC721.getTokenCounter();
            expect(await tokenMintERC721.ownerOf(curentId)).to.equal(mkpManager.address);

            let lastMarketItemId = await mkpManager.getCurrentMarketItem();
            let marketItem = await mkpManager.fetchMarketItemsByMarketID(lastMarketItemId);

            expect(marketItem.nftContractAddress).to.equal(tokenMintERC721.address, "Invalid nftContractAddress");
            expect(marketItem.tokenId).to.equal(curentId, "Invalid tokenId");
            expect(marketItem.amount).to.equal(1, "Invalid amount");
            expect(marketItem.price).to.equal(1000), "Invalid price";
            expect(marketItem.nftType).to.equal(NFTType.ERC721, "Invalid nftType");
            expect(marketItem.seller).to.equal(user2.address, "Invalid seller");
            expect(marketItem.buyer).to.equal(AddressZero, "Invalid buyer");
            expect(marketItem.status).to.equal(0, "Invalid status");
            expect(marketItem.startTime).to.equal(startTime, "Invalid startTime");
            expect(marketItem.endTime).to.equal(endTime, "Invalid endTime");
            expect(marketItem.paymentToken).to.equal(token.address, "Invalid paymentToken");
        });
    });

    describe("createNFT limit function:", async () => {
        beforeEach(async () => {
            await collectionFactory.connect(user2).create(0, "NFT", "NFT", user1.address, 250);
            await collectionFactory.connect(user2).create(1, "NFT1155", "NFT1155", user1.address, 250);

            collection_1 = await collectionFactory.collectionIdToCollectionInfos(1);
            collection_2 = await collectionFactory.collectionIdToCollectionInfos(2);

            nft_721 = await TokenERC721.attach(collection_1.collectionAddress);
            nft_1155 = await TokenERC1155.attach(collection_2.collectionAddress);

            merkleTree = generateMerkleTree([user1.address, user2.address]);

            merkleTreeNull = generateMerkleTree([]);

            await admin.setPermittedPaymentToken(token.address, true);
        });

        it("should revert when amount equal to zero amount: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFTLimit(
                        true,
                        nft_721.address,
                        0,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.be.revertedWith("InvalidAmount()");
        });

        it("should revert when amount equal to zero price: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFT(
                        true,
                        NFTType.ERC1155,
                        1,
                        "this_uri",
                        0,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    ),
                token.address
            ).to.be.revertedWith("InvalidAmount()");
        });

        it("should revert when contract pause: ", async () => {
            await mtvsManager.setPause(true);
            await expect(
                mtvsManager
                    .connect(user2)
                    .createNFTLimit(
                        true,
                        nft_721.address,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert User is not create collection: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFTLimit(
                        true,
                        nft_721.address,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.be.revertedWith("UserDidNotCreateCollection()");
        });

        it("should create NFT success: ", async () => {
            await mtvsManager
                .connect(user2)
                .createNFTLimit(
                    true,
                    nft_721.address,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            let curentId = await nft_721.getTokenCounter();

            // check owner nft
            expect(await nft_721.ownerOf(curentId)).to.equal(mkpManager.address);

            let lastMarketItemId = await mkpManager.getCurrentMarketItem();
            let marketItem = await mkpManager.fetchMarketItemsByMarketID(lastMarketItemId);

            expect(marketItem.nftContractAddress).to.equal(nft_721.address, "Invalid nftContractAddress");
            expect(marketItem.tokenId).to.equal(curentId, "Invalid tokenId");
            expect(marketItem.amount).to.equal(1, "Invalid amount");
            expect(marketItem.price).to.equal(ONE_ETHER), "Invalid price";
            expect(marketItem.nftType).to.equal(NFTType.ERC721, "Invalid nftType");
            expect(marketItem.seller).to.equal(user2.address, "Invalid seller");
            expect(marketItem.buyer).to.equal(AddressZero, "Invalid buyer");
            expect(marketItem.status).to.equal(0, "Invalid status");
            expect(marketItem.startTime).to.equal(startTime, "Invalid startTime");
            expect(marketItem.endTime).to.equal(endTime, "Invalid endTime");
            expect(marketItem.paymentToken).to.equal(token.address, "Invalid paymentToken");

            const amount = 100;

            await mtvsManager
                .connect(user2)
                .createNFTLimit(
                    true,
                    nft_1155.address,
                    amount,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTreeNull.getHexRoot()
                );

            curentId = await nft_1155.getTokenCounter();
            const balanceOf = await nft_1155.balanceOf(mkpManager.address, curentId);

            expect(balanceOf).to.equal(amount);

            lastMarketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.fetchMarketItemsByMarketID(lastMarketItemId);

            expect(marketItem.nftContractAddress).to.equal(nft_1155.address, "Invalid nftContractAddress");
            expect(marketItem.tokenId).to.equal(curentId, "Invalid tokenId");
            expect(marketItem.amount).to.equal(amount, "Invalid amount");
            expect(marketItem.price).to.equal(ONE_ETHER), "Invalid price";
            expect(marketItem.nftType).to.equal(NFTType.ERC1155, "Invalid nftType");
            expect(marketItem.seller).to.equal(user2.address, "Invalid seller");
            expect(marketItem.buyer).to.equal(AddressZero, "Invalid buyer");
            expect(marketItem.status).to.equal(0, "Invalid status");
            expect(marketItem.startTime).to.equal(startTime, "Invalid startTime");
            expect(marketItem.endTime).to.equal(endTime, "Invalid endTime");
            expect(marketItem.paymentToken).to.equal(token.address, "Invalid paymentToken");
        });

        it("should create NFT to Wallet success: ", async () => {
            await expect(() =>
                mtvsManager
                    .connect(user2)
                    .createNFTLimit(
                        false,
                        nft_721.address,
                        1,
                        "this_uri",
                        ONE_ETHER,
                        startTime,
                        endTime,
                        token.address,
                        merkleTree.getHexRoot()
                    )
            ).to.changeTokenBalance(nft_721, user2, 1);

            let curentId = await nft_721.getTokenCounter();

            // check owner nft
            expect(await nft_721.ownerOf(curentId)).to.equal(user2.address);

            const amount = 100;

            await mtvsManager
                .connect(user2)
                .createNFTLimit(
                    false,
                    nft_1155.address,
                    amount,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTreeNull.getHexRoot()
                );

            curentId = await nft_1155.getTokenCounter();
            const balanceOf = await nft_1155.balanceOf(user2.address, curentId);

            expect(balanceOf).to.equal(amount);
        });
    });

    describe("buyTicketEvent function:", async () => {
        it("should revert when amount equal to zero amount: ", async () => {
            await expect(mtvsManager.connect(user1).buyTicketEvent(1, 0)).to.be.revertedWith("InvalidAmount()");
        });

        it("should revert when contract pause: ", async () => {
            const price = 10000;
            await expect(mtvsManager.connect(user2).buyTicketEvent(1, price)).to.revertedWith(
                "ERC20: insufficient allowance"
            );
        });

        it("should buy ticket success: ", async () => {
            await treasury.connect(owner).distribute(token.address, user2.address, AMOUNT);
            await token.approve(user2.address, MaxUint256);
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);

            const balanceOf_before = await token.balanceOf(treasury.address);

            const price = 10000;
            await expect(() => mtvsManager.connect(user2).buyTicketEvent(1, price)).to.changeTokenBalance(
                token,
                user2,
                -price
            );

            const balanceOf_after = await token.balanceOf(treasury.address);
            expect(balanceOf_after.sub(balanceOf_before)).to.equal(price);
        });
    });
});
