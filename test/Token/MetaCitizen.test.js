const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const MINT_FEE = 1000;

describe("MetaCitizen", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Treasury = await ethers.getContractFactory("Treasury");
        Token = await ethers.getContractFactory("MTVS");
        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        Admin = await ethers.getContractFactory("Admin");

        admin = await upgrades.deployProxy(Admin, [owner.address]);
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);
        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, admin.address]);

        await treasury.connect(owner).distribute(token.address, user1.address, TOTAL_SUPPLY);
        await token.connect(user1).approve(metaCitizen.address, MaxUint256);
    });

    describe("Deployment", async () => {
        it("Should revert when payment token contract is invalid", async () => {
            await expect(upgrades.deployProxy(MetaCitizen, [AddressZero, MINT_FEE, admin.address])).to.be.revertedWith(
                "InvalidPaymentToken()"
            );

            await expect(upgrades.deployProxy(MetaCitizen, [treasury.address, MINT_FEE, admin.address])).to.be.reverted;
        });

        it("Should revert when mint fee is zero", async () => {
            await expect(upgrades.deployProxy(MetaCitizen, [token.address, "0", admin.address])).to.be.revertedWith(
                "InvalidAmount()"
            );
        });

        it("Should revert when admin contract is invalid", async () => {
            await expect(upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, AddressZero])).to.be.revertedWith(
                `InValidAdminContract("${AddressZero}")`
            );

            await expect(upgrades.deployProxy(MetaCitizen, [treasury.address, MINT_FEE, token.address])).to.be.reverted;
        });

        it("Check name, symbol and default state", async () => {
            const name = await metaCitizen.name();
            const symbol = await metaCitizen.symbol();
            expect(name).to.equal("MarketplaceWorld Citizen");
            expect(symbol).to.equal("MWC");

            expect(await metaCitizen.paymentToken()).to.equal(token.address);
            expect(await metaCitizen.mintFee()).to.equal(MINT_FEE);
        });

        it("Check tokenURI", async () => {
            const URI = "this_is_uri_1";
            await metaCitizen.setBaseURI(URI);

            await metaCitizen.mint(user1.address);
            const newURI = await metaCitizen.tokenURI(1);

            expect(newURI).to.equal(URI + ".json");
        });
    });

    describe("setPaymentToken", async () => {
        it("should revert when caller is not an owner or admin", async () => {
            await expect(metaCitizen.connect(user1).setPaymentToken(user2.address)).to.be.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when payment token is not permitted", async () => {
            await expect(metaCitizen.setPaymentToken(AddressZero)).to.be.revertedWith("InvalidPaymentToken()");

            await expect(metaCitizen.setPaymentToken(treasury.address)).to.be.revertedWith("InvalidPaymentToken()");
        });

        it("should set payment token successful", async () => {
            await metaCitizen.setPaymentToken(token.address);
            expect(await metaCitizen.paymentToken()).to.equal(token.address);
        });
    });

    describe("setMintFee", async () => {
        it("should revert when Ownable: caller is not an owner or admin", async () => {
            await expect(metaCitizen.connect(user1).setMintFee(1000)).to.be.revertedWith("CallerIsNotOwnerOrAdmin()");
        });

        it("should revert when price equal to zero", async () => {
            await expect(metaCitizen.setMintFee(0)).to.be.revertedWith("InvalidAmount()");
        });

        it("should set minting fee successful", async () => {
            await metaCitizen.setMintFee("1000000");
            expect(await metaCitizen.mintFee()).to.equal("1000000");

            await metaCitizen.setMintFee("2000000");
            expect(await metaCitizen.mintFee()).to.equal("2000000");
        });
    });

    describe("buy", async () => {
        it("should revert when pause", async () => {
            await metaCitizen.setPause(true);
            await expect(metaCitizen.connect(user1).buy()).to.be.revertedWith("Pausable: paused");
        });

        it("should revert when user already have one", async () => {
            await metaCitizen.connect(user1).buy();
            await expect(metaCitizen.connect(user1).buy()).to.be.revertedWith("AlreadyHaveOne()");
        });

        it("should revert Can not be transfered", async () => {
            await metaCitizen.connect(user1).buy();

            await metaCitizen.connect(user1).approve(user2.address, 1);
            await expect(metaCitizen.connect(user2).transferFrom(user1.address, user3.address, 1)).to.be.revertedWith(
                "CanNotBeTransfered()"
            );
        });

        it("should buy successful", async () => {
            const balanceOf_before = await token.balanceOf(treasury.address);

            await expect(() => metaCitizen.connect(user1).buy()).to.changeTokenBalance(token, user1, -1 * MINT_FEE);

            const balanceOf_after = await token.balanceOf(treasury.address);
            expect(balanceOf_after.sub(balanceOf_before)).to.equal(MINT_FEE);

            expect(await metaCitizen.getTokenCounter()).to.equal(1);
            expect(await metaCitizen.ownerOf(1)).to.equal(user1.address);
            expect(await metaCitizen.balanceOf(user1.address)).to.equal(1);
        });
    });

    describe("mint", async () => {
        it("should revert when pause", async () => {
            await metaCitizen.setPause(true);
            await expect(metaCitizen.mint(user1.address)).to.be.revertedWith("Pausable: paused");
        });

        it("should revert when receiver is zero address", async () => {
            await expect(metaCitizen.mint(AddressZero)).to.be.revertedWith("InvalidAddress()");
        });

        it("should revert when caller is not owner or admin", async () => {
            await expect(metaCitizen.connect(user1).mint(user1.address)).to.be.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when user already have one", async () => {
            await metaCitizen.mint(user1.address);
            await expect(metaCitizen.mint(user1.address)).to.be.revertedWith("AlreadyHaveOne()");
        });

        it("should mint successful", async () => {
            await metaCitizen.mint(user1.address);

            expect(await token.balanceOf(treasury.address)).to.equal(0);
            expect(await metaCitizen.ownerOf(1)).to.equal(user1.address);
            expect(await metaCitizen.balanceOf(user1.address)).to.equal(1);
        });
    });

    describe("supportsInterface", async () => {
        it("should supportsInterface", async () => {
            let boolVal = await metaCitizen.supportsInterface(0x01ffc9a7);
            expect(boolVal).to.be.true;

            boolVal = await metaCitizen.supportsInterface(0xffffffff);
            expect(boolVal).to.be.false;
        });
    });

    describe("transfer", async () => {
        it("should revert Can not be transfered", async () => {
            await metaCitizen.connect(user1).buy();

            await metaCitizen.connect(user1).approve(user2.address, 1);
            await expect(metaCitizen.connect(user2).transferFrom(user1.address, user3.address, 1)).to.be.revertedWith(
                "CanNotBeTransfered()"
            );
        });
    });
});
