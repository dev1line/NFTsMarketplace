const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

const { AddressZero } = ethers.constants;
describe("MTVS Token:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        Admin = await ethers.getContractFactory("Admin");
        Treasury = await ethers.getContractFactory("Treasury");

        admin = await upgrades.deployProxy(Admin, [owner.address]);
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid address", async () => {
            await expect(Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, AddressZero)).to.be.revertedWith(
                "InvalidAddress()"
            );
        });

        it("Should revert when invalid amount", async () => {
            await expect(Token.deploy("Marketplace Token", "MTVS", 0, user1.address)).to.revertedWith(
                "InvalidAmount()"
            );
        });

        it("Check name, symbol and default state: ", async () => {
            const name = await token.name();
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();
            const balance = await token.balanceOf(treasury.address);

            expect(name).to.equal("Marketplace Token");
            expect(symbol).to.equal("MTVS");
            expect(balance).to.equal(TOTAL_SUPPLY);
            expect(balance).to.equal(totalSupply);
        });
    });

    describe("burn function:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.burn(0)).to.be.revertedWith("InvalidAmount()");
        });

        it("should burn success: ", async () => {
            await admin.setPermittedPaymentToken(token.address, true);
            await treasury.connect(owner).distribute(token.address, user1.address, 50);
            await expect(() => token.connect(user1).burn(50)).to.changeTokenBalance(token, user1, -50);
        });
    });
});
