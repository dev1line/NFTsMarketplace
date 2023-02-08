const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("Treasury", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");

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
    });

    describe("Deployment:", async () => {
        it("Should initialize correctly", async () => {
            expect(await treasury.admin()).to.equal(admin.address);
        });
    });

    describe("distribute", async () => {
        beforeEach(async () => {
            await owner.sendTransaction({ to: treasury.address, value: 100 });

            await admin.setPermittedPaymentToken(token.address, true);
            await admin.setPermittedPaymentToken(AddressZero, true);
        });

        it("should revert when caller is not an owner or admin", async () => {
            await expect(treasury.connect(user1).distribute(token.address, user1.address, 10)).to.be.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("should revert when payment token is not supported", async () => {
            await expect(treasury.distribute(user1.address, user1.address, 10)).to.be.revertedWith(
                "PaymentTokenIsNotSupported()"
            );
        });

        it("should revert when receiver address is invalid", async () => {
            await expect(treasury.distribute(token.address, AddressZero, 10)).to.be.revertedWith("InvalidAddress()");
        });

        it("should revert when token amount equal to zero", async () => {
            await expect(treasury.distribute(token.address, user1.address, 0)).to.be.revertedWith("InvalidAmount()");
        });

        it("should revert when not enough ERC-20 token to distribute", async () => {
            await expect(treasury.distribute(token.address, user1.address, TOTAL_SUPPLY.add(1))).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance"
            );
        });

        it("should revert when not enough native token to distribute", async () => {
            await expect(treasury.distribute(AddressZero, user1.address, 101)).to.be.revertedWith(
                "TransferNativeFail()"
            );
        });

        it("should distribute token successful", async () => {
            await expect(() => treasury.distribute(token.address, user1.address, TOTAL_SUPPLY)).to.changeTokenBalances(
                token,
                [user1],
                [TOTAL_SUPPLY]
            );
            expect(await token.balanceOf(treasury.address)).to.equal(0);

            await expect(() => treasury.distribute(AddressZero, user1.address, 100)).to.changeEtherBalances(
                [user1],
                [100]
            );
            expect(await ethers.provider.getBalance(treasury.address)).to.equal(0);
        });
    });
});
