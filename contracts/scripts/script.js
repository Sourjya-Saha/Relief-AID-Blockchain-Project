const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying Relief Aid System (Donation + Redemption)...");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("🌐 Network:", hre.network.name, " ChainId:", chainId);

  const DEFAULT_RATE = 1000; // 1 POL = 1000 RUSD

  // ==========================================================
  // 1) Deploy ReliefUSD
  // ==========================================================
  const ReliefUSD = await ethers.getContractFactory("ReliefUSD");
  const reliefUSD = await ReliefUSD.deploy();
  await reliefUSD.waitForDeployment();
  const reliefUSDAddress = await reliefUSD.getAddress();
  console.log("✅ ReliefUSD deployed:", reliefUSDAddress);

  // ==========================================================
  // 2) Deploy DonationTreasury
  // ==========================================================
  const DonationTreasury = await ethers.getContractFactory("DonationTreasury");
  const donationTreasury = await DonationTreasury.deploy(reliefUSDAddress);
  await donationTreasury.waitForDeployment();
  const donationTreasuryAddress = await donationTreasury.getAddress();
  console.log("✅ DonationTreasury deployed:", donationTreasuryAddress);

  // ==========================================================
  // 3) Deploy ReliefManager
  // ==========================================================
  const ReliefManager = await ethers.getContractFactory("ReliefManager");
  const reliefManager = await ReliefManager.deploy(reliefUSDAddress);
  await reliefManager.waitForDeployment();
  const reliefManagerAddress = await reliefManager.getAddress();
  console.log("✅ ReliefManager deployed:", reliefManagerAddress);

  // ==========================================================
  // 4) Setup Roles (CRITICAL)
  // ==========================================================
  console.log("\n🔐 Setting roles...");

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  // ✅ DonationTreasury must mint on donation
  let tx = await reliefUSD.grantRole(MINTER_ROLE, donationTreasuryAddress);
  await tx.wait();
  console.log("✅ Granted MINTER_ROLE to DonationTreasury");

  // ✅ ReliefManager can mint in emergency/admin actions
  tx = await reliefUSD.grantRole(MINTER_ROLE, reliefManagerAddress);
  await tx.wait();
  console.log("✅ Granted MINTER_ROLE to ReliefManager");

  // ✅ MANAGER roles (restricted transfers)
  tx = await reliefUSD.setManager(reliefManagerAddress, true);
  await tx.wait();
  console.log("✅ Set ReliefManager as MANAGER");

  tx = await reliefUSD.setManager(donationTreasuryAddress, true);
  await tx.wait();
  console.log("✅ Set DonationTreasury as MANAGER");

  // ==========================================================
  // 5) Link contracts (FIX FOR YOUR ERROR)
  // ==========================================================
  console.log("\n🔗 Linking contracts...");

  tx = await reliefManager.setTreasury(donationTreasuryAddress);
  await tx.wait();
  console.log("✅ Treasury linked inside ReliefManager");

  // ✅ THIS FIXES: "ReliefManager not set"
  tx = await donationTreasury.setReliefManager(reliefManagerAddress);
  await tx.wait();
  console.log("✅ ReliefManager set inside DonationTreasury");

  // ==========================================================
  // 6) Set Exchange Rate
  // ==========================================================
  console.log("\n⚖️ Setting POL → RUSD rate...");

  tx = await reliefManager.setPolToRusdRate(DEFAULT_RATE);
  await tx.wait();
  console.log(`✅ ReliefManager rate set: 1 POL = ${DEFAULT_RATE} RUSD`);

  tx = await donationTreasury.setPolToRusdRate(DEFAULT_RATE);
  await tx.wait();
  console.log(`✅ DonationTreasury rate set: 1 POL = ${DEFAULT_RATE} RUSD`);

  // ==========================================================
  // 7) Save addresses.json
  // ==========================================================
  console.log("\n💾 Saving addresses.json...");

  const addresses = {
    [chainId]: {
      ReliefUSD: reliefUSDAddress,
      ReliefManager: reliefManagerAddress,
      DonationTreasury: donationTreasuryAddress,
      deployedBy: deployer.address,
      network: hre.network.name,
      rate: DEFAULT_RATE,
      timestamp: new Date().toISOString(),
    },
  };

  const outPath = path.join(
    __dirname,
    "..",
    "frontend",
    "src",
    "contracts",
    "addresses.json"
  );

  let existing = {};
  if (fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch (_) {
      existing = {};
    }
  }

  const merged = { ...existing, ...addresses };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log("✅ addresses.json updated:", outPath);

  console.log("\n📌 DEPLOYMENT COMPLETE ✅");
  console.log("ReliefUSD        :", reliefUSDAddress);
  console.log("ReliefManager    :", reliefManagerAddress);
  console.log("DonationTreasury :", donationTreasuryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
