const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Relief Aid System...");

  // Deploy ReliefUSD
  const ReliefUSD = await ethers.getContractFactory("ReliefUSD");
  const token = await ReliefUSD.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ ReliefUSD deployed to:", tokenAddress);

  // Deploy ReliefManager
  const ReliefManager = await ethers.getContractFactory("ReliefManager");
  const manager = await ReliefManager.deploy(tokenAddress);
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  console.log("✅ ReliefManager deployed to:", managerAddress);

  // Grant MINTER_ROLE to manager
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await token.grantRole(MINTER_ROLE, managerAddress);
  console.log("✅ Granted MINTER_ROLE to ReliefManager");

  // Set ReliefManager in token
  await token.setReliefManager(managerAddress);
  console.log("✅ Set ReliefManager in token contract");

  console.log("\n📋 SAVE THESE ADDRESSES:");
  console.log("RELIEF_USD_ADDRESS=", tokenAddress);
  console.log("RELIEF_MANAGER_ADDRESS=", managerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });