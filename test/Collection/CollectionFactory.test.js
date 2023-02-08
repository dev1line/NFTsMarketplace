const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("CollectionFactory", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();

        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

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
    });

    describe("Deployment", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(CollectionFactory, [
                    tokenERC721.address,
                    tokenERC1155.address,
                    AddressZero,
                    user1.address,
                    user2.address,
                ])
            ).to.revertedWith(`InValidAdminContract("${AddressZero}")`);
            await expect(
                upgrades.deployProxy(CollectionFactory, [
                    tokenERC721.address,
                    tokenERC1155.address,
                    user1.address,
                    user1.address,
                    user2.address,
                ])
            ).to.revertedWith(`InValidAdminContract("${user1.address}")`);
        });

        it("Check variable", async () => {
            expect(await collectionFactory.maxCollection()).equal(5);
            expect(await collectionFactory.maxTotalSupply()).equal(100);
            expect(await collectionFactory.templateERC721()).equal(tokenERC721.address);
            expect(await collectionFactory.templateERC1155()).equal(tokenERC1155.address);
            expect(await collectionFactory.MarketplaceManager()).equal(user1.address);
            expect(await collectionFactory.metaDrop()).equal(user2.address);
        });
    });

    describe("setMaxCollection", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxCollection(50)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("Should revert Invalid maxCollection", async () => {
            await expect(collectionFactory.setMaxCollection(0)).to.revertedWith("InvalidMaxCollection()");
        });

        it("Should setMaxCollection successfully", async () => {
            await collectionFactory.setMaxCollection(50);
            const maxCollection = await collectionFactory.maxCollection();
            expect(maxCollection).equal(50);
        });
    });

    describe("setMaxTotalSuply", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxTotalSuply(50)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("Should revert Invalid maxTotalSupply", async () => {
            await expect(collectionFactory.setMaxTotalSuply(0)).to.revertedWith("InvalidMaxTotalSupply()");
        });

        it("Should setMaxTotalSuply successfully", async () => {
            await collectionFactory.setMaxTotalSuply(50);
            const maxTotalSupply = await collectionFactory.maxTotalSupply();
            expect(maxTotalSupply).equal(50);
        });
    });

    describe("setMaxCollectionOfUser", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxCollectionOfUser(user1.address, 50)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(collectionFactory.setMaxCollectionOfUser(AddressZero, 0)).to.revertedWith("InvalidAddress()");
        });

        it("Should revert Invalid maxCollectionOfUser", async () => {
            await expect(collectionFactory.setMaxCollectionOfUser(user1.address, 0)).to.revertedWith(
                "InvalidMaxCollectionOfUser()"
            );
        });

        it("Should setMaxCollectionOfUser successfully", async () => {
            await collectionFactory.setMaxCollectionOfUser(user1.address, 50);
            const maxCollectionOfUsers = await collectionFactory.maxCollectionOfUsers(user1.address);
            expect(maxCollectionOfUsers).equal(50);
        });
    });

    describe("setMarketplaceManager", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMarketplaceManager(user1.address)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(collectionFactory.setMarketplaceManager(AddressZero)).to.revertedWith("InvalidAddress()");
        });

        it("Should setMarketplaceManager successfully", async () => {
            await collectionFactory.setMarketplaceManager(user1.address);
            const MarketplaceManager = await collectionFactory.MarketplaceManager();

            expect(MarketplaceManager).equal(user1.address);
        });
    });

    describe("setMetaDrop", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMetaDrop(user1.address)).to.revertedWith(
                "CallerIsNotOwnerOrAdmin()'"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(collectionFactory.setMetaDrop(AddressZero)).to.revertedWith("InvalidAddress()");
        });

        it("Should setMetaDrop successfully", async () => {
            await collectionFactory.setMetaDrop(user1.address);
            const metaDrop = await collectionFactory.metaDrop();

            expect(metaDrop).equal(user1.address);
        });
    });

    describe("setTemplateAddress", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                collectionFactory.connect(user1).setTemplateAddress(user1.address, user1.address)
            ).to.revertedWith("CallerIsNotOwnerOrAdmin()");
        });

        it("Should revert Invalid address", async () => {
            await expect(collectionFactory.setTemplateAddress(AddressZero, user1.address)).to.revertedWith(
                "InvalidAddress()"
            );
            await expect(collectionFactory.setTemplateAddress(user1.address, AddressZero)).to.revertedWith(
                "InvalidAddress()"
            );
        });

        it("Should setTemplateAddress successfully", async () => {
            await collectionFactory.setTemplateAddress(user1.address, user2.address);
            const templateERC721 = await collectionFactory.templateERC721();
            const templateERC1155 = await collectionFactory.templateERC1155();

            expect(templateERC721).equal(user1.address);
            expect(templateERC1155).equal(user2.address);
        });
    });

    describe("create", async () => {
        it("should revert Exceeding the maxCollection", async () => {
            await collectionFactory.setMaxCollection(1);
            await collectionFactory.create(0, "NFT", "NFT", user1.address, 250);

            await expect(collectionFactory.create(1, "NFT1155", "NFT1155", user1.address, 250)).to.be.revertedWith(
                "ExceedMaxCollection()"
            );
        });

        it("should create success", async () => {
            await collectionFactory.create(0, "NFT", "NFT", user1.address, 250);

            await collectionFactory.create(1, "NFT1155", "NFT1155", user1.address, 250);

            const totalCollection = await collectionFactory.getCollectionLength();
            expect(totalCollection).to.equal(2);

            const collectionByUser = await collectionFactory.getCollectionByUser(owner.address);
            expect(collectionByUser.length).to.equal(2);

            let collectionInfo = await collectionFactory.collectionIdToCollectionInfos(1);
            expect(collectionInfo.typeNft).to.equal(0);
            expect(collectionInfo.collectionAddress).to.equal(collectionByUser[0]);
            expect(collectionInfo.owner).to.equal(owner.address);

            collectionInfo = await collectionFactory.collectionIdToCollectionInfos(2);
            expect(collectionInfo.typeNft).to.equal(1);
            expect(collectionInfo.collectionAddress).to.equal(collectionByUser[1]);
            expect(collectionInfo.owner).to.equal(owner.address);
        });
    });
});
