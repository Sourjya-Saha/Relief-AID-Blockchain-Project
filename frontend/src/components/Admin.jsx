import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import {
  useWeb3,
  useReliefManager,
  useReliefUSD,
  useContract,
} from "../hooks/Web3Hooks";
import { ipfsService } from "../services/Services";
import { LoadingSpinner, Modal, TransactionStatus } from "./Common";
import { formatters, validators } from "../utils/Utils";
import { fetchOnchainRedemptions } from "../utils/redemptionLogs";

import ReliefManagerABI from "../contracts/ReliefManager.json";
import ReliefUSDABI from "../contracts/ReliefUSD.json";
import DonationTreasuryABI from "../contracts/DonationTreasury.json";
import addresses from "../contracts/addresses.json";
import { useIPFS } from "../hooks/Web3Hooks";

// ============================================
// SKELETON COMPONENTS
// ============================================

const SkeletonBlock = ({ className = "" }) => (
  <div
    className={`
      relative overflow-hidden rounded-lg
      bg-gradient-to-r from-gray-900/70 via-gray-800/70 to-gray-900/70
      animate-pulse border border-gray-800/60
      ${className}
    `}
  >
    <div
      className="absolute inset-0 -translate-x-full
      animate-[shimmer_2s_infinite]
      bg-gradient-to-r from-transparent via-white/5 to-transparent"
    />
  </div>
);

const DashboardSkeleton = () => (
  <div className="min-h-screen bg-[#0B0F14] text-white">
    <style>{skeletonCSS}</style>

    <div
      className="absolute inset-0 opacity-[0.04] pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
        `,
        backgroundSize: "45px 45px",
      }}
    />

    <div className="relative max-w-7xl mx-auto px-4 py-8 sm:py-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12">
        <div className="sk h-10 w-64" />
        <div className="sk h-10 w-32" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
        {[...Array(15)].map((_, i) => (
          <div key={i} className="sk h-28" />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-10">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="sk h-24" />
        ))}
      </div>

      {/* Admin Controls */}
      <div className="sk h-96 mb-10" />

      {/* Tables */}
      <div className="sk h-[600px]" />

    </div>
  </div>
);



// ============================================
// HELPERS
// ============================================

const getLegacyOverrides = async (contract, gasLimit = 250000) => {
  const provider = contract?.runner?.provider;

  let gasPrice = ethers.parseUnits("30", "gwei");
  try {
    if (provider?.getFeeData) {
      const feeData = await provider.getFeeData();
      if (feeData?.gasPrice) gasPrice = feeData.gasPrice;
    } else if (provider?.send) {
      const gasPriceHex = await provider.send("eth_gasPrice", []);
      gasPrice = BigInt(gasPriceHex);
    }
  } catch (e) {
    console.warn("⚠️ getFeeData failed, using fallback gasPrice", e);
  }

  return {
    gasLimit,
    gasPrice,
  };
};

const getChainKey = (chainId) => {
  if (!chainId) return null;

  if (typeof chainId === "number") return String(chainId);
  if (typeof chainId === "bigint") return String(Number(chainId));

  if (typeof chainId === "string") {
    if (chainId.startsWith("0x")) return String(parseInt(chainId, 16));
    return String(chainId);
  }

  return null;
};

const askConfirm = (message) => window.confirm(message);

const statusLabel = (s) => {
  if (s === 0) return { text: "PENDING", color: "cyan" };
  if (s === 1) return { text: "FULFILLED", color: "emerald" };
  return { text: "REJECTED", color: "red" };
};

// ============================================================
// ADMIN DASHBOARD
// ============================================================
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { account, chainId, provider } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefUSD : null
  );

  // DonationTreasury
  const donationTreasuryAddress = chainKey
    ? addresses?.[chainKey]?.DonationTreasury
    : null;

  const donationTreasury = useContract(
    DonationTreasuryABI.abi,
    donationTreasuryAddress
  );

  // -----------------------------
  // STATE
  // -----------------------------
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Offchain redemption requests
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Admin tx box (controls)
  const [adminTxStatus, setAdminTxStatus] = useState(null);
  const [adminTxHash, setAdminTxHash] = useState(null);
  const [adminTxError, setAdminTxError] = useState(null);

  // Forms
  const [newRate, setNewRate] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");

  // ✅ Proof file states per requestId
  const [fulfillProofFiles, setFulfillProofFiles] = useState({});
  const [rejectProofFiles, setRejectProofFiles] = useState({});

  // ✅ On-chain redemptions state
  const [onchainRedemptions, setOnchainRedemptions] = useState([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);
const ipfsService = useIPFS();
const [cidDetailsMap, setCidDetailsMap] = useState({}); 
// { [requestId]: { upiId, inrAmount, note, merchantWallet, ... } }
const fetchRequestDetailsFromCID = async (cid) => {
  try {
    if (!cid) return null;

    const res = await fetch(`http://localhost:5000/api/ipfs/${cid}`);
    const raw = await res.json();

    console.log("📦 CID RAW RESPONSE:", cid, raw);

    if (!raw?.success) return null;

    // ✅ IMPORTANT: normalize possible response shapes
    const payload =
      raw?.data?.data ||   // case: { data: { data: {...} } }
      raw?.data ||         // case: { data: {...} }
      raw?.json ||         // case: { json: {...} }
      raw;                 // fallback

    // ✅ Normalize keys (some might be different)
    const normalized = {
      merchantWallet:
        payload?.merchantWallet || payload?.merchant || payload?.wallet || "",
      rusdAmount: payload?.rusdAmount || payload?.rusd || "",
      inrAmount: payload?.inrAmount || payload?.inr || "",
      upiId: payload?.upiId || payload?.upi || "",
      note: payload?.note || payload?.remarks || "",
      upiLink: payload?.upiLink || payload?.upi_url || "",
    };

    return normalized;
  } catch (err) {
    console.error("❌ fetchRequestDetailsFromCID failed:", err);
    return null;
  }
};


  // ✅ Load on-chain redemptions
  const loadOnchainRedemptions = async () => {
    try {
      setLoadingOnchain(true);

      if (!provider) throw new Error("Provider not ready");
      if (!donationTreasuryAddress) throw new Error("Treasury address missing");

      const res = await fetchOnchainRedemptions({
        provider,
        donationTreasuryAddress,
        abi: DonationTreasuryABI.abi,
        chunkSize: 5000,
      });

      if (!res.success) throw new Error(res.error);

      setOnchainRedemptions(res.data);
    } catch (err) {
      console.error("loadOnchainRedemptions failed:", err);
      setOnchainRedemptions([]);
    } finally {
      setLoadingOnchain(false);
    }
  };

  useEffect(() => {
    if (!account) return;
    if (!provider) return;
    if (!donationTreasuryAddress) return;

    loadOnchainRedemptions();
  }, [account, provider, donationTreasuryAddress]);

  const resetAdminTx = () => {
    setAdminTxStatus(null);
    setAdminTxHash(null);
    setAdminTxError(null);
  };

  // -----------------------------
  // LOAD REQUESTS
  // -----------------------------
  const loadRequests = async () => {
  try {
    setLoadingRequests(true);

    if (!donationTreasury?.readContract)
      throw new Error("DonationTreasury contract not ready");

    const total = Number(await donationTreasury.readContract.getTotalRequests());

    if (!total || total === 0) {
      setRequests([]);
      return;
    }

    const list = [];

    for (let i = total - 1; i >= 0; i--) {
      const r = await donationTreasury.readContract.redemptionRequests(i);

      const reqObj = {
        id: i,
        merchant: r.merchant,
        rusdAmount: ethers.formatEther(r.rusdAmount),
        requestCID: r.requestCID,
        fulfillmentCID: r.fulfillmentCID,
        timestamp: Number(r.timestamp),
        status: Number(r.status),
      };

      list.push(reqObj);
    }

    setRequests(list);

    // ✅ fetch CID details for all requests
  const cidMapCopy = {};
await Promise.all(
  list.map(async (req) => {
    if (!req.requestCID) return;
    const details = await fetchRequestDetailsFromCID(req.requestCID);

    console.log("✅ CID DETAILS:", req.id, details);

    if (details) cidMapCopy[req.id] = details;
  })
);

setCidDetailsMap(cidMapCopy);

  } catch (err) {
    console.error("Failed to load redemption requests:", err);
    setRequests([]);
    setCidDetailsMap({});
  } finally {
    setLoadingRequests(false);
  }
};


  // -----------------------------
  // LOAD STATS
  // -----------------------------
  const loadStats = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager contract not ready");
      if (!reliefUSD?.readContract) throw new Error("ReliefUSD not ready");

      const systemStats = await reliefManager.readContract.getSystemStats();
      const totalSupplyBN = await reliefUSD.readContract.totalSupply();
      const totalSupply = ethers.formatEther(totalSupplyBN);

      const beneficiariesList = await reliefManager.getAllBeneficiaries();
      const merchantsList = await reliefManager.getAllMerchants();

      const uniqueBeneficiaries = [...new Set(beneficiariesList)];
      const uniqueMerchants = [...new Set(merchantsList)];

      let activeBeneficiaryCount = 0;
      let revokedBeneficiaryCount = 0;
      let activeMerchantCount = 0;
      let revokedMerchantCount = 0;
      let totalDistributedWei = 0n;
      let totalSpentWei = 0n;

      await Promise.all(
        uniqueBeneficiaries.map(async (addr) => {
          const details = await reliefManager.getBeneficiaryDetails(addr);
          if (details.isWhitelisted) activeBeneficiaryCount++;
          else revokedBeneficiaryCount++;

          const receivedWei = ethers.parseEther(
            (details.totalReceived ?? "0").toString()
          );
          const spentWei = ethers.parseEther(
            (details.totalSpent ?? "0").toString()
          );

          totalDistributedWei += receivedWei;
          totalSpentWei += spentWei;
        })
      );

      await Promise.all(
        uniqueMerchants.map(async (addr) => {
          const details = await reliefManager.getMerchantDetails(addr);
          if (details.isRegistered) activeMerchantCount++;
          else revokedMerchantCount++;
        })
      );

      let treasuryBalancePOL = "0";
      let totalDonatedPOL = "0";
      let totalRedeemedPOL = "0";
      let totalRedeemedRUSD = "0";
      let polToRusdRate = 0;
      let totalRequests = 0;

      if (donationTreasury?.readContract) {
        treasuryBalancePOL = ethers.formatEther(
          await donationTreasury.readContract.treasuryBalance()
        );

        totalDonatedPOL = ethers.formatEther(
          await donationTreasury.readContract.totalDonatedPOL()
        );

        totalRedeemedPOL = ethers.formatEther(
          await donationTreasury.readContract.totalRedeemedPOL()
        );

        totalRedeemedRUSD = ethers.formatEther(
          await donationTreasury.readContract.totalRedeemedRUSD()
        );

        polToRusdRate = Number(await donationTreasury.readContract.polToRusdRate());

        totalRequests = Number(
          await donationTreasury.readContract.getTotalRequests()
        );
      } else if (provider && donationTreasuryAddress) {
        const balWei = await provider.getBalance(donationTreasuryAddress);
        treasuryBalancePOL = ethers.formatEther(balWei);
      }

      const distributableRUSD =
        parseFloat(treasuryBalancePOL || "0") * Number(polToRusdRate || 0);

      setStats({
        activeBeneficiaries: activeBeneficiaryCount,
        revokedBeneficiaries: revokedBeneficiaryCount,
        registeredBeneficiaries: uniqueBeneficiaries.length,
        activeMerchants: activeMerchantCount,
        revokedMerchants: revokedMerchantCount,
        registeredMerchants: uniqueMerchants.length,
        totalTransactions: Number(systemStats?.[2] ?? 0),
        totalDistributed: ethers.formatEther(totalDistributedWei),
        totalSpent: ethers.formatEther(totalSpentWei),
        totalSupply,
        treasuryBalancePOL,
        totalDonatedPOL,
        totalRedeemedPOL,
        totalRedeemedRUSD,
        polToRusdRate,
        totalRequests,
        distributableRUSD: distributableRUSD.toString(),
      });
    } catch (error) {
      console.error("Failed to load admin stats:", error);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // ADMIN CONTROLS
  // -----------------------------
  const getLegacyOverrides = async (contract, gasLimit = 500000) => {
    const provider = contract?.runner?.provider;
    const fallbackGasPrice = ethers.parseUnits("30", "gwei");
    let gasPrice = fallbackGasPrice;

    try {
      if (provider?.send) {
        const gp = await provider.send("eth_gasPrice", []);
        gasPrice = BigInt(gp);
      } else if (provider?.getFeeData) {
        const feeData = await provider.getFeeData();
        if (feeData?.gasPrice) gasPrice = feeData.gasPrice;
      }
    } catch (e) {
      console.warn("⚠️ gasPrice fetch failed → using fallback", e);
    }

    return { gasLimit, gasPrice };
  };

  const handleUpdateRate = async () => {
    try {
      resetAdminTx();
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / not admin");
      if (!newRate || Number(newRate) <= 0) throw new Error("Enter valid rate");

      setAdminTxStatus("pending");
      await donationTreasury.writeContract.setPolToRusdRate.staticCall(Number(newRate));

      const txOverrides = await getLegacyOverrides(donationTreasury.writeContract, 250000);
      const tx = await donationTreasury.writeContract.setPolToRusdRate(Number(newRate), txOverrides);

      setAdminTxHash(tx.hash);
      await tx.wait();
      setAdminTxStatus("success");
      await loadStats();
    } catch (err) {
      console.error("❌ Rate update failed:", err);
      const msg = err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || "Rate update failed";
      setAdminTxStatus("error");
      setAdminTxError(msg);
    }
  };

  const handleWithdrawPOL = async () => {
    try {
      resetAdminTx();
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / not admin");
      if (!withdrawTo || !validators.isAddress(withdrawTo))
        throw new Error("Invalid recipient address");
      if (!withdrawAmount || Number(withdrawAmount) <= 0)
        throw new Error("Enter valid POL amount");

      const amountWei = ethers.parseEther(withdrawAmount.toString());
      setAdminTxStatus("pending");

      await donationTreasury.writeContract.withdrawPOL.staticCall(withdrawTo, amountWei);

      const txOverrides = await getLegacyOverrides(donationTreasury.writeContract, 400000);
      const tx = await donationTreasury.writeContract.withdrawPOL(withdrawTo, amountWei, txOverrides);

      setAdminTxHash(tx.hash);
      await tx.wait();

      setAdminTxStatus("success");
      setWithdrawTo("");
      setWithdrawAmount("");
      await loadStats();
    } catch (err) {
      console.error("❌ Withdraw failed:", err);
      const msg = err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || "Withdraw failed";
      setAdminTxStatus("error");
      setAdminTxError(msg);
    }
  };

  const handleMintRUSD = async () => {
    try {
      resetAdminTx();
      if (!reliefUSD?.writeContract) throw new Error("ReliefUSD not connected");
      if (!validators.isAddress(mintTo)) throw new Error("Invalid address");
      if (!mintAmount || Number(mintAmount) <= 0) throw new Error("Enter valid amount");

      const amountWei = ethers.parseEther(mintAmount.toString());
      setAdminTxStatus("pending");

      await reliefUSD.writeContract.mint.staticCall(mintTo, amountWei);
      const tx = await reliefUSD.writeContract.mint(mintTo, amountWei);

      setAdminTxHash(tx.hash);
      await tx.wait();

      setAdminTxStatus("success");
      setMintTo("");
      setMintAmount("");
      await loadStats();
    } catch (err) {
      console.error(err);
      setAdminTxStatus("error");
      setAdminTxError(err?.shortMessage || err?.message || "Mint failed");
    }
  };

  // -----------------------------
  // REQUEST HANDLERS
  // -----------------------------
  const handleFulfill = async (req) => {
    try {
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / not admin");

      const file = fulfillProofFiles?.[req.id];
      if (!file) throw new Error("Upload proof screenshot/receipt before fulfilling");

      setActionLoading(true);

      const fulfillmentCID = await uploadProofAndGetCID({
        file,
        requestId: req.id,
        merchantWallet: req.merchant,
      });

      await donationTreasury.writeContract.fulfillOffchainRedemption.staticCall(
        req.id,
        fulfillmentCID
      );

      const overrides = await getLegacyGasOverrides(donationTreasury.writeContract, 500000);
      const tx = await donationTreasury.writeContract.fulfillOffchainRedemption(
        req.id,
        fulfillmentCID,
        overrides
      );

      console.log("✅ Fulfill TX:", tx.hash);
      await tx.wait();

      setFulfillProofFiles((prev) => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });

      await loadRequests();
      await loadStats();
    } catch (err) {
      console.error("❌ fulfill failed:", err);
      alert(err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || "Failed to fulfill request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (req) => {
    try {
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / not admin");

      const file = rejectProofFiles?.[req.id];
      if (!file) throw new Error("Upload rejection proof before rejecting");

      setActionLoading(true);

      const rejectCID = await uploadProofAndGetCID({
        file,
        requestId: req.id,
        merchantWallet: req.merchant,
      });

      await donationTreasury.writeContract.rejectOffchainRedemption.staticCall(req.id, rejectCID);

      const overrides = await getLegacyGasOverrides(donationTreasury.writeContract, 500000);
      const tx = await donationTreasury.writeContract.rejectOffchainRedemption(req.id, rejectCID, overrides);

      console.log("✅ Reject TX:", tx.hash);
      await tx.wait();

      setRejectProofFiles((prev) => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });

      await loadRequests();
      await loadStats();
    } catch (err) {
      console.error("❌ reject failed:", err);
      alert(err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || "Failed to reject request");
    } finally {
      setActionLoading(false);
    }
  };

const uploadProofAndGetCID = async ({ file, requestId, merchantWallet }) => {
  if (!file) throw new Error("Please select a proof file first");

  if (!ipfsService?.uploadRedemptionProof)
    throw new Error("IPFS service not available");

  const res = await ipfsService.uploadRedemptionProof(
    file,
    requestId,
    merchantWallet
  );

  if (!res?.success || !res?.proofCID) {
    throw new Error(res?.error || "Failed to upload proof to IPFS");
  }

  return res.proofCID;
};


  const getLegacyGasOverrides = async (contract, gasLimit = 500000) => {
    const provider = contract?.runner?.provider;
    if (!provider) throw new Error("Provider not available");

    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    return { gasLimit, gasPrice };
  };

  // -----------------------------
  // EFFECTS
  // -----------------------------
  useEffect(() => {
    if (!account) return;
    if (!chainKey) return;
    if (!reliefManager?.readContract || !reliefUSD?.readContract) return;

    loadStats();
    loadRequests();
  }, [account, chainKey, reliefManager?.readContract, reliefUSD?.readContract]);


  // RENDER
  if (loading) return <DashboardSkeleton />;

  if (!account) {
    return (
      <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center px-4">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 sm:p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>
          <p className="text-xl font-semibold mb-2">Wallet Not Connected</p>
          <p className="text-sm text-gray-400">Connect your wallet to access the admin dashboard.</p>
        </div>
      </div>
    );
  }

  if (!chainKey) {
    return (
      <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center px-4">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 sm:p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <p className="text-xl font-semibold mb-2">ChainId Not Detected</p>
          <p className="text-sm text-gray-400">Please reconnect your wallet.</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center px-4">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 sm:p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
            <span className="text-3xl">❌</span>
          </div>
          <p className="text-xl font-semibold mb-2">Stats Not Loaded</p>
          <p className="text-sm text-gray-400 mb-6">Check console for errors.</p>
          <button
            onClick={() => {
              loadStats();
              loadRequests();
            }}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-xl hover:shadow-cyan-500/50 transition-all duration-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
      {/* Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
              System Control
            </p>
            <h1 className="text-4xl sm:text-4xl md:text-5xl font-bold">Admin Dashboard</h1>
          </div>

          <button
            onClick={() => {
              loadStats();
              loadRequests();
              loadOnchainRedemptions();
            }}
            disabled={loadingRequests || actionLoading || loadingOnchain}
            className="px-6 py-3 rounded-xl border border-gray-700 hover:border-cyan-500/50 bg-gray-900/50 backdrop-blur-sm transition-all duration-300 font-mono disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800/50"
          >
             Refresh All
          </button>
        </div>

        {/* Stats Grid */}
        <div className="mb-10 sm:mb-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
              Protocol Metrics
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <StatCard
              title="Active Beneficiaries"
              value={stats.activeBeneficiaries ?? 0}
              icon="👥"
              color="cyan"
            />
            <StatCard
              title="Revoked Beneficiaries"
              value={stats.revokedBeneficiaries ?? 0}
              icon="⛔"
              color="orange"
            />
            <StatCard
              title="Registered Beneficiaries"
              value={stats.registeredBeneficiaries ?? 0}
              icon="📝"
              color="purple"
            />
            <StatCard
              title="Active Merchants"
              value={stats.activeMerchants ?? 0}
              icon="🏪"
              color="emerald"
            />
            <StatCard
              title="Revoked Merchants"
              value={stats.revokedMerchants ?? 0}
              icon="⛔"
              color="orange"
            />
            <StatCard
              title="Registered Merchants"
              value={stats.registeredMerchants ?? 0}
              icon="📌"
              color="purple"
            />
            <StatCard
              title="RUSD Total Supply"
              value={`${parseFloat(stats.totalSupply ?? 0).toFixed(2)}`}
              unit="RUSD"
              icon="🪙"
              color="purple"
            />
            <StatCard
              title="Total Distributed"
              value={`${parseFloat(stats.totalDistributed ?? 0).toFixed(2)}`}
              unit="RUSD"
              icon="💰"
              color="purple"
            />
            <StatCard
              title="Total Spent"
              value={`${parseFloat(stats.totalSpent ?? 0).toFixed(2)}`}
              unit="RUSD"
              icon="🧾"
              color="emerald"
            />
            <StatCard
              title="Treasury Balance"
              value={`${parseFloat(stats.treasuryBalancePOL ?? 0).toFixed(4)}`}
              unit="POL"
              icon="🏦"
              color="cyan"
            />
            <StatCard
              title="Total Donated"
              value={`${parseFloat(stats.totalDonatedPOL ?? 0).toFixed(4)}`}
              unit="POL"
              icon="🎁"
              color="emerald"
            />
            <StatCard
              title="Total Redeemed"
              value={`${parseFloat(stats.totalRedeemedPOL ?? 0).toFixed(4)}`}
              unit="POL"
              icon="🔁"
              color="orange"
            />
            <StatCard
              title="Redeemed (RUSD)"
              value={`${parseFloat(stats.totalRedeemedRUSD ?? 0).toFixed(2)}`}
              unit="RUSD"
              icon="🔥"
              color="purple"
            />
            <StatCard
              title="POL → RUSD Rate"
              value={`${stats.polToRusdRate ?? 0}`}
              icon="⚖️"
              color="cyan"
            />
            <StatCard
              title="Offchain Requests"
              value={stats.totalRequests ?? 0}
              icon="📥"
              color="orange"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-10 sm:mb-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-mono">
              Quick Actions
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <QuickAction
              title="Register Beneficiary"
              description="Add new beneficiary"
              link="/admin/beneficiaries"
              icon="➕"
              onClick={() => navigate("/admin/beneficiaries")}
            />
            <QuickAction
              title="Register Merchant"
              description="Add new merchant"
              link="/admin/merchants"
              icon="🏪"
              onClick={() => navigate("/admin/merchants")}
            />
            <QuickAction
              title="Distribute Funds"
              description="Distribute relief to beneficiaries"
              link="/admin/distribute"
              icon="💸"
              onClick={() => navigate("/admin/distribute")}
            />
            <QuickAction
              title="Public Audit Trail"
              description="View system transactions"
              link="/audit"
              icon="🔍"
              onClick={() => navigate("/audit")}
            />
          </div>
        </div>

        {/* Admin Controls */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10 sm:mb-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
              System Controls
            </p>
            <h2 className="text-xl sm:text-2xl font-semibold">Admin Operations</h2>
          </div>

          <div className="mb-6">
            <TransactionStatus
              status={adminTxStatus}
              hash={adminTxHash}
              error={adminTxError}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Update Rate */}
            <div className="bg-[#0F1623] border border-gray-700/50 rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">
                  ⚖️
                </div>
                <h3 className="text-base sm:text-lg font-semibold">Update POL → RUSD Rate</h3>
              </div>

              <label className="block text-xs sm:text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                New Rate
              </label>
              <input
                type="number"
                min="1"
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:border-cyan-500 transition-colors mb-4"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="e.g. 1000"
              />
              <button
                onClick={handleUpdateRate}
                className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-xl hover:shadow-cyan-500/50 transition-all duration-300 font-mono"
              >
                Update Rate
              </button>
            </div>

            {/* Withdraw POL */}
            <div className="bg-[#0F1623] border border-gray-700/50 rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">
                  🏦
                </div>
                <h3 className="text-base sm:text-lg font-semibold">Withdraw POL from Treasury</h3>
              </div>

              <label className="block text-xs sm:text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Recipient Address
              </label>
              <input
                type="text"
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:border-cyan-500 transition-colors mb-3"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                placeholder="0x..."
              />

              <label className="block text-xs sm:text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Amount (POL)
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:border-cyan-500 transition-colors mb-4"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="e.g. 0.25"
              />
              <button
                onClick={handleWithdrawPOL}
                className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-xl hover:shadow-cyan-500/50 transition-all duration-300 font-mono"
              >
                Withdraw POL
              </button>
            </div>
          </div>
        </div>

        {/* Offchain Requests Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10 sm:mb-16">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
                Offchain Operations
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold">
                Merchant Redemption Requests
              </h2>
            </div>
            <button
              className="px-4 py-2 rounded-lg border border-gray-700 hover:border-cyan-500/50 text-sm font-semibold transition-all duration-300 hover:bg-cyan-500/5 font-mono disabled:opacity-50"
              onClick={loadRequests}
              disabled={loadingRequests || actionLoading}
            >
              Refresh
            </button>
          </div>

          {loadingRequests ? (
            <div className="py-12 flex justify-center">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 font-mono">Loading requests...</span>
              </div>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
                <span className="text-2xl text-gray-600">∅</span>
              </div>
              <p className="text-gray-400 font-mono">No offchain redemption requests found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        ID
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Merchant
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Amount
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        INR
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        UPI ID
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Note
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Date
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-800/50">
                    {requests.map((r) => {
                      const st = statusLabel(r.status);
                      const details = cidDetailsMap?.[r.id];

                      return (
                        <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold font-mono whitespace-nowrap">
                            #{r.id}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-mono text-cyan-400 whitespace-nowrap">
                            {formatters.formatAddress(r.merchant)}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold whitespace-nowrap">
                            {parseFloat(r.rusdAmount).toFixed(2)} <span className="text-gray-500">RUSD</span>
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold whitespace-nowrap">
                            {details?.inrAmount ? `₹${details.inrAmount}` : "-"}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-mono whitespace-nowrap">
                            {details?.upiId || "-"}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-gray-400 max-w-xs truncate">
                            {details?.note || "-"}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm whitespace-nowrap">
                            <span
                              className={`px-3 py-1 rounded-lg text-xs font-mono ${
                                st.color === "cyan"
                                  ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                                  : st.color === "emerald"
                                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                  : "bg-red-500/10 border border-red-500/20 text-red-400"
                              }`}
                            >
                              {st.text}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-gray-400 font-mono whitespace-nowrap">
                            {formatters.formatDate(r.timestamp)}
                          </td>
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
  <div className="flex flex-col gap-3 min-w-[220px]">

    {/* View CID */}
    <button
      onClick={() =>
        alert(
          `requestCID:\n${r.requestCID}\n\nfulfillmentCID:\n${
            r.fulfillmentCID || "(none)"
          }`
        )
      }
      className="text-cyan-400 hover:text-cyan-300 text-left font-mono text-xs"
      type="button"
    >
      View CID
    </button>

    {/* Pending Actions */}
    {r.status === 0 && (
      <div className="flex flex-row gap-4 items-start">

        {/* Fulfill */}
        <div className="border border-emerald-500/20 rounded-lg p-3 bg-emerald-500/5 w-[220px]">
          <p className="text-xs text-emerald-400 font-semibold mb-2 font-mono">
            ✅ Fulfill Proof
          </p>

          <input
            type="file"
            accept="image/*,.pdf"
            className="w-full bg-gray-950/50 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-colors"
            onChange={(e) =>
              setFulfillProofFiles((prev) => ({
                ...prev,
                [r.id]: e.target.files?.[0] || null,
              }))
            }
          />

          {fulfillProofFiles?.[r.id] && (
            <p className="text-xs text-emerald-400 mt-1 font-mono truncate">
              {fulfillProofFiles[r.id]?.name}
            </p>
          )}

          <button
            onClick={() => handleFulfill(r)}
            disabled={actionLoading || !fulfillProofFiles?.[r.id]}
            className={`w-full mt-2 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg font-semibold text-xs hover:shadow-lg hover:shadow-emerald-500/50 transition-all duration-300 font-mono ${
              actionLoading || !fulfillProofFiles?.[r.id]
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            type="button"
          >
            Upload & Fulfill
          </button>
        </div>

        {/* Reject */}
        <div className="border border-red-500/20 rounded-lg p-3 bg-red-500/5 w-[220px]">
          <p className="text-xs text-red-400 font-semibold mb-2 font-mono">
            ❌ Reject Proof
          </p>

          <input
            type="file"
            accept="image/*,.pdf"
            className="w-full bg-gray-950/50 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-red-500 transition-colors"
            onChange={(e) =>
              setRejectProofFiles((prev) => ({
                ...prev,
                [r.id]: e.target.files?.[0] || null,
              }))
            }
          />

          {rejectProofFiles?.[r.id] && (
            <p className="text-xs text-red-400 mt-1 font-mono truncate">
              {rejectProofFiles[r.id]?.name}
            </p>
          )}

          <button
            onClick={() => handleReject(r)}
            disabled={actionLoading || !rejectProofFiles?.[r.id]}
            className={`w-full mt-2 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg font-semibold text-xs text-red-400 hover:bg-red-500/30 transition-all duration-300 font-mono ${
              actionLoading || !rejectProofFiles?.[r.id]
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            type="button"
          >
            Upload & Reject
          </button>
        </div>

      </div>
    )}
  </div>
</td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* On-Chain Redemptions Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-400 mb-2 font-mono">
                On-Chain Operations
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold">
                Merchant On-Chain Redemptions
              </h2>
            </div>
            <button
              className="px-4 py-2 rounded-lg border border-gray-700 hover:border-cyan-500/50 text-sm font-semibold transition-all duration-300 hover:bg-cyan-500/5 font-mono disabled:opacity-50"
              onClick={loadOnchainRedemptions}
              disabled={loadingOnchain}
            >
              Refresh
            </button>
          </div>

          {loadingOnchain ? (
            <div className="py-12 flex justify-center">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 font-mono">Loading on-chain redemptions...</span>
              </div>
            </div>
          ) : onchainRedemptions.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
                <span className="text-2xl text-gray-600">∅</span>
              </div>
              <p className="text-gray-400 font-mono">No on-chain redemptions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Merchant
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        RUSD Amount
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        POL Received
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Date
                      </th>
                      <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        TX Hash
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {onchainRedemptions.map((redemption, idx) => (
                      <tr key={idx} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-mono text-cyan-400 whitespace-nowrap">
                          {formatters.formatAddress(redemption.merchant)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold whitespace-nowrap">
                          {parseFloat(redemption.rusdAmount).toFixed(2)} <span className="text-gray-500">RUSD</span>
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-emerald-400 whitespace-nowrap">
                          {parseFloat(redemption.polAmount).toFixed(4)} <span className="text-gray-500">POL</span>
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-gray-400 font-mono whitespace-nowrap">
                          {formatters.formatDate(redemption.timestamp)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
                          <a
                            href={`https://amoy.polygonscan.com/tx/${redemption.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 font-mono text-xs"
                          >
                            {redemption.txHash.slice(0, 10)}...{redemption.txHash.slice(-8)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== STATCARD ====================
const StatCard = ({ title, value, icon, color, unit }) => {
  const colors = {
    cyan: "border-cyan-500/20 hover:border-cyan-500/60 shadow-cyan-500/10",
    emerald: "border-emerald-500/20 hover:border-emerald-500/60 shadow-emerald-500/10",
    purple: "border-purple-500/20 hover:border-purple-500/60 shadow-purple-500/10",
    orange: "border-orange-500/20 hover:border-orange-500/60 shadow-orange-500/10",
  };

  const iconColors = {
    cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  };

  const valueColors = {
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
  };

  return (
    <div
      className={`bg-gray-900/50 backdrop-blur-sm border rounded-xl p-4 sm:p-6 hover:shadow-lg transition-all duration-300 ${colors[color]}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm text-gray-400 mb-2 font-mono">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-2xl sm:text-3xl font-bold ${valueColors[color]}`}>
              {value}
            </p>
            {unit && <span className="text-sm text-gray-500 font-mono">{unit}</span>}
          </div>
        </div>
        <div
          className={`w-12 h-12 rounded-lg border flex items-center justify-center text-2xl ${iconColors[color]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

// ==================== QUICK ACTION ====================
const QuickAction = ({ title, description, icon, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="bg-[#0F1623] border border-gray-700/50 rounded-xl p-5 sm:p-6 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer hover:bg-gray-800/30"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-semibold mb-1">{title}</h3>
          <p className="text-sm text-gray-400 font-mono">{description}</p>
        </div>
      </div>
    </div>
  );
};



// ============================================================
// PAGE SKELETON
// ============================================================

const BeneficiarySkeleton = () => (
  <div className="min-h-screen bg-[#0B0F14] text-white">
    <style>{skeletonCSS}</style>

    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <div className="sk h-3 w-32 mb-2" />
        <div className="sk h-8 w-72" />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="sk h-8 w-32" />
        ))}
      </div>

      {/* Single Big Table Skeleton */}
      <div className="sk h-[420px] w-full rounded-2xl" />

    </div>
  </div>
);





// ============================================================
// MAIN COMPONENT
// ============================================================

export const BeneficiaryManagement = () => {

  const { chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

  // ================= LOAD =================

  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager not ready");

      const list = await reliefManager.getAllBeneficiaries();
      const unique = [...new Set(list)];

      const data = await Promise.all(
        unique.map(async (addr) => {
          const d = await reliefManager.getBeneficiaryDetails(addr);
          return { address: addr, ...d };
        })
      );

      setBeneficiaries(data);
    } catch (err) {
      console.error(err);
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadBeneficiaries();
  }, [reliefManager?.readContract]);

  // ================= ACTIONS =================

  const handleRevoke = async (ben) => {
    try {
      if (!askConfirm(`Revoke beneficiary?\n${ben.address}`)) return;

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected");

      setActionLoading(true);

      const overrides = await getLegacyOverrides(
        reliefManager.writeContract
      );

      await reliefManager.writeContract.removeBeneficiary.staticCall(
        ben.address
      );

      const tx =
        await reliefManager.writeContract.removeBeneficiary(
          ben.address,
          overrides
        );

      await tx.wait();
      await loadBeneficiaries();

    } catch (err) {
      alert(err?.message || "Revoke failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReWhitelist = async (ben) => {
    try {
      if (!askConfirm(`Re-enable beneficiary?\n${ben.address}`)) return;

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected");

      setActionLoading(true);

      const overrides = await getLegacyOverrides(
        reliefManager.writeContract
      );

      await reliefManager.writeContract.reWhitelistBeneficiary.staticCall(
        ben.address
      );

      const tx =
        await reliefManager.writeContract.reWhitelistBeneficiary(
          ben.address,
          overrides
        );

      await tx.wait();
      await loadBeneficiaries();

    } catch (err) {
      alert(err?.message || "Whitelist failed");
    } finally {
      setActionLoading(false);
    }
  };

  // ================= RENDER =================

  if (loading) return <BeneficiarySkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">

      {/* GRID */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
          linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
        `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 py-10">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-10">

          <div>
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono mb-2">
              Access Control
            </p>
            <h1 className="text-4xl font-bold">
              Beneficiary Management
            </h1>
          </div>

          <button
            onClick={() => setShowModal(true)}
            disabled={actionLoading}
            className="px-4 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 font-mono text-sm font-semibold hover:shadow-lg hover:shadow-cyan-500/40 disabled:opacity-50"

          >
            + Add Beneficiary
          </button>

        </div>

        {/* TABLE */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-3">

          {beneficiaries.length === 0 ? (
            <div className="py-20 text-center text-gray-400 font-mono">
              No beneficiaries registered.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="min-w-full">

                <thead>
                  <tr className="border-b border-gray-800">
                    {[
                      "Address",
                      "Status",
                      "Received",
                      "Spent",
                      "Balance",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left lg:text-sm text-xs font-mono text-gray-500 uppercase"

                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-800/50 lg:text-sm text-xs">

                  {beneficiaries.map((ben) => (
                    <tr
                      key={ben.address}
                      className="hover:bg-gray-800/30"
                    >

                      <td className="px-3 py-2 font-mono text-cyan-400">
                        {formatters.formatAddress(ben.address)}
                      </td>

                      <td className="px-4 py-4">
                        {ben.isWhitelisted ? (
                          <span className="px-3 py-1 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-mono">
                            REVOKED
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {Number(ben.totalReceived).toFixed(2)} RUSD
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {Number(ben.totalSpent).toFixed(2)} RUSD
                      </td>

                      <td className="px-4 py-4 font-semibold text-emerald-400">
                        {Number(ben.currentBalance).toFixed(2)} RUSD
                      </td>

                      <td className="px-4 py-4 flex gap-4 font-mono text-sm">

                        <button
                          onClick={() => setSelectedBeneficiary(ben)}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          View
                        </button>

                        {ben.isWhitelisted ? (
                          <button
                            onClick={() => handleRevoke(ben)}
                            disabled={actionLoading}
                            className="text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReWhitelist(ben)}
                            disabled={actionLoading}
                            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          >
                            Re-Whitelist
                          </button>
                        )}

                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

        </div>

        {/* MODALS */}
        {showModal && (
          <Modal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            title="Register Beneficiary"
          >
            <RegisterBeneficiaryForm
              onSuccess={() => {
                setShowModal(false);
                loadBeneficiaries();
              }}
            />
          </Modal>
        )}

        {selectedBeneficiary && (
          <Modal
            isOpen={!!selectedBeneficiary}
            onClose={() => setSelectedBeneficiary(null)}
            title="Beneficiary Details"
          >
            <BeneficiaryDetails beneficiary={selectedBeneficiary} />
          </Modal>
        )}

      </div>
      <SetSpendingLimits/>
    </div>
  );
};

// ============================================================
// DETAILS MODAL
// ============================================================

const BeneficiaryDetails = ({ beneficiary }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

    {[
      ["Address", formatters.formatAddress(beneficiary.address)],
      ["Total Received", `${Number(beneficiary.totalReceived).toFixed(2)} RUSD`],
      ["Total Spent", `${Number(beneficiary.totalSpent).toFixed(2)} RUSD`],
      ["Current Balance", `${Number(beneficiary.currentBalance).toFixed(2)} RUSD`],
    ].map(([label, val]) => (
      <div key={label}>
        <p className="text-xs text-gray-400 font-mono mb-1">
          {label}
        </p>
        <p className="font-semibold">{val}</p>
      </div>
    ))}

  </div>
);

// ============================================================
// REGISTER FORM
// ============================================================

const RegisterBeneficiaryForm = ({ onSuccess }) => {

  const { chainId, provider } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    walletAddress: "",
    additionalInfo: "",
  });

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!validators.isAddress(formData.walletAddress))
        throw new Error("Invalid wallet address");

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected");

      if (!provider)
        throw new Error("Provider not ready");

      setTxStatus("pending");

      const res = await fetch(
        "http://localhost:5000/api/beneficiary/upload-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const ipfs = await res.json();
      if (!ipfs.success) throw new Error(ipfs.error);

      const overrides = await getLegacyOverrides(
        reliefManager.writeContract,
        600000
      );

      await reliefManager.writeContract.registerBeneficiary.staticCall(
        formData.walletAddress,
        ipfs.cid
      );

      const tx =
        await reliefManager.writeContract.registerBeneficiary(
          formData.walletAddress,
          ipfs.cid,
          overrides
        );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setTimeout(() => onSuccess(), 1200);

    } catch (err) {
      console.error(err);
      setError(err?.message || "Registration failed");
      setTxStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {["name","phone","address","walletAddress","additionalInfo"].map((k) => (
        <input
          key={k}
          required={k !== "additionalInfo"}
          placeholder={k}
          value={formData[k]}
          onChange={(e) =>
            setFormData({ ...formData, [k]: e.target.value })
          }
          className="w-full bg-gray-950/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
        />
      ))}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <TransactionStatus status={txStatus} hash={txHash} error={error} />

      <button
        disabled={txStatus === "pending"}
        className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 font-mono font-semibold hover:shadow-xl hover:shadow-cyan-500/40 disabled:opacity-50"
      >
        {txStatus === "pending"
          ? "Registering..."
          : "Register Beneficiary"}
      </button>

    </form>
  );
};

const skeletonCSS = `
.sk {
  position: relative;
  overflow: hidden;
  background: rgba(255,255,255,0.07);
  border-radius: 12px;
}
.sk::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255,255,255,0.08),
    transparent
  );
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  100% { transform: translateX(100%); }
}
`;

const MerchantSkeleton = () => (
  <div className="min-h-screen bg-[#0B0F14] text-white">
    <style>{skeletonCSS}</style>

    <div className="max-w-7xl mx-auto px-6 py-10">

      <div className="mb-8">
        <div className="sk h-3 w-32 mb-2" />
        <div className="sk h-8 w-64" />
      </div>

      <div className="flex gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sk h-8 w-20" />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sk h-48" />
        ))}
      </div>

    </div>
  </div>
);

/* ============================================================
   MERCHANT MANAGEMENT
============================================================ */

export const MerchantManagement = () => {

  const { chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState("ALL");

  /* ================= LOAD ================= */

  const loadMerchants = async () => {
    try {
      setLoading(true);

      const list = await reliefManager.getAllMerchants();
      const unique = [...new Set(list)];

      const data = await Promise.all(
        unique.map(async (addr) => {
          const d = await reliefManager.getMerchantDetails(addr);
          return { address: addr, ...d };
        })
      );

      setMerchants(data);
    } catch {
      setMerchants([]);
    } finally {
      setLoading(false);
    }
  };



  
  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadMerchants();
  }, [reliefManager?.readContract]);


const handleRevoke = async (merchant) => {
  try {
    if (!askConfirm(`Revoke merchant access?\n\n${merchant.address}`)) return;

    if (!reliefManager?.writeContract)
      throw new Error("Wallet not connected or contract not ready");

    setActionLoading(true);

    // ✅ provider from ethers runner
    const provider = reliefManager.writeContract.runner?.provider;
    if (!provider) throw new Error("Provider not available");

    // ✅ Legacy gasPrice for Amoy RPC compatibility
    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    console.log("🛑 Revoking merchant:", merchant.address);
    console.log("⛽ gasPrice:", gasPrice.toString());

    // ✅ Optional simulation
    console.log("🧪 Simulating removeMerchant...");
    await reliefManager.writeContract.removeMerchant.staticCall(merchant.address);
    console.log("✅ Simulation passed");

    // ✅ send tx (IMPORTANT FIX)
    const tx = await reliefManager.writeContract.removeMerchant(
      merchant.address,
      {
        gasLimit: 400000,
        gasPrice,
      }
    );

    console.log("⛓️ TX Hash:", tx.hash);
    await tx.wait();

    await loadMerchants();
  } catch (err) {
    console.error("❌ revokeMerchant failed:", err);
    alert(
      err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Failed to revoke merchant"
    );
  } finally {
    setActionLoading(false);
  }
};


const handleReWhitelist = async (merchant) => {
  try {
    if (!askConfirm(`Re-Whitelist merchant?\n\n${merchant.address}`)) return;

    if (!reliefManager?.writeContract)
      throw new Error("Wallet not connected or contract not ready");

    setActionLoading(true);

    // ✅ provider from ethers runner
    const provider = reliefManager.writeContract.runner?.provider;
    if (!provider) throw new Error("Provider not available");

    // ✅ Legacy gasPrice for Amoy RPC compatibility
    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    console.log("✅ Re-whitelisting merchant:", merchant.address);
    console.log("⛽ gasPrice:", gasPrice.toString());

    // ✅ Optional simulation
    console.log("🧪 Simulating reWhitelistMerchant...");
    await reliefManager.writeContract.reWhitelistMerchant.staticCall(
      merchant.address
    );
    console.log("✅ Simulation passed");

    // ✅ send tx (IMPORTANT FIX)
    const tx = await reliefManager.writeContract.reWhitelistMerchant(
      merchant.address,
      {
        gasLimit: 400000,
        gasPrice,
      }
    );

    console.log("⛓️ TX Hash:", tx.hash);
    await tx.wait();

    await loadMerchants();
  } catch (err) {
    console.error("❌ reWhitelistMerchant failed:", err);
    alert(
      err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Failed to re-whitelist merchant"
    );
  } finally {
    setActionLoading(false);
  }
};


  const filtered =
    filterCategory === "ALL"
      ? merchants
      : merchants.filter((m) => m.category === filterCategory);

  if (loading) return <MerchantSkeleton />;




  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative">

      {/* GRID */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-10">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase font-mono text-cyan-400 mb-1">
              Access Control
            </p>
            <h1 className="text-4xl font-bold">
              Merchant Management
            </h1>
          </div>

          <button
            onClick={() => setShowModal(true)}
            disabled={actionLoading}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-sm font-mono font-semibold hover:shadow-lg hover:shadow-cyan-500/40 disabled:opacity-50"
          >
            + Add Merchant
          </button>
        </div>

        {/* FILTERS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {["ALL", "FOOD", "MEDICAL", "SHELTER"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border
                ${
                  filterCategory === cat
                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                    : "border-gray-700 text-gray-400 hover:border-cyan-500/40"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* CARDS */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400 font-mono">
            No merchants found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

            {filtered.map((m) => (
              <div
                key={m.address}
                className="bg-gray-900/50 border border-gray-800 rounded-xl p-5"
              >

                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold">
                    {m.name || "Unnamed Merchant"}
                  </h3>

                  <span
                    className={`px-2 py-[2px] text-xs rounded-md font-mono
                      ${
                        m.isRegistered
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                  >
                    {m.isRegistered ? "ACTIVE" : "REVOKED"}
                  </span>
                </div>

                <p className="text-xs font-mono text-cyan-400 mb-2">
                  {formatters.formatAddress(m.address)}
                </p>

                <div className="text-sm text-gray-300 space-y-1">
                  <p>Category: {m.category}</p>
                  <p>Total Received: {Number(m.totalReceived).toFixed(2)} RUSD</p>
                  <p>Balance: {Number(m.currentBalance).toFixed(2)} RUSD</p>
                </div>

                <div className="mt-4">
                  {m.isRegistered ? (
                    <button
                      onClick={() => handleRevoke(m)}
                      disabled={actionLoading}
                      className="w-full px-3 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-sm font-mono"
                    >
                      Revoke
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReWhitelist(m)}
                      disabled={actionLoading}
                      className="w-full px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-sm font-mono"
                    >
                      Re-Whitelist
                    </button>
                  )}
                </div>

              </div>
            ))}

          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <Modal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            title="Register Merchant"
          >
            <RegisterMerchantForm
              onSuccess={() => {
                setShowModal(false);
                loadMerchants();
              }}
            />
          </Modal>
        )}

      </div>
    </div>
  );
};

/* ============================================================
   REGISTER MERCHANT FORM
============================================================ */

const RegisterMerchantForm = ({ onSuccess }) => {

  const { chainId, provider } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    walletAddress: "",
    category: "FOOD",
  });

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!validators.isAddress(formData.walletAddress))
        throw new Error("Invalid wallet address");

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected");

      if (!provider) throw new Error("Provider not ready");

      setTxStatus("pending");
      setTxHash("");

      const res = await fetch(
        "http://localhost:5000/api/merchant/upload-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const ipfsData = await res.json();
      if (!ipfsData.success) throw new Error(ipfsData.error);

      const gasPriceHex = await provider.send("eth_gasPrice", []);
      const gasPrice = BigInt(gasPriceHex);

      await reliefManager.writeContract.registerMerchant.staticCall(
        formData.walletAddress,
        ipfsData.categoryEnum,
        formData.name,
        ipfsData.cid
      );

      const tx = await reliefManager.writeContract.registerMerchant(
        formData.walletAddress,
        ipfsData.categoryEnum,
        formData.name,
        ipfsData.cid,
        { gasLimit: 700000, gasPrice }
      );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setTimeout(() => onSuccess(), 1200);

    } catch (err) {
      setError(err?.message || "Registration failed");
      setTxStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {["name", "phone", "address", "walletAddress"].map((k) => (
        <input
          key={k}
          className="w-full bg-gray-950/60 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
          placeholder={k}
          value={formData[k]}
          onChange={(e) =>
            setFormData({ ...formData, [k]: e.target.value })
          }
          required
        />
      ))}

      <select
        className="w-full bg-gray-950/60 border border-gray-700 rounded-lg px-4 py-2"
        value={formData.category}
        onChange={(e) =>
          setFormData({ ...formData, category: e.target.value })
        }
      >
        <option value="FOOD">Food</option>
        <option value="MEDICAL">Medical</option>
        <option value="SHELTER">Shelter</option>
      </select>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <TransactionStatus status={txStatus} hash={txHash} error={error} />

      <button
        type="submit"
        disabled={txStatus === "pending"}
        className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 font-mono font-semibold hover:shadow-lg hover:shadow-cyan-500/40 disabled:opacity-50"
      >
        {txStatus === "pending" ? "Registering..." : "Register Merchant"}
      </button>

    </form>
  );
};


// ============================================================
// DISTRIBUTE FUNDS
// ============================================================

const DistributeSkeleton = () => (
  <div className="min-h-screen bg-[#0B0F14] text-white">
    <style>{skeletonCSS}</style>

    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">

      <div>
        <div className="sk h-3 w-32 mb-2" />
        <div className="sk h-8 w-64" />
      </div>

      <div className="sk h-24 w-full" />

      <div className="sk h-56 w-full" />

    </div>
  </div>
);

/* ============================================================
   DISTRIBUTE FUNDS
============================================================ */

export const DistributeFunds = () => {

  const { account, chainId, provider } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefUSD : null
  );

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("");
  const [amount, setAmount] = useState("");

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(true);
  const [contractBalance, setContractBalance] = useState("0");

  /* ================= LOAD ================= */

  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      const list = await reliefManager.readContract.getAllBeneficiaries();

      const data = await Promise.all(
        list.map(async (addr) => {
          const d = await reliefManager.readContract.getBeneficiaryDetails(addr);
          return {
            address: addr,
            ...d,
            currentBalance: d?.currentBalance
              ? ethers.formatEther(d.currentBalance)
              : "0",
          };
        })
      );

      setBeneficiaries(data);

      if (reliefUSD?.readContract) {
        const managerAddr = addresses?.[chainKey]?.ReliefManager;
        if (managerAddr) {
          const bal = await reliefUSD.readContract.balanceOf(managerAddr);
          setContractBalance(ethers.formatEther(bal));
        }
      }

    } catch {
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    if (!reliefUSD?.readContract) return;
    loadBeneficiaries();
  }, [reliefManager?.readContract, reliefUSD?.readContract]);

  const selectedBenObj = beneficiaries.find(
    (b) => b.address === selectedBeneficiary
  );

  /* ================= DISTRIBUTE ================= */

  const handleDistribute = async (e) => {
    e.preventDefault();
    setError("");

    try {

      if (!selectedBeneficiary || !amount || Number(amount) <= 0)
        throw new Error("Select beneficiary and valid amount");

      if (Number(amount) > Number(contractBalance))
        throw new Error(
          `Insufficient contract balance. Available ${Number(
            contractBalance
          ).toFixed(2)} RUSD`
        );

      setTxStatus("pending");
      setTxHash("");

      const amountWei = ethers.parseEther(amount);

      await reliefManager.writeContract.distributeFunds.staticCall(
        selectedBeneficiary,
        amountWei
      );

      const gasPrice = await provider.send("eth_gasPrice", []);

      const tx = await reliefManager.writeContract.distributeFunds(
        selectedBeneficiary,
        amountWei,
        { gasLimit: 300000, gasPrice }
      );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setAmount("");
      setSelectedBeneficiary("");

      await loadBeneficiaries();

    } catch (err) {
      setError(err?.message || "Transaction failed");
      setTxStatus("error");
    }
  };

  if (loading) return <DistributeSkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative">

      {/* GRID */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 py-10">

        {/* HEADER */}
        <div className="mb-8">
          <p className="text-xs uppercase font-mono text-cyan-400 mb-1">
            Treasury
          </p>
          <h1 className="text-4xl font-bold">
            Distribute Relief Funds
          </h1>
        </div>

        {/* CONTRACT BALANCE */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-6">
          <p className="text-xs text-gray-400 font-mono">
            ReliefManager Balance
          </p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {Number(contractBalance).toFixed(2)} RUSD
          </p>
        </div>

        {/* FORM */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">

          <form onSubmit={handleDistribute} className="space-y-6">

            {/* SELECT BENEFICIARY */}
            <div>
              <label className="text-sm text-gray-400 font-mono">
                Beneficiary
              </label>

              <select
                className="w-full mt-1 bg-gray-950/60 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                value={selectedBeneficiary}
                onChange={(e) => setSelectedBeneficiary(e.target.value)}
              >
                <option value="">-- Select Beneficiary --</option>
                {beneficiaries.map((b) => (
                  <option key={b.address} value={b.address}>
                    {formatters.formatAddress(b.address)}
                  </option>
                ))}
              </select>

              {/* CURRENT BALANCE */}
              {selectedBenObj && (
                <p className="mt-1 text-xs text-gray-400">
                  Beneficiary Balance:{" "}
                  <span className="text-emerald-400 font-mono">
                    {Number(selectedBenObj.currentBalance).toFixed(2)} RUSD
                  </span>
                </p>
              )}
            </div>

            {/* AMOUNT */}
            <div>
              <label className="text-sm text-gray-400 font-mono">
                Amount (RUSD)
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full mt-1 bg-gray-950/60 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />

              <p className="mt-1 text-xs text-gray-400">
                Max: {Number(contractBalance).toFixed(2)} RUSD
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <TransactionStatus status={txStatus} hash={txHash} error={error} />

            <button
              type="submit"
              disabled={txStatus === "pending"}
              className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 font-mono font-semibold hover:shadow-lg hover:shadow-cyan-500/40 disabled:opacity-50"
            >
              {txStatus === "pending" ? "Distributing..." : "Distribute Funds"}
            </button>

          </form>

        </div>

      </div>
    </div>
  );
};
// ============================================================
// SET SPENDING LIMITS
// ===========================================================

const SpendingSkeleton = () => (
  <div className="max-w-5xl mx-auto px-4 py-8 text-white">

    <div className="mb-6">
      <SkeletonBlock className="h-3 w-40 mb-2" />
      <SkeletonBlock className="h-8 w-64" />
    </div>

    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-4">

      <SkeletonBlock className="h-10 w-full" />

      {[1,2,3].map(i => (
        <div key={i} className="border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <SkeletonBlock className="h-10 w-full" />
        </div>
      ))}

    </div>

  </div>
);

/* ============================================================
   MAIN COMPONENT
============================================================ */

export const SetSpendingLimits = () => {

  const { chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("");

  const [limits, setLimits] = useState({
    FOOD: "",
    MEDICAL: "",
    SHELTER: "",
  });

  const [currentLimits, setCurrentLimits] = useState({
    FOOD: "0",
    MEDICAL: "0",
    SHELTER: "0",
  });

  const [loading, setLoading] = useState(true);

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState("");

  const categories = ["FOOD", "MEDICAL", "SHELTER"];

  /* ================= LOAD BENEFICIARIES ================= */

  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager not ready");

      const list = await reliefManager.getAllBeneficiaries();

      const data = await Promise.all(
        list.map(async (addr) => {
          const d = await reliefManager.getBeneficiaryDetails(addr);
          return { address: addr, ...d };
        })
      );

      setBeneficiaries(data);
    } catch (err) {
      console.error(err);
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  /* ================= LOAD CURRENT LIMITS ================= */

  const loadCurrentLimits = async (beneficiaryAddr) => {
    try {
      if (!beneficiaryAddr || !reliefManager?.readContract) return;

      const next = {};

      for (const cat of categories) {
        const enumValue =
          cat === "FOOD" ? 0 : cat === "MEDICAL" ? 1 : 2;

        const limitWei =
          await reliefManager.readContract.spendingLimits(
            beneficiaryAddr,
            enumValue
          );

        next[cat] = ethers.formatEther(limitWei);
      }

      setCurrentLimits({
        FOOD: next.FOOD || "0",
        MEDICAL: next.MEDICAL || "0",
        SHELTER: next.SHELTER || "0",
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadBeneficiaries();
  }, [reliefManager?.readContract]);

  useEffect(() => {
    if (!selectedBeneficiary) return;
    loadCurrentLimits(selectedBeneficiary);
  }, [selectedBeneficiary]);

  /* ================= SET LIMIT ================= */

  const handleSetLimit = async (category) => {
    setError("");
    setTxHash(null);

    try {
      if (!selectedBeneficiary)
        throw new Error("Select beneficiary");

      const raw = limits[category];
      if (!raw || Number(raw) < 0)
        throw new Error("Enter valid amount");

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected");

      setTxStatus("pending");

      const limitWei = ethers.parseEther(raw.toString());

      const enumValue =
        category === "FOOD" ? 0 : category === "MEDICAL" ? 1 : 2;

      await reliefManager.writeContract.setSpendingLimit.staticCall(
        selectedBeneficiary,
        enumValue,
        limitWei
      );

      const overrides = await getLegacyOverrides(
        reliefManager.writeContract
      );

      const tx =
        await reliefManager.writeContract.setSpendingLimit(
          selectedBeneficiary,
          enumValue,
          limitWei,
          overrides
        );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      await loadCurrentLimits(selectedBeneficiary);

      setLimits((p) => ({ ...p, [category]: "" }));

      setTimeout(() => setTxStatus(null), 1500);

    } catch (err) {
      setError(
        err?.reason ||
        err?.shortMessage ||
        err?.message ||
        "Transaction failed"
      );
      setTxStatus("error");
    }
  };

  /* ================= RENDER ================= */

  if (loading) return <SpendingSkeleton />;

  return (
    <div className="relative max-w-7xl mx-auto px-4 py-10">


      {/* HEADER */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono mb-3">
          Access Control
        </p>
        <h1 className="text-4xl font-bold">
          Set Spending Limits
        </h1>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl py-4 px-6 space-y-6">

        {/* SELECT BENEFICIARY */}
        <div>
          <label className="block text-sm text-gray-400 mb-1 font-mono">
            Select Beneficiary
          </label>
          <select
            value={selectedBeneficiary}
            onChange={(e) => setSelectedBeneficiary(e.target.value)}
            className="w-full bg-gray-950/60 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- Select --</option>
            {beneficiaries.map((ben) => (
              <option key={ben.address} value={ben.address}>
                {formatters.formatAddress(ben.address)}
              </option>
            ))}
          </select>
        </div>

        {/* CATEGORY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {categories.map((category) => (
            <div
              key={category}
              className="border border-gray-800 rounded-lg p-4 space-y-3"
            >

              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{category}</h3>
                <span className="text-xs text-gray-400">
                  Current:{" "}
                  <b>
                    {Number(currentLimits[category] || "0").toFixed(2)}
                  </b>{" "}
                  RUSD
                </span>
              </div>

              <input
                type="number"
                min="0"
                step="0.01"
                value={limits[category]}
                onChange={(e) =>
                  setLimits({ ...limits, [category]: e.target.value })
                }
                placeholder="New limit"
                disabled={!selectedBeneficiary || txStatus === "pending"}
                className="w-full bg-gray-950/60 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />

              <button
                onClick={() => handleSetLimit(category)}
                disabled={
                  !selectedBeneficiary ||
                  !limits[category] ||
                  txStatus === "pending"
                }
                className="w-full px-3 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 text-sm hover:bg-cyan-600/30 disabled:opacity-50 font-mono"
              >
                Set Limit
              </button>

            </div>
          ))}

        </div>

        {/* ERRORS */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <TransactionStatus status={txStatus} hash={txHash} error={error} />

      </div>

    </div>
  );
};