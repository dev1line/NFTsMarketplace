const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { add } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = require("ethers/lib/utils");

describe("Marketplace interact with Order", () => {
    before(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("10000000");
        PRICE = ethers.utils.parseEther("1");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_WEEK = 604800;
        MINT_FEE = 1000;
        BID_PRICE = parseEther("100");
        BUY_BID_PRICE = add(BID_PRICE, parseEther("100"));
        [owner, user1, user2, user3] = await ethers.getSigners();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, admin.address]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, ["NFT Marketplace", "nMTVS", 250, admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, ["NFT test", "NFT", token.address, 250, PRICE, admin.address]);

        TemplateERC721 = await ethers.getContractFactory("TokenERC721");
        templateERC721 = await TemplateERC721.deploy();
        await templateERC721.deployed();

        TemplateERC1155 = await ethers.getContractFactory("TokenERC1155");
        templateERC1155 = await TemplateERC1155.deploy();
        await templateERC1155.deployed();

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
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

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        await admin.setPermittedNFT(tokenMintERC721.address, true);
        await admin.setPermittedNFT(tokenMintERC1155.address, true);
        await admin.setPermittedNFT(nftTest.address, true);
        await admin.setPermittedPaymentToken(token.address, true);
        await token.connect(user1).approve(orderManager.address, MaxUint256);
        await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));

        await token.connect(user2).approve(orderManager.address, MaxUint256);
        await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

        await token.connect(user3).approve(orderManager.address, MaxUint256);
        await treasury.connect(owner).distribute(token.address, user3.address, parseEther("1000"));

        await mkpManager.setOrderManager(orderManager.address);

        await metaCitizen.mint(user2.address);
    });
    describe("Buy/Mint a NFT ", async () => {
        it("Buy token ERC721", async () => {
            await token.connect(user1).approve(nftTest.address, PRICE);
            await expect(() => nftTest.connect(user1).buy("nftTest_uri")).to.changeTokenBalance(nftTest, user1, 1);
            expect(await nftTest.balanceOf(user1.address)).to.equal(1);
        });
        it("Mint token ERC1155", async () => {
            await tokenMintERC1155.connect(owner).mint(user2.address, 100, "nftTest_uri");
            expect(await tokenMintERC1155.balanceOf(user2.address, 1)).to.equal(100);
        });
    });

    describe("Offer in wallet ", async () => {
        it("Offer in wallet", async () => {
            const current = await getCurrentTime();
            await token.connect(user2).approve(orderManager.address, ONE_ETHER.mul(10));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
        });
        it("ReOffer in wallet", async () => {
            const current = await getCurrentTime();
            await token.connect(user2).approve(orderManager.address, ONE_ETHER.mul(10));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        token.address,
                        ONE_ETHER.mul(2),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
        });
        it("Offer in wallet with native", async () => {
            const current = await getCurrentTime();

            await expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        AddressZero,
                        ONE_ETHER.mul(2),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: ONE_ETHER.mul(2) }
                    )
            ).to.changeEtherBalance(user3, ONE_ETHER.mul(-2));
        });
        it("ReOffer in wallet with native", async () => {
            const current = await getCurrentTime();

            await expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        AddressZero,
                        ONE_ETHER.mul(3),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: ONE_ETHER.mul(1) }
                    )
            ).to.changeEtherBalance(user3, ONE_ETHER.mul(-1));
        });
    });

    describe("Create a market item", async () => {
        it("Create a market item", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map((value) => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime + 10, endTime, AddressZero, rootHash);
        });
    });

    describe("Offer in market item", async () => {
        it("Offer in market item", async () => {
            const marketItemId = await mkpManager.getCurrentMarketItem();
            const bidPrice = parseEther("0.5");
            const endTime = add(await getCurrentTime(), ONE_WEEK);
            await skipTime(10);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address)),
                        { value: bidPrice }
                    )
            ).to.changeEtherBalance(user2, bidPrice.mul(-1));

            const currentWalletOrderId = await orderManager.getCurrentOrderId();
            const orderInfo = await orderManager.getOrderByOrderId(currentWalletOrderId);

            expect(orderInfo.bidPrice).to.equal(bidPrice);
        });
        it("ReOffer in market item", async () => {
            const marketItemId = await mkpManager.getCurrentMarketItem();
            const bidPrice = parseEther("0.7");
            const endTime = add(await getCurrentTime(), ONE_WEEK);
            const balanceWillChange = bidPrice.sub(parseEther("0.5"));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address)),
                        { value: balanceWillChange }
                    )
            ).to.changeEtherBalance(user2, balanceWillChange.mul(-1));

            const currentWalletOrderId = await orderManager.getCurrentOrderId();
            const orderInfo = await orderManager.getOrderByOrderId(currentWalletOrderId);

            expect(orderInfo.bidPrice).to.equal(bidPrice);
        });
    });

    describe("Cancel sell NFT", async () => {
        it("Cancel sell", async () => {
            await expect(() => orderManager.connect(user1).cancelSell(1)).to.changeTokenBalance(nftTest, user1, 1);
        });
    });

    describe("ReSell in marketplace and Buy it", async () => {
        it("Resell NFT", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map((value) => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();
            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime + 10, endTime, token.address, rootHash);
        });

        it("Buy NFT in marketplace", async () => {
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(100);
            await orderManager.connect(user2).buy(2, proof, { value: 0 });
            expect(await nftTest.balanceOf(user2.address)).to.equal(1);
        });
    });
});
