import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "../contracts/src",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
  },
};

export default config;
