const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { AddressZero } = ethers.constants;
const aggregator_abi = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

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

describe("Pool Factory:", () => {
    beforeEach(async () => {
        REWARD_RATE = 15854895992; // 50 % APY
        POOL_DURATION = 9 * 30 * 24 * 60 * 60; // 9 months
        OVER_AMOUNT = ethers.utils.parseEther("1000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_YEAR = 31104000;
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        PRICE = 10000;
        // PANCAKE_ROUTER = "0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F";
        USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        PANCAKE_ROUTER = await deployMockContract(owner, abi);
        AGGREGATOR = await deployMockContract(owner, aggregator_abi.abi);
        await PANCAKE_ROUTER.mock.getAmountsOut.returns([ONE_ETHER, multiply(500, ONE_ETHER)]);

        await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);

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

        Staking = await ethers.getContractFactory("StakingPool");
        staking = await Staking.deploy();

        CURRENT = await getCurrentTime();

        PoolFactory = await ethers.getContractFactory("PoolFactory");
        poolFactory = await upgrades.deployProxy(PoolFactory, [staking.address, admin.address]);
        await poolFactory.deployed();

        await admin.setAdmin(mtvsManager.address, true);

        await mkpManager.setOrderManager(orderManager.address);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, AddressZero])).to.revertedWith(
                `InValidAdminContract("${AddressZero}")`
            );
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, user1.address])).to.reverted;
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, treasury.address])).to.reverted;
        });

        it("Should be ok", async () => {
            expect(await poolFactory.template()).to.equal(staking.address);
            expect(await poolFactory.admin()).to.equal(admin.address);
        });
    });

    describe("create:", async () => {
        it("should revert when contract is paused", async () => {
            await poolFactory.setPause(true);
            expect(await poolFactory.paused()).to.equal(true);

            await expect(
                poolFactory.create(
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    POOL_DURATION,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    AGGREGATOR.address
                )
            ).to.revertedWith("Pausable: paused");
        });

        it("Only admin can call this function:", async () => {
            await expect(
                poolFactory
                    .connect(user1)
                    .create(
                        token.address,
                        token.address,
                        mkpManager.address,
                        REWARD_RATE,
                        POOL_DURATION,
                        PANCAKE_ROUTER.address,
                        USD_TOKEN,
                        AGGREGATOR.address
                    )
            ).to.revertedWith("CallerIsNotOwnerOrAdmin()");
        });

        it("should be ok: ", async () => {
            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            expect((await poolFactory.getAllPool()).length).to.equal(1);

            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            expect((await poolFactory.getAllPool()).length).to.equal(2);
        });
    });

    // GET FUNC
    describe("getPool:", async () => {
        it("should return a pool address: ", async () => {
            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            const addressPool = await poolFactory.getPool(1);
        });
    });
    describe("getPoolInfo:", async () => {
        it("should return pool info: ", async () => {
            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            const poolInfo = await poolFactory.getPoolInfo(1);
            const addressPool = await poolFactory.getPool(1);
            expect(poolInfo.poolAddress).to.equal(addressPool);
        });
    });
    describe("getAllPool:", async () => {
        it("should return all pool info: ", async () => {
            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            await poolFactory.create(
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER.address,
                USD_TOKEN,
                AGGREGATOR.address
            );
            const allPool = await poolFactory.getAllPool();
            expect(allPool.length).to.equal(2);
        });
    });
});
