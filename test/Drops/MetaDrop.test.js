const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { formatBytes32String, parseEther } = ethers.utils;
const { getCurrentTime, setTime, generateMerkleTree, generateLeaf } = require("../utils");

const TOTAL_SUPPLY = parseEther("1000000000000");
const TOKEN_0_1 = parseEther("0.1");
const ONE_DAY = 3600 * 24;
const DEFAULT_SERVICE_NUMERATOR = 100000;

describe("MetaDrop", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        user4 = accounts[4];
        user_notWhitelisted = accounts[5];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await Token.deploy("Marketplace Token", "MTVS", TOTAL_SUPPLY, treasury.address);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await upgrades.deployProxy(TokenERC721, [
            owner.address,
            "NFT Marketplace",
            "nMTVS",
            100,
            owner.address,
            10000,
        ]);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, TOKEN_0_1, admin.address]);

        MetaDrop = await ethers.getContractFactory("MetaDrop");
        metaDrop = await upgrades.deployProxy(MetaDrop, [
            admin.address,
            DEFAULT_SERVICE_NUMERATOR, // 10%
        ]);

        await treasury.distribute(token.address, user1.address, TOTAL_SUPPLY.div(4));
        await treasury.distribute(token.address, user2.address, TOTAL_SUPPLY.div(4));
        await treasury.distribute(token.address, user3.address, TOTAL_SUPPLY.div(4));

        await token.connect(user1).approve(metaDrop.address, MaxUint256);
        await token.connect(user2).approve(metaDrop.address, MaxUint256);
        await token.connect(user3).approve(metaDrop.address, MaxUint256);

        // await metaCitizen.setPause(false);
        await metaCitizen.mint(user1.address);
        await metaCitizen.mint(user2.address);
        await metaCitizen.mint(user3.address);

        await admin.setPermittedPaymentToken(token.address, true);

        await tokenERC721.setAdmin(metaDrop.address, true);

        dropStartTime = (await getCurrentTime()) + 10;
        dropEndTime = dropStartTime + ONE_DAY;

        merkleTree = generateMerkleTree([user1.address, user2.address, user3.address]);
        proof_user1 = merkleTree.getHexProof(generateLeaf(user1.address));
        proof_user2 = merkleTree.getHexProof(generateLeaf(user2.address));
        proof_user3 = merkleTree.getHexProof(generateLeaf(user3.address));
        proof_user4 = merkleTree.getHexProof(generateLeaf(user4.address));

        SERVICE_FEE_DENOMINATOR = await metaDrop.SERVICE_FEE_DENOMINATOR();
    });

    describe("Deployment", async () => {
        it("Should revert when admin contract is invalid", async () => {
            await expect(upgrades.deployProxy(MetaDrop, [AddressZero, SERVICE_FEE_DENOMINATOR])).to.be.revertedWith(
                `InValidAdminContract("${AddressZero}")`
            );

            await expect(upgrades.deployProxy(MetaDrop, [treasury.address, SERVICE_FEE_DENOMINATOR])).to.be.reverted;
        });

        it("Should throw error Service fee will exceed mint fee", async () => {
            await expect(
                upgrades.deployProxy(MetaDrop, [admin.address, SERVICE_FEE_DENOMINATOR.add(1)])
            ).to.be.revertedWith("ServiceFeeExceedMintFee()");
        });

        it("Set initial state successful", async () => {
            expect(await metaDrop.mvtsAdmin()).to.equal(admin.address);
            expect(await metaDrop.serviceFeeNumerator()).to.equal(DEFAULT_SERVICE_NUMERATOR);
            expect(await metaDrop.paused()).to.false;
        });
    });

    describe("setServiceFeeNumerator", async () => {
        it("should revert when caller is not an owner or admin: ", async () => {
            await expect(metaDrop.connect(user1).setServiceFeeNumerator("0")).to.be.revertedWith(
                "CallerIsNotOwnerOrAdmin()"
            );
        });

        it("Should throw error Service fee will exceed mint fee", async () => {
            await expect(metaDrop.setServiceFeeNumerator(SERVICE_FEE_DENOMINATOR.add(1))).to.be.revertedWith(
                "ServiceFeeExceedMintFee()"
            );
        });

        it("Should set successfully", async () => {
            await metaDrop.setServiceFeeNumerator("0");
            expect(await metaDrop.serviceFeeNumerator()).to.equal("0");

            await metaDrop.setServiceFeeNumerator(DEFAULT_SERVICE_NUMERATOR + 1);
            expect(await metaDrop.serviceFeeNumerator()).to.equal(DEFAULT_SERVICE_NUMERATOR + 1);

            await metaDrop.setServiceFeeNumerator(SERVICE_FEE_DENOMINATOR);
            expect(await metaDrop.serviceFeeNumerator()).to.equal(SERVICE_FEE_DENOMINATOR);
        });
    });

    describe("create", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                maxSupply: 100,
                mintFee: TOKEN_0_1,
                mintableLimit: 1,
                startTime: dropStartTime,
                endTime: dropEndTime,
            };
        });

        it("Should throw error when system pause", async () => {
            await metaDrop.setPause(true);
            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Pausable: paused");
        });

        it("Should throw error Invalid TokenCollectionERC721 contract", async () => {
            drop.nft = AddressZero;
            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith(
                `InValidTokenCollectionERC721Contract("${AddressZero}")`
            );

            drop.nft = metaCitizen.address;
            await expect(metaDrop.connect(user1).create(drop)).to.be.reverted;
        });

        it("Should throw error Invalid root", async () => {
            drop.root = formatBytes32String("");

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("InvalidRoot()");
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("InvalidFundingReceiver()");
        });

        it("Should throw error Invalid start time", async () => {
            drop.startTime = getCurrentTime();

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("InvalidTimeForCreate()");
        });

        it("Should throw error Invalid end time", async () => {
            drop.endTime = dropStartTime;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("InvalidTimeForCreate()");
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("InvalidMintingSupply()");
        });

        it("Should throw error Payment token is not supported", async () => {
            drop.paymentToken = tokenERC721.address;

            await expect(metaDrop.connect(user1).create(drop)).to.be.reverted;
        });

        it("Should create drop successful", async () => {
            await metaDrop.connect(user1).create(drop);

            const currentDropCounter = await metaDrop.getCurrentCounter();
            expect(currentDropCounter).to.equal("1");

            const createdDrop = await metaDrop.drops(currentDropCounter);
            expect(createdDrop.root).to.equal(drop.root);
            expect(createdDrop.owner).to.equal(user1.address);
            expect(createdDrop.nft).to.equal(drop.nft);
            expect(createdDrop.paymentToken).to.equal(drop.paymentToken);
            expect(createdDrop.fundingReceiver).to.equal(drop.fundingReceiver);
            expect(createdDrop.mintedTotal).to.equal("0");
            expect(createdDrop.maxSupply).to.equal(drop.maxSupply);

            expect(createdDrop.startTime).to.equal(drop.startTime);
            expect(createdDrop.endTime).to.equal(drop.endTime);
            expect(createdDrop.mintFee).to.equal(drop.mintFee);
            expect(createdDrop.mintableLimit).to.equal(drop.mintableLimit);
            expect(createdDrop.isCanceled).to.be.false;
        });
    });

    describe("update", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                maxSupply: 100,
                startTime: dropStartTime,
                endTime: dropEndTime,
                mintFee: TOKEN_0_1,
                mintableLimit: 1,
            };

            await metaDrop.connect(user1).create(drop);

            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(metaDrop.connect(user1).update("0", drop)).to.be.revertedWith("InvalidDropId()");

            await expect(metaDrop.connect(user1).update(dropId.add(1), drop)).to.be.revertedWith("InvalidDropId()");
        });

        it("Should throw error Invalid TokenCollectionERC721 contract", async () => {
            drop.nft = AddressZero;
            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith(
                `InValidTokenCollectionERC721Contract("${AddressZero}")`
            );

            drop.nft = metaCitizen.address;
            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.reverted;
        });

        it("Should throw error Caller is not drop owner", async () => {
            await expect(metaDrop.connect(user2).update(dropId, drop)).to.be.revertedWith("InvalidOwnerForUpdate()");
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("InvalidFundingReceiver()");
        });

        it("Should throw error Invalid start time", async () => {
            drop.startTime = 0;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("InvalidTimeForCreate()");
        });

        it("Should throw error Invalid end time", async () => {
            drop.endTime = dropStartTime;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("InvalidTimeForCreate()");
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("InvalidMintingSupply()");
        });

        it("Should throw error Payment token is not supported", async () => {
            drop.paymentToken = tokenERC721.address;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.reverted;
        });

        it("Should throw error when system pause", async () => {
            await metaDrop.setPause(true);
            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Pausable: paused");
        });

        it("Should update drop successful", async () => {
            const expectedUpdateDrop = {
                root: formatBytes32String("0x1234"),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user2.address,
                maxSupply: 200,
                mintFee: 0,
                mintableLimit: 0,
                startTime: dropStartTime + 10,
                endTime: dropEndTime + 10,
            };

            await metaDrop.connect(user1).update(dropId, expectedUpdateDrop);

            const updatedDrop = await metaDrop.drops(dropId);
            expect(updatedDrop.root).to.equal(expectedUpdateDrop.root);
            expect(updatedDrop.owner).to.equal(user1.address);
            expect(updatedDrop.nft).to.equal(expectedUpdateDrop.nft);
            expect(updatedDrop.paymentToken).to.equal(expectedUpdateDrop.paymentToken);
            expect(updatedDrop.fundingReceiver).to.equal(expectedUpdateDrop.fundingReceiver);
            expect(updatedDrop.mintedTotal).to.equal("0");
            expect(updatedDrop.maxSupply).to.equal(expectedUpdateDrop.maxSupply);

            expect(updatedDrop.startTime).to.equal(expectedUpdateDrop.startTime);
            expect(updatedDrop.endTime).to.equal(expectedUpdateDrop.endTime);
            expect(updatedDrop.mintFee).to.equal(expectedUpdateDrop.mintFee);
            expect(updatedDrop.mintableLimit).to.equal(expectedUpdateDrop.mintableLimit);
            expect(updatedDrop.isCanceled).to.be.false;
        });
    });

    describe("cancel", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                maxSupply: 100,
                startTime: dropStartTime,
                endTime: dropEndTime,
                mintFee: TOKEN_0_1,
                mintableLimit: 1,
            };

            await metaDrop.connect(user1).create(drop);

            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(metaDrop.connect(user1).cancel("0")).to.be.revertedWith("InvalidDropId()");
            await expect(metaDrop.connect(user1).cancel(dropId.add(1))).to.be.revertedWith("InvalidDropId()");
        });

        it("Should throw error Caller is not drop owner", async () => {
            await expect(metaDrop.connect(user2).cancel(dropId)).to.be.revertedWith("InvalidOwnerForUpdate()");
        });

        it("Should throw error when system pause", async () => {
            await metaDrop.setPause(true);
            await expect(metaDrop.connect(user1).cancel(dropId)).to.be.revertedWith("Pausable: paused");
        });

        it("Should cancel successful", async () => {
            await metaDrop.connect(user1).cancel(dropId);
            const updatedDrop = await metaDrop.drops(dropId);
            expect(updatedDrop.isCanceled).to.be.true;
        });
    });

    describe("mint", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: owner.address,
                maxSupply: 10,
                mintFee: TOKEN_0_1,
                mintableLimit: 5,
                startTime: dropStartTime,
                endTime: dropEndTime,
            };

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(metaDrop.connect(user1).mint("0", proof_user1, 5)).to.be.revertedWith("InvalidDropId()");
            await expect(metaDrop.connect(user1).mint("2", proof_user1, 5)).to.be.revertedWith("InvalidDropId()");
        });

        it("Should throw error when not hold MTV Citizen", async () => {
            await expect(metaDrop.connect(user4).mint(dropId, proof_user4, 5)).to.be.revertedWith(
                "NotPermitToMintNow()"
            );
        });

        it("Should throw error when drop is not active", async () => {
            // Drop is not started yet
            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 5)).to.be.revertedWith(
                "NotPermitToMintNow()"
            );

            // Drop has ended
            await setTime(dropEndTime);
            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 5)).to.be.revertedWith(
                "NotPermitToMintNow()"
            );
        });

        it("Should throw error when drop has canceled", async () => {
            await setTime(dropStartTime);
            await metaDrop.cancel(dropId);
            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 5)).to.be.revertedWith(
                "NotPermitToMintNow()"
            );
        });

        it("Should throw error when is not in whitelist", async () => {
            await setTime(dropStartTime);

            const proof_user_notWhitelisted = merkleTree.getHexProof(generateLeaf(user_notWhitelisted.address));

            await expect(
                metaDrop.connect(user_notWhitelisted).mint(dropId, proof_user_notWhitelisted, 5)
            ).to.be.revertedWith("NotPermitToMintNow()");
        });

        it("Should throw error Can not mint tokens anymore", async () => {
            await setTime(dropStartTime);

            // Mint more than permitted portion
            let mintableAmount = await metaDrop.mintableAmount(dropId, user1.address);
            expect(mintableAmount).to.equal(drop.mintableLimit);

            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.mintableLimit);

            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 1)).to.be.revertedWith(
                "CanNotMintAnyMore()"
            );

            // Mint more tokens than total of available tokens
            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.mintableLimit);

            await expect(metaDrop.connect(user3).mint(dropId, proof_user3, "1")).to.be.revertedWith(
                "CanNotMintAnyMore()"
            );
        });

        it("Should mint successful by an ERC-20 token", async () => {
            await setTime(dropStartTime);
            let expectedMintedFee = drop.mintFee.mul(drop.mintableLimit);
            let expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            let expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() =>
                metaDrop.connect(user1).mint(dropId, proof_user1, drop.mintableLimit)
            ).to.changeTokenBalances(token, [user1, owner], [expectedMintedFee.mul(-1), expectedCreatorFee]);

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.mintableLimit);
        });

        it("Should throw error when pay with both ERC-20 token and native token", async () => {
            await setTime(dropStartTime);

            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, drop.mintableLimit, { value: TOKEN_0_1 })
            ).to.be.revertedWith("otPayBothToken()");
        });

        it("Should throw error when system pause", async () => {
            await metaDrop.setPause(true);
            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, drop.mintableLimit)).to.be.revertedWith(
                "Pausable: paused"
            );
        });

        it("Should mint successful by native coin", async () => {
            drop.paymentToken = AddressZero;
            drop.startTime = (await getCurrentTime()) + 10;
            drop.endTime = drop.startTime + ONE_DAY;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(drop.startTime);
            let expectedMintedFee = drop.mintFee.mul(drop.mintableLimit);
            let expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            let expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() =>
                metaDrop.connect(user1).mint(dropId, proof_user1, drop.mintableLimit, { value: expectedMintedFee })
            ).to.changeEtherBalances([user1, owner], [expectedMintedFee.mul(-1), expectedCreatorFee]);

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.mintableLimit);
        });

        it("Should throw error Not enough fee", async () => {
            drop.paymentToken = AddressZero;
            drop.startTime = (await getCurrentTime()) + 10;
            drop.endTime = drop.startTime + ONE_DAY;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(drop.startTime);
            const expectedMintedFee = drop.mintFee.mul(drop.mintableLimit);

            await expect(
                metaDrop
                    .connect(user1)
                    .mint(dropId, proof_user1, drop.mintableLimit, { value: expectedMintedFee.sub(1) })
            ).to.be.revertedWith("TransferNativeFail()");

            await expect(
                metaDrop
                    .connect(user1)
                    .mint(dropId, proof_user1, drop.mintableLimit, { value: expectedMintedFee.add(1) })
            ).to.be.revertedWith("NotEnoughFee()");
        });
    });

    describe("mintableAmount", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: owner.address,
                maxSupply: 10,
                mintFee: TOKEN_0_1,
                mintableLimit: 5,
                startTime: dropStartTime,
                endTime: dropEndTime,
            };
        });

        it("Should return mintable amount correctly when mintable is zero", async () => {
            drop.mintableLimit = 0;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(dropStartTime);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.maxSupply);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.maxSupply);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.maxSupply);

            await metaDrop.connect(user1).mint(dropId, proof_user1, 1);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.maxSupply - 1);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.maxSupply - 1);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.maxSupply - 1);

            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.maxSupply - 1);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(0);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(0);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(0);
        });

        it("Should return mintable amount correctly when mintable is greater than zero", async () => {
            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(dropStartTime);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.mintableLimit);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.mintableLimit);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.mintableLimit);

            await metaDrop.connect(user1).mint(dropId, proof_user1, 1);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.mintableLimit - 1);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.mintableLimit);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.mintableLimit);

            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.mintableLimit);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.mintableLimit - 1);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(0);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.mintableLimit - 1);
        });
    });
});
