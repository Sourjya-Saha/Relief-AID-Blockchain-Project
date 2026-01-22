import { useState, useEffect, useContext, useMemo } from "react";
import { ethers } from "ethers";
import { Web3Context, AuthContext } from "../context/Contexts";
import { contractService, ipfsService } from "../services/Services";
import { categoryMapping, errorHandler } from "../utils/Utils";

// ✅ Polygon Amoy RPC (Read-only fallback)
const AMOY_RPC_URL =
  import.meta.env.VITE_POLYGON_AMOY_RPC || "https://rpc-amoy.polygon.technology/";
const AMOY_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 80002);

// ==================== USE WEB3 ====================
export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) throw new Error("useWeb3 must be used within Web3Provider");
  return context;
};

// ==================== USE AUTH ====================
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

// ==================== BASE CONTRACT HOOK ====================
/**
 * ✅ readContract  : always uses RPC provider (public / without MetaMask)
 * ✅ writeContract : uses signer (MetaMask tx)
 */
export const useContract = (abi, address) => {
  const { signer, provider } = useWeb3();

  const fallbackProvider = useMemo(() => {
    try {
      return new ethers.JsonRpcProvider(AMOY_RPC_URL);
    } catch {
      return null;
    }
  }, []);

  const readProvider = provider || fallbackProvider;

  const readContract = useMemo(() => {
    if (!abi || !address || !readProvider) return null;
    return new ethers.Contract(address, abi, readProvider);
  }, [abi, address, readProvider]);

  const writeContract = useMemo(() => {
    if (!abi || !address || !signer) return null;
    return new ethers.Contract(address, abi, signer);
  }, [abi, address, signer]);

  return { readContract, writeContract };
};

// ==================== RELIEF MANAGER HOOK ====================
export const useReliefManager = (reliefManagerABI, reliefManagerAddress) => {
  const { readContract, writeContract } = useContract(
    reliefManagerABI,
    reliefManagerAddress
  );
  const [loading, setLoading] = useState(false);

  const requireWrite = () => {
    if (!writeContract) {
      throw new Error("Wallet not connected. Please connect MetaMask.");
    }
  };

  const requireRead = () => {
    if (!readContract) {
      throw new Error("ReliefManager contract not initialized yet.");
    }
  };

  // -------------------- WRITE --------------------

  const registerBeneficiary = async (address, profileCID) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.registerBeneficiary(address, profileCID);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const registerBeneficiariesBatch = async (addresses, profileCIDs) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.registerBeneficiariesBatch(
        addresses,
        profileCIDs
      );
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const registerMerchant = async (address, category, name, profileCID) => {
    try {
      requireWrite();
      setLoading(true);

      const categoryEnum = categoryMapping.toEnum(category);
      const tx = await writeContract.registerMerchant(
        address,
        categoryEnum,
        name,
        profileCID
      );
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const registerMerchantsBatch = async (addresses, categories, names, profileCIDs) => {
    try {
      requireWrite();
      setLoading(true);

      const categoryEnums = categories.map((cat) => categoryMapping.toEnum(cat));

      const tx = await writeContract.registerMerchantsBatch(
        addresses,
        categoryEnums,
        names,
        profileCIDs
      );
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const distributeFunds = async (beneficiaryAddress, amount) => {
    try {
      requireWrite();
      setLoading(true);

      const amountWei = ethers.parseEther(amount.toString());
      const tx = await writeContract.distributeFunds(beneficiaryAddress, amountWei);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const distributeFundsBatch = async (addresses, amounts) => {
    try {
      requireWrite();
      setLoading(true);

      const amountsWei = amounts.map((amt) => ethers.parseEther(amt.toString()));
      const tx = await writeContract.distributeFundsBatch(addresses, amountsWei);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const setSpendingLimit = async (beneficiaryAddress, category, limit) => {
    try {
      requireWrite();
      setLoading(true);

      const categoryEnum = categoryMapping.toEnum(category);
      const limitWei = ethers.parseEther(limit.toString());

      const tx = await writeContract.setSpendingLimit(
        beneficiaryAddress,
        categoryEnum,
        limitWei
      );

      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const spend = async (merchantAddress, amount, note = "") => {
    try {
      requireWrite();
      setLoading(true);

      const amountWei = ethers.parseEther(amount.toString());
      const tx = await writeContract.spend(merchantAddress, amountWei, note);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const revokeBeneficiary = async (beneficiaryAddress) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.removeBeneficiary(beneficiaryAddress);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const revokeMerchant = async (merchantAddress) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.removeMerchant(merchantAddress);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const reWhitelistBeneficiary = async (beneficiaryAddress) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.reWhitelistBeneficiary(beneficiaryAddress);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  const reWhitelistMerchant = async (merchantAddress) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.reWhitelistMerchant(merchantAddress);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  // -------------------- READ --------------------

  const getBeneficiaryDetails = async (address) => {
    try {
      requireRead();
      const details = await readContract.getBeneficiaryDetails(address);

      return {
        isWhitelisted: details[0],
        profileCID: details[1],
        registeredAt: Number(details[2]),
        totalReceived: ethers.formatEther(details[3]),
        totalSpent: ethers.formatEther(details[4]),
        currentBalance: ethers.formatEther(details[5]),
        foodSpent: ethers.formatEther(details[6]),
        medicalSpent: ethers.formatEther(details[7]),
        shelterSpent: ethers.formatEther(details[8]),
        foodLimit: ethers.formatEther(details[9]),
        medicalLimit: ethers.formatEther(details[10]),
        shelterLimit: ethers.formatEther(details[11]),
      };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getMerchantDetails = async (address) => {
    try {
      requireRead();
      const details = await readContract.getMerchantDetails(address);

      return {
        isRegistered: details[0],
        category: categoryMapping.toString(details[1]),
        name: details[2],
        profileCID: details[3],
        registeredAt: Number(details[4]),
        totalReceived: ethers.formatEther(details[5]),
        currentBalance: ethers.formatEther(details[6]),
      };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getUserRole = async (address) => {
    try {
      requireRead();
      const roles = await readContract.getUserRole(address);
      return {
        isAdmin: roles[0],
        isBeneficiary: roles[1],
        isMerchant: roles[2],
      };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  /**
   * ✅ UPDATED for new ReliefManager.getSystemStats()
   */
  const getSystemStats = async () => {
    try {
      requireRead();
      const stats = await readContract.getSystemStats();

      return {
        activeBeneficiaries: Number(stats[0]),
        activeMerchants: Number(stats[1]),
        totalBeneficiariesRegistered: Number(stats[2]),
        totalMerchantsRegistered: Number(stats[3]),
        totalTransactions: Number(stats[4]),
        totalDistributed: ethers.formatEther(stats[5]),
        totalSpent: ethers.formatEther(stats[6]),
        contractETHBalance: ethers.formatEther(stats[7]),

        // ✅ If you added treasury tracking in contract
        maxMintableRUSD: stats[8] ? ethers.formatEther(stats[8]) : "0",
        mintedRUSD: stats[9] ? ethers.formatEther(stats[9]) : "0",
      };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getAllBeneficiaries = async () => {
    try {
      requireRead();
      return await readContract.getAllBeneficiaries();
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getAllMerchants = async () => {
    try {
      requireRead();
      return await readContract.getAllMerchants();
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getProfileCID = async (address) => {
    try {
      requireRead();
      return await readContract.getProfileCID(address);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getBeneficiaryTransactions = async (address) => {
    try {
      requireRead();
      return await readContract.getBeneficiaryTransactions(address);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getMerchantTransactions = async (address) => {
    try {
      requireRead();
      return await readContract.getMerchantTransactions(address);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getTransaction = async (txId) => {
    try {
      requireRead();
      return await readContract.getTransaction(txId);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  return {
    readContract,
    writeContract,
    loading,

    // write
    registerBeneficiary,
    registerBeneficiariesBatch,
    registerMerchant,
    registerMerchantsBatch,
    distributeFunds,
    distributeFundsBatch,
    setSpendingLimit,
    spend,
    revokeBeneficiary,
    revokeMerchant,
    reWhitelistBeneficiary,
    reWhitelistMerchant,

    // read
    getBeneficiaryDetails,
    getMerchantDetails,
    getUserRole,
    getSystemStats,
    getAllBeneficiaries,
    getAllMerchants,
    getProfileCID,
    getBeneficiaryTransactions,
    getMerchantTransactions,
    getTransaction,
  };
};

// ==================== RELIEF USD HOOK ====================
export const useReliefUSD = (reliefUSDABI, reliefUSDAddress) => {
  const { readContract, writeContract } = useContract(reliefUSDABI, reliefUSDAddress);
  const [loading, setLoading] = useState(false);

  const requireRead = () => {
    if (!readContract) throw new Error("ReliefUSD contract not initialized yet.");
  };

  const getBalance = async (address) => {
    try {
      requireRead();
      const balance = await readContract.balanceOf(address);
      return ethers.formatEther(balance);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getTotalSupply = async () => {
    try {
      requireRead();
      const supply = await readContract.totalSupply();
      return ethers.formatEther(supply);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  const getAllowance = async (owner, spender) => {
  requireRead();
  const amt = await readContract.allowance(owner, spender);
  return ethers.formatEther(amt);
};

const approve = async (spender, amount) => {
  try {
    if (!writeContract) throw new Error("Wallet not connected");

    const provider = writeContract.runner?.provider;
    const feeData = provider ? await provider.getFeeData() : null;

    const txOverrides = {
      gasLimit: 120000n, // ✅ approve normally small gas
    };

    if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
      txOverrides.maxFeePerGas = feeData.maxFeePerGas;
      txOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else if (feeData?.gasPrice) {
      txOverrides.gasPrice = feeData.gasPrice;
    }

    const amtWei = ethers.parseEther(amount.toString());

    // ✅ simulate approve first
    await writeContract.approve.staticCall(spender, amtWei);

    const tx = await writeContract.approve(spender, amtWei, txOverrides);
    await contractService.waitForTransaction(tx);

    return { success: true, tx };
  } catch (error) {
    throw new Error(errorHandler.handleContractError(error));
  }
};


  return {
    readContract,
    writeContract,
    getAllowance,
    approve,
    loading,
    getBalance,
    getTotalSupply,
  };
};

// ==================== DONATION TREASURY HOOK ====================
export const useDonationTreasury = (treasuryABI, treasuryAddress) => {
  const { readContract, writeContract } = useContract(treasuryABI, treasuryAddress);
  const [loading, setLoading] = useState(false);

  const requireWrite = () => {
    if (!writeContract) {
      throw new Error("Wallet not connected. Please connect MetaMask.");
    }
  };

  const requireRead = () => {
    if (!readContract) {
      throw new Error("DonationTreasury contract not initialized yet.");
    }
  };

  // ✅ On-chain POL donation
  const donatePOL = async (amountPOL) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.donate({
        value: ethers.parseEther(amountPOL.toString()),
      });

      await contractService.waitForTransaction(tx);
      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Merchant: Redeem RUSD -> POL on-chain
  const redeemOnChain = async (rusdAmount) => {
    try {
      requireWrite();
      setLoading(true);

      const amtWei = ethers.parseEther(rusdAmount.toString());
      const tx = await writeContract.redeemOnChain(amtWei);

      await contractService.waitForTransaction(tx);
      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Merchant: Off-chain redemption request (CID stored)
  const requestOffchainRedemption = async (rusdAmount, cid) => {
    try {
      requireWrite();
      setLoading(true);

      const amtWei = ethers.parseEther(rusdAmount.toString());
      const tx = await writeContract.requestOffchainRedemption(amtWei, cid);

      await contractService.waitForTransaction(tx);
      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Admin: Fulfill off-chain redemption request
  const fulfillOffchainRedemption = async (requestId, proofCID) => {
    try {
      requireWrite();
      setLoading(true);

      const tx = await writeContract.fulfillOffchainRedemption(requestId, proofCID);
      await contractService.waitForTransaction(tx);

      return { success: true, tx };
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Read donation pool stats (optional - depends on your contract functions)
  const getTreasuryBalance = async () => {
    try {
      requireRead();
      const bal = await readContract.getTreasuryBalance();
      return ethers.formatEther(bal);
    } catch (error) {
      throw new Error(errorHandler.handleContractError(error));
    }
  };

  return {
    readContract,
    writeContract,
    loading,

    donatePOL,
    redeemOnChain,
    requestOffchainRedemption,
    fulfillOffchainRedemption,
    getTreasuryBalance,
  };
};

// ==================== IPFS HOOK ====================
export const useIPFS = () => {
  const [loading, setLoading] = useState(false);

  const uploadBeneficiaryProfile = async (data) => {
    try {
      setLoading(true);
      return await ipfsService.uploadBeneficiaryProfile(data);
    } finally {
      setLoading(false);
    }
  };

  const uploadMerchantProfile = async (data) => {
    try {
      setLoading(true);
      return await ipfsService.uploadMerchantProfile(data);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Redemption request upload
  const uploadRedemptionRequest = async (data) => {
    try {
      setLoading(true);
      return await ipfsService.uploadRedemptionRequest(data);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Proof upload
  const uploadRedemptionProof = async (file, requestId, merchantWallet) => {
    try {
      setLoading(true);
      return await ipfsService.uploadRedemptionProof(file, requestId, merchantWallet);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (cid) => {
    try {
      setLoading(true);
      return await ipfsService.fetchProfile(cid);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,

    uploadBeneficiaryProfile,
    uploadMerchantProfile,
    uploadRedemptionRequest,
    uploadRedemptionProof,
    fetchProfile,
  };
};

// ==================== PROFILE HOOK ====================
export const useProfile = (reliefManagerContract) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = async (address) => {
    try {
      if (!reliefManagerContract || !address) return;
      setLoading(true);

      const cid = await reliefManagerContract.getProfileCID(address);
      if (cid) {
        const profileData = await ipfsService.fetchProfile(cid);
        setProfile(profileData.data);
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return { profile, loading, loadProfile };
};

// ==================== TRANSACTION HOOK ====================
export const useTransactions = (reliefManagerContract) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTransactions = async (userAddress, isBeneficiary = true) => {
    try {
      if (!reliefManagerContract || !userAddress) return;
      setLoading(true);

      const txIds = isBeneficiary
        ? await reliefManagerContract.getBeneficiaryTransactions(userAddress)
        : await reliefManagerContract.getMerchantTransactions(userAddress);

      const txList = [];
      for (let i = 0; i < txIds.length; i++) {
        const tx = await reliefManagerContract.getTransaction(txIds[i]);

        txList.push({
          id: Number(txIds[i]),
          beneficiary: tx[0],
          merchant: tx[1],
          amount: ethers.formatEther(tx[2]),
          category: categoryMapping.toString(tx[3]),
          timestamp: Number(tx[4]),
          note: tx[5],
        });
      }

      setTransactions(txList);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  return { transactions, loading, loadTransactions };
};

// ==================== ROLE HOOK ====================
export const useRole = (reliefManagerContract) => {
  const { account } = useWeb3();
  const { updateUserRole } = useAuth();

  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkRole = async () => {
    try {
      if (!account || !reliefManagerContract) return null;

      setLoading(true);
      const roles = await reliefManagerContract.getUserRole(account);

      let userRole = null;
      if (roles[0]) userRole = "ADMIN";
      else if (roles[1]) userRole = "BENEFICIARY";
      else if (roles[2]) userRole = "MERCHANT";

      setRole(userRole);
      updateUserRole(userRole);

      return userRole;
    } catch (error) {
      console.error("Failed to check role:", error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account && reliefManagerContract) checkRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  return { role, loading, checkRole };
};
