const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

const BATCH_URIS = ["this_uri", "this_uri_1", "this_uri_2"];

describe("TokenMintERC1155", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
    });

    describe("Deployment", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(TokenMintERC1155, [250, AddressZero])).to.revertedWith(
                `InValidAdminContract("${AddressZero}")`
            );
            await expect(upgrades.deployProxy(TokenMintERC1155, [250, user1.address])).to.reverted;
            await expect(upgrades.deployProxy(TokenMintERC1155, [250, treasury.address])).to.reverted;
        });

        it("Check uri", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenMintERC1155.uri(1);

            expect(newURI).to.equal(URI);
        });

        it("Check royalties", async () => {
            let royaltiesInfo = await tokenMintERC1155.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
    });

    describe("setURI function", async () => {
        it("should setURI", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenMintERC1155.uri(1);

            expect(newURI).to.equal(URI);
            await tokenMintERC1155.setURI("new_uri.json", 1);
            expect(await tokenMintERC1155.uri(1)).to.equal("new_uri.json");
        });
    });

    describe("mint function", async () => {
        it("should revert when caller is not owner", async () => {
            await expect(tokenMintERC1155.connect(user1).mint(mkpManager.address, 100, "this_uri")).to.be.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });
        it("should revert when receiver address equal to zero address", async () => {
            await expect(tokenMintERC1155.mint(AddressZero, 100, "this_uri")).to.be.revertedWith("InvalidAddress()");
        });
        it("should revert when amount equal to zero address", async () => {
            await expect(tokenMintERC1155.mint(mkpManager.address, 0, "this_uri")).to.be.revertedWith(
                "InvalidAmount()"
            );
        });
        it("should mint success", async () => {
            await tokenMintERC1155.mint(mkpManager.address, 100, "this_uri");
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 1)).to.equal(100);

            const royaltiesInfo = await tokenMintERC1155.royaltyInfo(1, 10000);
            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
    });

    describe("batch mint function", async () => {
        it("should revert when caller is not an owner or admin", async () => {
            await expect(
                tokenMintERC1155.connect(user1).mintBatch(mkpManager.address, [101, 102, 103], BATCH_URIS)
            ).to.be.revertedWith("CallerIsNotOwnerOrAdmin()");
        });

        it("should revert when amount length not equal to uris length", async () => {
            await expect(
                tokenMintERC1155.mintBatch(mkpManager.address, [10, 11, 12, 13], BATCH_URIS)
            ).to.be.revertedWith("InvalidLength()");
        });

        it("should revert when receiver address equal to zero address", async () => {
            await expect(tokenMintERC1155.mintBatch(AddressZero, [10, 11, 12], BATCH_URIS)).to.be.revertedWith(
                "InvalidAddress()"
            );
        });

        it("should revert when amount equal to zero address", async () => {
            await expect(tokenMintERC1155.mintBatch(mkpManager.address, [0, 100, 100], BATCH_URIS)).to.be.revertedWith(
                "InvalidAmount()"
            );
        });

        it("should mint success", async () => {
            await tokenMintERC1155.mintBatch(mkpManager.address, [10, 11, 12], BATCH_URIS);
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 1)).to.equal(10);
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 2)).to.equal(11);
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 3)).to.equal(12);

            for (let i = 0; i < BATCH_URIS.length; i++) {
                const tokenId = i + 1;
                const royaltiesInfo = await tokenMintERC1155.royaltyInfo(tokenId, 10000);
                expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
                expect(royaltiesInfo[1].toString()).to.equal("250");
            }
        });
    });
});
