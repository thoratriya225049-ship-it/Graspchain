import type { HardhatUserConfig } from "hardhat/config";
import { configVariable } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatIgnitionEthers from "@nomicfoundation/hardhat-ignition-ethers";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

/**
 * Networks:
 *  - default (in-process EDR) for tests
 *  - localhost: `pnpm chain:local` (Hardhat node, chain id 31337) — the demo fallback chain
 *  - sepolia: needs SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY (env or `hardhat keystore`);
 *    `--verify` needs ETHERSCAN_API_KEY. Contract verification via the Etherscan API.
 */
const config: HardhatUserConfig = {
  plugins: [hardhatEthers, hardhatIgnitionEthers, hardhatNetworkHelpers, hardhatNodeTestRunner, hardhatVerify],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // HARDHAT_LOCAL_RPC lets the Docker deployer reach the chain container.
    localhost: { type: "http", chainType: "l1", url: process.env.HARDHAT_LOCAL_RPC ?? "http://127.0.0.1:8545" },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
};

export default config;
