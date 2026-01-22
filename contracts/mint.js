// mint-fast.js - HARDCODED PRIVATE KEY VERSION
const ethers = require('ethers');

async function mint() {
  // ✅ FIXED: Your private key with 0x prefix + padded to 64 chars
  const PRIVATE_KEY = "0820742a1971dd881ba93a5d252fe07a517a7b751079177241b4370f8c7da2f3"; // padded
  
  const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology/');
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('📍 Wallet address:', wallet.address);
  
  const contract = new ethers.Contract(
    '0xBAaB408Ff99e7150eF5dd0818f1DBAD0094fC124',
    ['function mint(address to, uint256 amount) external'],
    wallet
  );

  console.log('🚀 Minting 10,000 RUSD...');
  const tx = await contract.mint(wallet.address, ethers.parseUnits('10000', 18));
  console.log('⛏️ Tx hash:', tx.hash);
  
  await tx.wait();
  console.log('✅ SUCCESS! Refresh MetaMask - 10,000 RUSD will appear!');
}

mint().catch(console.error);
