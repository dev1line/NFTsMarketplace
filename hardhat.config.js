// Loading env configs for deploying and public contract source
require("dotenv").config();

// Using hardhat-ethers plugin for deploying
// See here: https://hardhat.org/plugins/nomiclabs-hardhat-ethers.html
//           https://hardhat.org/guides/deploying.html
require("@nomiclabs/hardhat-ethers");

// Testing plugins with Waffle
// See here: https://hardhat.org/guides/waffle-testing.html
require("@nomiclabs/hardhat-waffle");

// Verify and public source code on etherscan
require("@nomiclabs/hardhat-etherscan");

// Upgradeable
require("@openzeppelin/hardhat-upgrades");

// Coverage testing
require("solidity-coverage");

// check size
require("hardhat-contract-sizer");

// reporter
require("hardhat-gas-reporter");
const config = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: { count: 100 }
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: [process.env.DEPLOY_ACCOUNT],
      chainId: 97
    },
    mainnet: {
      url: "https://bsc-dataseed1.ninicoin.io",
      accounts: [process.env.DEPLOY_ACCOUNT],
      gas: 2100000,
      gasPrice: 8000000000,
      chainId: 56
    }
  },
  etherscan: {
    apiKey: process.env.BINANCE_API_KEY
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
            details: { yul: true }
          }
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "deploy",
    deployments: "deployments"
  },
  mocha: {
    timeout: 200000,
    useColors: true,
    reporter: "mocha-multi-reporters",
    reporterOptions: {
      configFile: "./mocha-report.json"
    }
  },
  gasReporter: {
    currency: "BNB",
    gasPrice: 21,
    enabled: false // process.env.REPORT_GAS ? true :
  }
};

module.exports = config;
