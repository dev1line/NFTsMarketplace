const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;
const { multiply } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = ethers.utils;
const aggregator_abi = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json");
const ether = require("@openzeppelin/test-helpers/src/ether");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const REWARD_RATE = 15854895992; // 50 % APY
const poolDuration = 9 * 30 * 24 * 60 * 60; // 9 months
// const OVER_AMOUNT = parseEther("1000000");
const ONE_MILLION_ETHER = parseEther("1000000");
// const ONE_YEAR = 31104000;
const TOTAL_SUPPLY = parseEther("1000000000000");
const MINT_FEE = 1000;
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

describe("Marketplace interact with Staking Pool:", () => {
    before(async () => {
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

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(usd.address, true);
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

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();
        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
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
        await admin.setAdmin(mtvsManager.address, true);

        await mkpManager.setOrderManager(orderManager.address);
        await mkpManager.setMarketplaceManager(mtvsManager.address);
    });

    describe("Setup: Set permitted tokens => Set start time for staking pool", () => {
        it("Set permitted tokens", async () => {
            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(AddressZero)).to.equal(true);

            await admin.setPermittedPaymentToken(token.address, false);
            await admin.setPermittedPaymentToken(usd.address, false);
            await admin.setPermittedPaymentToken(AddressZero, false);

            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(AddressZero)).to.equal(false);
        });

        it("Set start time for staking pool", async () => {
            await staking.setStartTime(CURRENT);
            expect(await staking.startTime()).to.equal(CURRENT);
        });

        it("Buy NFT in marketplace to stake MTVS token", async () => {
            await admin.setPermittedPaymentToken(token.address, true);
            await admin.setPermittedPaymentToken(usd.address, true);
            await admin.setPermittedPaymentToken(AddressZero, true);

            await staking.setStartTime(CURRENT);
            const current = await getCurrentTime();
            await metaCitizen.mint(user1.address);

            const leaves = [user1.address, user2.address].map((value) => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            const rootHash = merkleTree.getHexRoot();
            await mtvsManager
                .connect(user2)
                .createNFT(true, 0, 1, "this_uri", 1000, current + 10, current + 1000000, token.address, rootHash);
            await skipTime(1000);
            // const mid = await mkpManager.fetchMarketItemsByMarketID(1);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);
            await treasury.connect(owner).distribute(token.address, user1.address, parseEther("1000"));
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await orderManager.connect(user1).buy(1, proof);

            await token.connect(user1).approve(staking.address, ONE_MILLION_ETHER);
            await token.connect(user3).approve(staking.address, ONE_MILLION_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);
            // User3 cannot allow to stake because don't buy anything
            await expect(staking.connect(user3).stake(ONE_ETHER)).to.be.reverted;
        });
    });
});
