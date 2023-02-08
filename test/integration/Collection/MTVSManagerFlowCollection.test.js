const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { AddressZero } = ethers.constants;
const { getCurrentTime, generateMerkleTree } = require("../../utils");

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const ONE_ETHER = ethers.utils.parseEther("1");
const ONE_DAY = 86400;
const ONE_HOUR = 3600;

describe("MTVSManagerFlowCollection", () => {
    before(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        startTime = (await getCurrentTime()) + ONE_HOUR;
        endTime = startTime + ONE_DAY;

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

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

        // await collectionFactory.setPause(false);
        await collectionFactory.setMarketplaceManager(mtvsManager.address);

        // await mtvsManager.setPause(false);
        await mkpManager.setMarketplaceManager(mtvsManager.address);

        merkleTree = generateMerkleTree([owner.address, user1.address, user2.address]);
    });

    it("User 1,2 create collection 721", async () => {
        await collectionFactory.connect(user1).create(0, "NFT", "NFT", treasury.address, 250);
        await collectionFactory.connect(user2).create(0, "NFT", "NFT", treasury.address, 250);
    });

    it("User 1,2 create collection 1155", async () => {
        await collectionFactory.connect(user1).create(1, "NFT_1155", "NFT_1155", treasury.address, 250);
        await collectionFactory.connect(user2).create(1, "NFT_1155", "NFT_1155", treasury.address, 250);
    });

    it("setMaxCollectionOfUser is 1 should revert Exceeding the maxCollection", async () => {
        await collectionFactory.setMaxCollectionOfUser(user1.address, 1);
        await collectionFactory.setMaxCollectionOfUser(user2.address, 1);

        await expect(
            collectionFactory.connect(user1).create(0, "NFT_1155", "NFT_1155", treasury.address, 250)
        ).to.revertedWith("ExceedMaxCollection()");
        await expect(
            collectionFactory.connect(user2).create(0, "NFT_1155", "NFT_1155", treasury.address, 250)
        ).to.revertedWith("ExceedMaxCollection()");
    });

    it("setMaxCollectionOfUser is 5", async () => {
        await collectionFactory.setMaxCollectionOfUser(user1.address, 5);
        await collectionFactory.setMaxCollectionOfUser(user2.address, 5);

        await collectionFactory.connect(user1).create(0, "NFT_721", "NFT_721", treasury.address, 250);
        await collectionFactory.connect(user2).create(0, "NFT_721", "NFT_721", treasury.address, 250);
    });

    it("User 1 create NFT 721 with collection by mtvs manager to Sale", async () => {
        let collectionByUser = await collectionFactory.getCollectionByUser(user1.address);
        expect(collectionByUser.length).to.equal(3);

        nft_721 = await TokenERC721.attach(collectionByUser[0]);

        const balance_before = await nft_721.balanceOf(mkpManager.address);
        await mtvsManager
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
            );

        const balance_after = await nft_721.balanceOf(mkpManager.address);

        expect(balance_after.sub(balance_before)).to.equal(1);

        collectionByUser = await collectionFactory.getCollectionByUser(user2.address);
        nft_721 = await TokenERC721.attach(collectionByUser[0]);
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
        ).to.revertedWith("UserDidNotCreateCollection()");
    });

    it("User 1 create NFT 721 max total suply with collection by mtvs manager to Sale", async () => {
        let collectionByUser = await collectionFactory.getCollectionByUser(user1.address);
        expect(collectionByUser.length).to.equal(3);

        nft_721 = await TokenERC721.attach(collectionByUser[0]);

        const maxTotalSupply = await nft_721.maxTotalSupply();
        const totalSupply = await nft_721.totalSupply();

        const times = maxTotalSupply.sub(totalSupply);

        const balance_before = await nft_721.balanceOf(mkpManager.address);
        for (let i = 0; i < Number(times); i++) {
            await mtvsManager
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
                );
        }

        const balance_after = await nft_721.balanceOf(mkpManager.address);

        expect(balance_after.sub(balance_before)).to.equal(times);

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
        ).to.revertedWith("ExceedTotalSupply()");
    });

    it("User 2 create NFT 1155 with collection by mtvs manager to Wallet", async () => {
        let collectionByUser = await collectionFactory.getCollectionByUser(user2.address);
        expect(collectionByUser.length).to.equal(3);

        nft_1155 = await TokenERC1155.attach(collectionByUser[1]);

        const balance_before = await nft_1155.balanceOf(user2.address, 1);
        await mtvsManager
            .connect(user2)
            .createNFTLimit(
                false,
                nft_1155.address,
                100,
                "this_uri",
                ONE_ETHER,
                startTime,
                endTime,
                token.address,
                merkleTree.getHexRoot()
            );

        const balance_after = await nft_1155.balanceOf(user2.address, 1);

        expect(balance_after.sub(balance_before)).to.equal(100);

        collectionByUser = await collectionFactory.getCollectionByUser(user1.address);
        nft_1155 = await TokenERC1155.attach(collectionByUser[1]);
        await expect(
            mtvsManager
                .connect(user2)
                .createNFTLimit(
                    false,
                    nft_1155.address,
                    100,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                )
        ).to.revertedWith("UserDidNotCreateCollection()");
    });

    it("User 2 create NFT 1155 max total suply with collection by mtvs manager to Wallet", async () => {
        let collectionByUser = await collectionFactory.getCollectionByUser(user2.address);
        expect(collectionByUser.length).to.equal(3);

        nft_1155 = await TokenERC1155.attach(collectionByUser[1]);

        const maxTotalSupply = await nft_1155.maxTotalSupply();
        const totalSupply = await nft_1155.getTokenCounter();

        const times = maxTotalSupply.sub(totalSupply);
        const amount = 100;

        for (let i = 0; i < Number(times); i++) {
            const balance_before = await nft_1155.balanceOf(user2.address, totalSupply.add(i + 1));
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
                    merkleTree.getHexRoot()
                );

            const balance_after = await nft_1155.balanceOf(user2.address, totalSupply.add(i + 1));

            expect(balance_after.sub(balance_before)).to.equal(amount);
        }

        await expect(
            mtvsManager
                .connect(user2)
                .createNFTLimit(
                    false,
                    nft_1155.address,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                )
        ).to.revertedWith("ExceedTotalSupply()");
    });
});
