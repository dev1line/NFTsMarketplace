const Big = require("big.js");
const { subtract, compareTo } = require("js-big-decimal");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { provider } = ethers;
const { AddressZero: ADDRESS_ZERO, MaxUint256: MAX_UINT256 } = ethers.constants;

function BN(value) {
  return BigNumber.from(value.toString());
}

const skipTime = async seconds => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

const setTime = async time => {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
};

const getProfit = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .minus(1)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const getProfitRoot = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const skipBlock = async blockNumber => {
  for (let index = 0; index < blockNumber; index++) {
    await hre.ethers.provider.send("evm_mine");
  }
};

const getCurrentBlock = async () => {
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  return latestBlock.number;
};

const acceptable = (expected, actual, eps) => {
  return compareTo(eps, subtract(expected, actual).replace("-", "")) !== -1;
};

const getCurrentTime = async () => {
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const block = await hre.ethers.provider.getBlock(blockNumber);
  return block.timestamp;
};

const generateMerkleTree = accounts => {
  const leaves = accounts.map(value => keccak256(value));
  return new MerkleTree(leaves, keccak256, { sort: true });
};

const generateLeaf = account => {
  return keccak256(account);
};

async function getBalance(address, tokenAddress = ADDRESS_ZERO) {
  if (tokenAddress === ADDRESS_ZERO) return provider.getBalance(address);
  else
    return (await ethers.getContractFactory("ERC20Upgradeable"))
      .attach(tokenAddress)
      .balanceOf(address);
}

async function getTxInfo(transaction) {
  try {
    const transactionResponse = await transaction;
    const transactionReceipt = await transactionResponse.wait();
    const gasUsed = transactionReceipt.gasUsed;
    return {
      ...transactionReceipt,
      fee: gasUsed.mul(transactionReceipt.effectiveGasPrice)
    };
  } catch (error) {
    if (!error.transactionHash) throw error;

    const transactionReceipt = await ethers.provider.getTransactionReceipt(
      error.transactionHash
    );
    const gasUsed = transactionReceipt.gasUsed;

    return {
      error,
      ...transactionReceipt,
      fee: gasUsed.mul(transactionReceipt.effectiveGasPrice)
    };
  }
}

async function updateTxInfo(transaction, onUpdate) {
  const txInfo = await getTxInfo(transaction);
  await onUpdate(txInfo);
  return transaction;
}

async function decodeEvent(transaction, eventName, contractInterface) {
  const receipt = await provider.getTransactionReceipt(transaction.hash);
  const data = receipt.logs[0].data;
  const topics = receipt.logs[0].topics;
  return contractInterface.decodeEventLog(eventName, data, topics);
}

class BalanceTracker {
  totalFee = BN(0);
  snapshots = {};
  wallet = ADDRESS_ZERO;
  coins = [ADDRESS_ZERO];

  static instances = [];

  static async updateFee(transaction) {
    const { from, fee } = await getTxInfo(transaction);

    const instance = BalanceTracker.instances[from];
    instance.totalFee = instance.totalFee.add(fee);

    return transaction;
  }

  static expect(transaction) {
    if (typeof transaction == "function")
      return expect(() => BalanceTracker.updateFee(transaction()));
    else return expect(BalanceTracker.updateFee(transaction));
  }

  constructor(wallet, tokens = []) {
    this.wallet = wallet;
    this.coins = [...this.coins, ...tokens];

    BalanceTracker.instances[wallet] = this;
  }

  addToken(address) {
    this.coins = [...this.coins, address];
  }

  async takeSnapshot(name) {
    const snapshot = {};
    for (let coinId in this.coins) {
      const coin = this.coins[coinId];
      snapshot[coin] = await getBalance(this.wallet, coin);
    }

    this.snapshots[name] = snapshot;
    return this.snapshots;
  }

  diff(snapshotNameA, snapshotNameB) {
    if (!(this.snapshots[snapshotNameA] && this.snapshots[snapshotNameB]))
      throw new Error("Snapshot is not found");

    const result = {};

    const snapshot1 = this.snapshots[snapshotNameA];
    const snapshot2 = this.snapshots[snapshotNameB];

    for (let coinId in this.coins) {
      const coin = this.coins[coinId];
      const balanceBefore = snapshot1[coin];
      const balanceAfter = snapshot2[coin];

      result[coin] = {
        balanceBefore,
        balanceAfter,
        delta: balanceAfter.sub(balanceBefore)
      };
    }

    return result;
  }

  reset() {
    this.totalFee = BN(0);
    this.snapshots = {};
  }

  resetTotalFee() {
    this.totalFee = BN(0);
  }
}

BalanceTracker.prototype.instances = {};

module.exports = {
  provider,
  BN,
  ADDRESS_ZERO,
  MAX_UINT256,
  skipTime,
  setTime,
  getProfit,
  getProfitRoot,
  skipBlock,
  getCurrentBlock,
  acceptable,
  getCurrentTime,
  generateMerkleTree,
  generateLeaf,
  getBalance,
  getTxInfo,
  updateTxInfo,
  decodeEvent,
  BalanceTracker
};
