const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("Marketplace interact with Tokens:", () => {
    before(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000");
        PRICE = ethers.utils.parseEther("1");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_WEEK = 604800;
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

        USD = await ethers.getContractFactory("USD");
        usd = await upgrades.deployProxy(USD, [user1.address, "USD Token", "USD", TOTAL_SUPPLY, treasury.address]);

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
            AddressZero,
            AddressZero,
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
    });

    describe("Setup: Set permitted tokens => Unpause contracts => Connect order contract", () => {
        it("Set permitted tokens", async () => {
            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(AddressZero)).to.equal(false);

            await admin.setPermittedPaymentToken(token.address, true);
            await admin.setPermittedPaymentToken(usd.address, true);
            await admin.setPermittedPaymentToken(AddressZero, true);

            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(AddressZero)).to.equal(true);
        });

        it("Unpause contracts", async () => {
            expect(await orderManager.paused()).to.equal(false);
            expect(await mtvsManager.paused()).to.equal(false);
            expect(await mkpManager.paused()).to.equal(false);
        });

        it("Connect order contract", async () => {
            expect(await mkpManager.orderManager()).to.equal(AddressZero);

            await mkpManager.setOrderManager(orderManager.address);

            expect(await mkpManager.orderManager()).to.equal(orderManager.address);
        });
    });
});
