const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { skipTime, acceptable, getCurrentTime, generateMerkleTree, generateLeaf } = require("../utils");
const { add, multiply, divide, subtract } = require("js-big-decimal");
const aggregator_abi = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json");
const { MaxUint256, AddressZero } = ethers.constants;
const { MerkleTree } = require("merkletreejs");
const { parseEther, formatEther } = require("ethers/lib/utils");

const abi = [
    {
        inputs: [
            { internalType: "uint256", name: "amountIn", type: "uint256" },
            { internalType: "address[]", name: "path", type: "address[]" },
        ],
        name: "getAmountsOut",
        outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
        stateMutability: "view",
        type: "function",
    },
];

const USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const REWARD_RATE = 15854895992; // 50 % APY
const poolDuration = 9 * 30 * 24 * 60 * 60; // 9 months
const PRICE = parseEther("1");
const OVER_AMOUNT = ethers.utils.parseEther("1000000");
const ONE_ETHER = ethers.utils.parseEther("1");
const ONE_MILLION_ETHER = ethers.utils.parseEther("1000000");
const ONE_YEAR = 31104000;
const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const MINT_FEE = 1000;

describe("Staking Pool:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3, treasury] = await ethers.getSigners();

        PANCAKE_ROUTER = await deployMockContract(owner, abi);
        await PANCAKE_ROUTER.mock.getAmountsOut.returns([ONE_ETHER, multiply(500, ONE_ETHER)]);
        AGGREGATOR = await deployMockContract(owner, aggregator_abi.abi);
        await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);

        await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);
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

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        TemplateERC721 = await ethers.getContractFactory("TokenERC721");
        templateERC721 = await TemplateERC721.deploy();
        await templateERC721.deployed();

        TemplateERC1155 = await ethers.getContractFactory("TokenERC1155");
        templateERC1155 = await TemplateERC1155.deploy();
        await templateERC1155.deployed();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
            mkpManager.address,
        ]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();
        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

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

        Staking = await ethers.getContractFactory("StakingPool");
        staking = await upgrades.deployProxy(Staking, [
            token.address,
            token.address,
            mkpManager.address,
            REWARD_RATE,
            poolDuration,
            PANCAKE_ROUTER.address,
            USD_TOKEN,
            AGGREGATOR.address,
            admin.address,
        ]);

        CURRENT = await getCurrentTime();
        await staking.setStartTime(CURRENT);

        await admin.setPermittedPaymentToken(AddressZero, true);

        await token.connect(user1).approve(orderManager.address, MaxUint256);
        await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));

        await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
        await token.connect(user2).approve(orderManager.address, MaxUint256);
        await token.connect(user1).approve(metaCitizen.address, MaxUint256);

        await mkpManager.setOrderManager(orderManager.address);

        await admin.setAdmin(mtvsManager.address, true);

        await mkpManager.setOrderManager(orderManager.address);
        await mkpManager.setMarketplaceManager(mtvsManager.address);

        merkleTree = generateMerkleTree([user1.address, user2.address]);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    AddressZero,
                ])
            ).to.revertedWith(`InValidAdminContract("${AddressZero}")`);
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    user1.address,
                ])
            ).to.reverted;
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    treasury.address,
                ])
            ).to.reverted;
        });
    });
    describe("getStakeToken:", async () => {
        it("should return staked token: ", async () => {
            expect(await staking.stakeToken()).to.equal(token.address);
        });
    });
    describe("getStakedAmount:", async () => {
        it("should return total staked amount: ", async () => {
            expect(await staking.stakedAmount()).to.equal(0);
        });
    });
    describe("getPoolDuration:", async () => {
        it("should return pool duration: ", async () => {
            expect(await staking.poolDuration()).to.equal(poolDuration);
        });
    });
    describe("getRewardRate:", async () => {
        it("should return reward rate: ", async () => {
            expect(await staking.rewardRate()).to.equal(REWARD_RATE);
        });
    });

    describe("getUserAmount:", async () => {
        it("should return amount of user: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));

            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);

            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    current + 10,
                    current + 100000000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);

            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));
            await token.connect(user1).approve(staking.address, multiply(500, ONE_ETHER));

            await staking.connect(user1).stake(multiply(500, ONE_ETHER));
            expect(await staking.getUserAmount(user1.address)).to.equal(multiply(500, ONE_ETHER));
        });
    });
    describe("getStartTime:", async () => {
        it("should return start time of staking pool: ", async () => {
            expect(await staking.startTime()).to.equal(CURRENT.toString());
        });
    });
    describe("isActivePool:", async () => {
        it("should return status of pool: ", async () => {
            const time = await getCurrentTime();
            await staking.setStartTime(time);
            expect(await staking.isActivePool()).to.equal(true);
            await skipTime(time + 9 * 30 * 24 * 60 * 60 + 1);

            expect(await staking.isActivePool()).to.equal(false);
        });
    });
    describe("getPendingClaimTime:", async () => {
        it("should get pending claim time: ", async () => {
            expect(await staking.getPendingClaimTime(user1.address)).to.equal(0);
        });
    });

    describe("getPendingUnstakeTime:", async () => {
        it("should get pending unstake time: ", async () => {
            expect(await staking.getPendingUnstakeTime(user1.address)).to.equal(0);
        });
    });
    describe("getAllParams:", async () => {
        it("should get all params of pool: ", async () => {
            const params = await staking.getAllParams();
            expect(await staking.stakeToken()).to.equal(params[0]);
            expect(await staking.mkpManager()).to.equal(params[1]);
            expect(await staking.stakedAmount()).to.equal(params[2]);
            expect(await staking.poolDuration()).to.equal(params[3]);
            expect(await staking.rewardRate()).to.equal(params[4]);
            expect(await staking.startTime()).to.equal(params[5]);
            expect(await staking.pendingTime()).to.equal(params[6]);
            expect(await staking.isActivePool()).to.equal(params[7]);
        });
    });
    // SET FUNC
    describe("setRewardRate:", async () => {
        it("should change reward rate: ", async () => {
            const newRate = 1512300005610;
            await staking.setRewardRate(newRate);
            expect(await staking.rewardRate()).to.equal(newRate);
        });
    });
    describe("setPoolDuration:", async () => {
        it("should change pool duration: ", async () => {
            const newPoolDuration = 3 * 30 * 24 * 60 * 60;
            await staking.setPoolDuration(newPoolDuration);
            expect(await staking.poolDuration()).to.equal(newPoolDuration);
        });
    });

    describe("setStartTime:", async () => {
        it("should change start time: ", async () => {
            const time = 1234567;
            await staking.setStartTime(time);
            expect(await staking.startTime()).to.equal(time);
        });
    });

    describe("setPendingTime:", async () => {
        it("should change pending time: ", async () => {
            const time = 1234567;
            await staking.setPendingTime(time);
            expect(await staking.pendingTime()).to.equal(time);
        });
    });

    describe("setAcceptableLost:", async () => {
        it("should change acceptable lost: ", async () => {
            const lost = 10;
            await staking.setAcceptableLost(lost);
            expect(await staking.acceptableLost()).to.equal(lost);
        });
    });

    //  Others
    describe("stake:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(staking.connect(user1).stake(0)).to.be.revertedWith("InvalidAmount()");
        });
        it("should stake success: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 1000000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const amount = "125000000000000000000000";
            await treasury.connect(owner).distribute(token.address, user1.address, amount);

            await token.connect(user1).approve(staking.address, amount);
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(amount);
        });
        it("should stake success with more times: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 1000000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const amount = "125000000000000000000";
            await treasury.connect(owner).distribute(token.address, user1.address, amount);

            await token.connect(user1).approve(staking.address, multiply(3, amount));
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(amount);
            await staking.connect(user1).stake(amount);
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(multiply(3, amount));
        });
    });
    describe("callReward:", async () => {
        it("should return zero reward: ", async () => {
            const calReward = await staking.calReward(user1.address);

            expect(calReward).to.equal(0);
        });
        //
        it("should return reward each day: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await treasury.connect(owner).distribute(token.address, user1.address, ONE_ETHER);

            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);

            // await skipTime(86000);
            let calReward = await staking.calReward(user1.address);

            expect(calReward.toNumber()).to.equal(0);

            await skipTime(86400);
            calReward = await staking.calReward(user1.address);
            expect(calReward.toNumber()).to.greaterThan(0);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(24 * 60 * 60 + 1);
            // const pendingRewards = await staking.pendingRewards(user1.address);
            await staking.connect(user1).claim();
            // data = await staking.users(user1.address);

            await skipTime(86400);
            const newcalReward = await staking.calReward(user1.address);
            expect(newcalReward.toNumber()).to.equal(newcalReward.toNumber());
        });
    });
    describe("pendingRewards:", async () => {
        it("should return zero reward: ", async () => {
            const pendingRewards = await staking.pendingRewards(user1.address);

            expect(pendingRewards).to.equal(0);
        });
        //
        it("should return pending reward: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await treasury.connect(owner).distribute(token.address, user1.address, ONE_ETHER);

            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            const pendingRewards = await staking.pendingRewards(user1.address);

            const epsilon = (1 / 100) * ONE_ETHER;
            expect(
                acceptable(
                    pendingRewards.toString(),
                    divide(multiply(multiply(ONE_ETHER, 0.5), claimTime), ONE_YEAR),
                    epsilon
                )
            ).to.be.true;
        });
    });
    //
    describe("requestUnstake:", async () => {
        it("should revert when not allow at this time for no NFT or on staking time: ", async () => {
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith("NotAllowToUnstake()");
        });

        it("should revert when Already requested: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime + poolDuration);
            await staking.connect(user1).requestUnstake();
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith("AlreadyRequested()");
        });

        it("should request success: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 10 * 30 * 24 * 60 * 60; // 1 thangs

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(claimTime);

            await staking.connect(user1).requestUnstake();
            const data = await staking.users(user1.address);
            expect(data.lazyUnstake.isRequested).to.equal(true);
        });
    });
    //
    describe("requestClaim:", async () => {
        it("should revert when pool is not start: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.setStartTime(0);
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith("NotAllowToClaim()");
        });
        it("should revert when more request: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith("AlreadyRequested()");
        });
        it("should request success: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            const data = await staking.users(user1.address);
            expect(data.lazyClaim.isRequested).to.equal(true);
        });
    });
    //
    describe("claim:", async () => {
        it("should revert when staking pool had been expired ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(10 * 24 * 60 * 60);
            await staking.connect(user1).requestClaim();
            await skipTime(10 * 30 * 24 * 60 * 60 + 1); // 23h

            await expect(staking.connect(user1).claim()).to.be.revertedWith("NotAllowToClaim()");
        });

        it("should revert when not rquest claim before ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(30 * 24 * 60 * 60);

            await expect(staking.connect(user1).claim()).to.be.revertedWith("MustRequestFirst()");
        });

        it("should accept lost 50% first ", async () => {
            // emulator balance
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(1 * 24 * 60 * 60);
            await staking.connect(user1).requestClaim();
            await skipTime(100);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await expect(() => staking.connect(user1).claim()).to.changeTokenBalance(token, user1, +pendingRewards / 2);
        });

        it("should claim success", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 1000;
            const startTime = current + 10;
            const endTime = current + 10000;

            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    typeNft,
                    amount,
                    uri,
                    price,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(24 * 60 * 60 + 1);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(24 * 60 * 60 + 1);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await staking.connect(user1).claim();
            data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(false);

            const epsilon = (1 / 100) * ONE_ETHER;

            expect(
                acceptable(
                    pendingRewards.toString(),
                    divide(multiply(multiply(ONE_ETHER, 0.5), 24 * 60 * 60 + 1), ONE_YEAR),
                    epsilon
                )
            ).to.be.true;
        });
        it("should claim accept lost 50%", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = ONE_ETHER;
            const startTime = current + 10;
            const endTime = current + 10000;

            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    typeNft,
                    amount,
                    uri,
                    price,
                    startTime,
                    endTime,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(24 * 60 * 60 + 1);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(10 * 60 * 60 + 1);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await expect(() =>
                staking.connect(user1).claim().to.changeTokenBalance(token, user1, divide(pendingRewards, 2))
            );
        });
    });
    //
    describe("unstake:", async () => {
        it("should revert when staking pool for NFT not expired: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const unstakeTime = 8 * 30 * 24 * 60 * 60 + 1; // not enough time

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith("NotAllowToUnstake()");
        });
        it("should revert when request not finish after 24 hours: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith("MustRequestFirst()");
        });
        it("should revert when connot unstake more than staked amount: ", async () => {
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));
            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);
            await staking.connect(user1).requestUnstake();
            await skipTime(25 * 60 * 60);
            await expect(staking.connect(user1).unstake(OVER_AMOUNT)).to.be.revertedWith("ExceedAmount()");
        });
        it("should unstake success: ", async () => {
            await treasury.connect(owner).distribute(token.address, staking.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user2.address, parseEther("1000"));
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));

            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();

            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);

            await mtvsManager
                .connect(user2)
                .createNFT(
                    true,
                    0,
                    1,
                    "this_uri",
                    1000,
                    current + 10,
                    current + 10000,
                    token.address,
                    merkleTree.getHexRoot()
                );

            await skipTime(1000);
            await metaCitizen.mint(user1.address);
            await orderManager.connect(user1).buy(1, merkleTree.getHexProof(generateLeaf(user1.address)));

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);
            await staking.connect(user1).requestUnstake();
            await skipTime(25 * 60 * 60);
            const pendingRewards = await staking.pendingRewards(user1.address);

            await staking.connect(user1).unstake(ONE_ETHER);

            expect(await token.balanceOf(staking.address)).to.equal(subtract(parseEther("1000"), pendingRewards));
        });
    });

    describe("Check EmergencyWithdraw function: ", async () => {
        it("should deposit success: ", async () => {
            await treasury.connect(owner).distribute(token.address, staking.address, 10000);

            await expect(() => staking.emergencyWithdraw()).changeTokenBalance(token, owner, 10000);

            expect(await token.balanceOf(staking.address)).to.equal(0);
            expect(await staking.stakedAmount()).to.equal(await token.balanceOf(staking.address));
        });
    });
});
