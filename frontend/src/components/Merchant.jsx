import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  useWeb3,
  useReliefManager,
  useReliefUSD,
  useDonationTreasury,
  useIPFS,
} from "../hooks/Web3Hooks";
import { TransactionStatus } from "./Common";
import { formatters, categoryMapping } from "../utils/Utils";

import ReliefManagerABI from "../contracts/ReliefManager.json";
import ReliefUSDABI from "../contracts/ReliefUSD.json";
import DonationTreasuryABI from "../contracts/DonationTreasury.json";

import addresses from "../contracts/addresses.json";

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

const skeletonCSS = `
@keyframes shimmer {
  100% { transform: translateX(100%); }
}
`;

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
      <div className="mb-8 sm:mb-12">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-64" />
      </div>

      <SkeletonBlock className="h-48 mb-10" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
        {[...Array(4)].map((_, i) => (
          <SkeletonBlock key={i} className="h-32" />
        ))}
      </div>

      <SkeletonBlock className="h-64 mb-10" />
    </div>
  </div>
);

const RedemptionSkeleton = () => (
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
      <div className="mb-8">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-64" />
      </div>

      <SkeletonBlock className="h-24 mb-6" />
      <SkeletonBlock className="h-96 mb-6" />
      <SkeletonBlock className="h-96 mb-6" />
      <SkeletonBlock className="h-64" />
    </div>
  </div>
);

const PaymentsSkeleton = () => (
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
      <div className="mb-8">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-64" />
      </div>

      <SkeletonBlock className="h-20 mb-6" />
      <SkeletonBlock className="h-[600px]" />
    </div>
  </div>
);

// ============================================
// HELPER FUNCTIONS
// ============================================

const getLegacyOverrides = async (contract, gasLimit = 500000) => {
  const provider = contract?.runner?.provider;
  const fallbackGasPrice = ethers.parseUnits("30", "gwei");
  let gasPrice = fallbackGasPrice;

  try {
    if (provider?.getFeeData) {
      const feeData = await provider.getFeeData();
      if (feeData?.gasPrice) gasPrice = feeData.gasPrice;
    }
  } catch (e) {
    console.warn("⚠️ getFeeData failed, using fallback gasPrice", e);
  }

  return { gasLimit, gasPrice };
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

// ============================================
// MERCHANT DASHBOARD
// ============================================
const API_BASE_URL = process.env.PUBLIC_BACKEND_URL || 'http://localhost:5000';


export const MerchantDashboard = () => {
  const { account, chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefUSD : null
  );

  const [details, setDetails] = useState(null);
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [recentTx, setRecentTx] = useState([]);

  useEffect(() => {
    if (!account || !reliefManager?.readContract || !reliefUSD?.readContract) return;
    loadData();
  }, [account, reliefManager?.readContract, reliefUSD?.readContract]);

  const loadData = async () => {
    try {
      setLoading(true);

      const merchantDetails = await reliefManager.getMerchantDetails(account);
      const tokenBalance = await reliefUSD.getBalance(account);

      setDetails(merchantDetails);
      setBalance(tokenBalance);

      if (merchantDetails?.profileCID) {
        loadProfile(merchantDetails.profileCID);
      }

      await loadRecentPayments();

      setLoading(false);
    } catch (error) {
      console.error("Failed to load merchant data:", error);
      setLoading(false);
    }
  };

  const loadProfile = async (cid) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/${cid}`);
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
      }
    } catch (error) {
      console.error("Failed to load merchant profile:", error);
    }
  };

  const loadRecentPayments = async () => {
    try {
      if (!account || !reliefManager?.readContract) return;

      const txIds = await reliefManager.getMerchantTransactions(account);
      const latest = [...txIds].slice(-5).reverse();

      const txList = await Promise.all(
        latest.map(async (id) => {
          const tx = await reliefManager.getTransaction(id);

          return {
            id: Number(id),
            beneficiary: tx[0],
            merchant: tx[1],
            amount: ethers.formatEther(tx[2]),
            category: categoryMapping.toString(Number(tx[3])),
            timestamp: Number(tx[4]),
            note: tx[5],
          };
        })
      );

      setRecentTx(txList);
    } catch (err) {
      console.error("Failed to load merchant recent tx:", err);
      setRecentTx([]);
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (!account) {
    return (
      <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center px-4">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 sm:p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>
          <p className="text-xl font-semibold mb-2">Wallet Not Connected</p>
          <p className="text-sm text-gray-400">Connect your wallet to access your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
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
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Merchant Portal
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Merchant Dashboard</h1>
        </div>

        {profile && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl">
                🏪
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
                  Business Information
                </p>
                <h2 className="text-xl font-semibold">{profile.name}</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Category</p>
                <p className="font-semibold">{details?.category}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Phone</p>
                <p className="font-semibold">{profile.phone}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Business License</p>
                <p className="font-semibold">{profile.businessLicense || "N/A"}</p>
              </div>
              <div className="sm:col-span-3">
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Address</p>
                <p className="font-semibold">{profile.address}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-10">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
              Account Overview
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <StatCard
              title="Current Balance"
              value={`${parseFloat(balance).toFixed(2)}`}
              unit="RUSD"
              icon="💰"
              color="emerald"
            />
            <StatCard
              title="Total Received"
              value={`${parseFloat(details?.totalReceived || 0).toFixed(2)}`}
              unit="RUSD"
              icon="📥"
              color="cyan"
            />
            <StatCard
              title="Available Balance"
              value={`${parseFloat(details?.currentBalance || 0).toFixed(2)}`}
              unit="RUSD"
              icon="✅"
              color="purple"
            />
          </div>
        </div>

        <div className="">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-mono">
              Recent Activity
            </p>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6">
            {recentTx.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">💳</div>
                <p className="text-gray-400 font-mono">No payments received yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTx.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-gray-950/50 border border-gray-800/50 rounded-xl p-4 hover:border-cyan-500/30 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-emerald-400">
                        +{parseFloat(tx.amount).toFixed(2)} RUSD
                      </p>
                      <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {tx.category}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 font-mono mb-1">
                      From: {formatters.formatAddress(tx.beneficiary)}
                    </p>

                    <p className="text-xs text-gray-500 font-mono">
                      {formatters.formatDate(tx.timestamp)}
                    </p>

                    {tx.note && (
                      <p className="text-xs text-gray-600 mt-2 italic">
                        Note: {tx.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <MerchantRedemption/>
    </div>
  );
};

// ============================================
// STAT CARD COMPONENT
// ============================================

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

// ============================================
// MERCHANT REDEMPTION
// ============================================

export const MerchantRedemption = () => {
  const { account, chainId, provider } = useWeb3();
  const chainKey = getChainKey(chainId);

  const donationTreasuryAddress = chainKey ? addresses?.[chainKey]?.DonationTreasury : null;
  const reliefUSDAddress = chainKey ? addresses?.[chainKey]?.ReliefUSD : null;

  const donationTreasury = useDonationTreasury(
    DonationTreasuryABI.abi,
    donationTreasuryAddress
  );

  const reliefUSD = useReliefUSD(ReliefUSDABI.abi, reliefUSDAddress);
  const ipfs = useIPFS();

  const [rusdAmount, setRusdAmount] = useState("");
  const [inrAmount, setInrAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [note, setNote] = useState("");

  const [redeemRusdAmount, setRedeemRusdAmount] = useState("");

  const [merchantBalance, setMerchantBalance] = useState("0");

  const [offchainRequests, setOffchainRequests] = useState([]);
  const [loadingOffchain, setLoadingOffchain] = useState(false);

  const [onchainRedemptions, setOnchainRedemptions] = useState([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);

  const [activeTab, setActiveTab] = useState("offchain");

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

  const [loading, setLoading] = useState(true);

  const loadBalance = async () => {
    try {
      if (!account || !reliefUSD?.readContract) return;

      const bal = await reliefUSD.getBalance(account);
      setMerchantBalance(bal);
    } catch (err) {
      console.error("Failed to load merchant RUSD balance:", err);
      setMerchantBalance("0");
    }
  };

  const loadOffchainRequests = async () => {
    try {
      if (!account || !donationTreasury?.readContract) return;

      setLoadingOffchain(true);

      const total = await donationTreasury.readContract.getTotalRequests();
      const totalNum = Number(total);

      const result = [];

      for (let i = totalNum - 1; i >= 0; i--) {
        const r = await donationTreasury.readContract.redemptionRequests(i);

        const merchant = (r.merchant ?? r[0])?.toLowerCase();
        if (!merchant) continue;

        if (merchant !== account.toLowerCase()) continue;

        result.push({
          id: i,
          merchant: r.merchant ?? r[0],
          rusdAmount: ethers.formatEther(r.rusdAmount ?? r[1]),
          requestCID: r.requestCID ?? r[2],
          fulfillmentCID: r.fulfillmentCID ?? r[3],
          timestamp: Number(r.timestamp ?? r[4]),
          status: Number(r.status ?? r[5]),
        });

        if (result.length >= 20) break;
      }

      setOffchainRequests(result);
    } catch (err) {
      console.error("Failed to load off-chain redemption requests:", err);
      setOffchainRequests([]);
    } finally {
      setLoadingOffchain(false);
    }
  };

  const loadOnchainRedemptions = async () => {
    try {
      if (!account || !provider || !donationTreasuryAddress) return;

      setLoadingOnchain(true);

      const result = await fetchOnchainRedemptions({
        provider,
        donationTreasuryAddress,
        abi: DonationTreasuryABI.abi,
        merchant: account,
        chunkSize: 5000,
      });

      if (result.success) {
        setOnchainRedemptions(result.data);
      } else {
        console.error("Failed to load on-chain redemptions:", result.error);
        setOnchainRedemptions([]);
      }
    } catch (err) {
      console.error("Failed to load on-chain redemptions:", err);
      setOnchainRedemptions([]);
    } finally {
      setLoadingOnchain(false);
    }
  };

  useEffect(() => {
    if (!account) return;
    
    const loadAllData = async () => {
      setLoading(true);
      await loadBalance();
      await loadOffchainRequests();
      await loadOnchainRedemptions();
      setLoading(false);
    };

    loadAllData();
  }, [account, donationTreasury?.readContract, reliefUSD?.readContract, provider]);

  const handleSubmitRedemption = async (e) => {
    e.preventDefault();
    setTxError(null);
    setTxHash(null);

    try {
      if (!account) throw new Error("Connect wallet first");
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / DonationTreasury not ready");

      if (!rusdAmount || parseFloat(rusdAmount) <= 0)
        throw new Error("Enter valid RUSD amount");

      if (!inrAmount || parseFloat(inrAmount) <= 0)
        throw new Error("INR amount is required");

      if (!upiId?.trim()) throw new Error("UPI ID is required");

      const bal = parseFloat(merchantBalance || "0");
      if (parseFloat(rusdAmount) > bal)
        throw new Error(
          `Insufficient RUSD balance. Available: ${bal.toFixed(2)} RUSD`
        );

      setTxStatus("pending");

      const ipfsRes = await ipfs.uploadRedemptionRequest({
        merchantWallet: account,
        rusdAmount: rusdAmount.toString(),
        inrAmount: inrAmount.toString(),
        upiId: upiId.trim(),
        upiLink: "",
        note: note || "",
      });

      if (!ipfsRes?.success || !ipfsRes?.cid)
        throw new Error(ipfsRes?.error || "Failed to upload request to IPFS");

      const cid = ipfsRes.cid;
      const amtWei = ethers.parseEther(rusdAmount.toString());

      await donationTreasury.writeContract.requestOffchainRedemption.staticCall(
        amtWei,
        cid
      );

      const overrides = await getLegacyOverrides(
        donationTreasury.writeContract,
        500000
      );

      const tx = await donationTreasury.writeContract.requestOffchainRedemption(
        amtWei,
        cid,
        overrides
      );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setRusdAmount("");
      setInrAmount("");
      setUpiId("");
      setNote("");

      await loadOffchainRequests();
      await loadBalance();
    } catch (err) {
      console.error("❌ Redemption request failed:", err);

      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Redemption request failed";

      setTxError(msg);
      setTxStatus("error");
    }
  };

  const handleRedeemOnChain = async (e) => {
    e.preventDefault();
    setTxError(null);
    setTxHash(null);

    try {
      if (!account) throw new Error("Connect wallet first");
      if (!donationTreasury?.writeContract)
        throw new Error("Wallet not connected / DonationTreasury not ready");

      if (!redeemRusdAmount || parseFloat(redeemRusdAmount) <= 0)
        throw new Error("Enter valid RUSD amount");

      const bal = parseFloat(merchantBalance || "0");
      if (parseFloat(redeemRusdAmount) > bal)
        throw new Error(
          `Insufficient RUSD balance. Available: ${bal.toFixed(2)} RUSD`
        );

      setTxStatus("pending");

      const amtWei = ethers.parseEther(redeemRusdAmount.toString());

      await donationTreasury.writeContract.redeemOnChain.staticCall(amtWei);

      const overrides = await getLegacyOverrides(
        donationTreasury.writeContract,
        500000
      );

      const tx = await donationTreasury.writeContract.redeemOnChain(
        amtWei,
        overrides
      );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setRedeemRusdAmount("");

      await loadBalance();
      await loadOnchainRedemptions();
    } catch (err) {
      console.error("❌ On-chain redemption failed:", err);

      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "On-chain redemption failed";

      setTxError(msg);
      setTxStatus("error");
    }
  };

  if (loading) return <RedemptionSkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
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
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Redemption Portal
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Redemption Requests</h1>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 mb-10">
          <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono mb-1">
            Your RUSD Balance
          </p>
          <p className="text-3xl font-bold text-emerald-400">
            {parseFloat(merchantBalance || "0").toFixed(2)} RUSD
          </p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl">
              🔄
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
                On-chain Redemption
              </p>
              <h2 className="text-xl font-semibold">RUSD → POL</h2>
            </div>
          </div>

          <form onSubmit={handleRedeemOnChain} className="space-y-6">
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                RUSD Amount
              </label>
              <input
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                type="number"
                min="0"
                step="0.01"
                value={redeemRusdAmount}
                onChange={(e) => setRedeemRusdAmount(e.target.value)}
                placeholder="Enter RUSD amount to redeem"
                required
              />
            </div>

            <TransactionStatus status={txStatus} hash={txHash} error={txError} />

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-cyan-500 to-emerald-500
              hover:from-cyan-400 hover:to-emerald-400
              transition-all duration-300 shadow-lg shadow-cyan-500/30
              disabled:opacity-60"
              disabled={txStatus === "pending"}
            >
              {txStatus === "pending" ? "Redeeming..." : "Redeem On-chain"}
            </button>
          </form>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl">
              💸
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-purple-400 font-mono">
                Off-chain Redemption
              </p>
              <h2 className="text-xl font-semibold">Request INR Transfer</h2>
            </div>
          </div>

          <form onSubmit={handleSubmitRedemption} className="space-y-6">
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                RUSD Amount
              </label>
              <input
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                type="number"
                min="0"
                step="0.01"
                value={rusdAmount}
                onChange={(e) => setRusdAmount(e.target.value)}
                placeholder="Enter RUSD amount"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                INR Amount
              </label>
              <input
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                type="number"
                min="1"
                step="1"
                value={inrAmount}
                onChange={(e) => setInrAmount(e.target.value)}
                placeholder="Enter INR amount"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                UPI ID
              </label>
              <input
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="example@upi"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Note (Optional)
              </label>
              <textarea
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add additional information..."
              />
            </div>

            <TransactionStatus status={txStatus} hash={txHash} error={txError} />

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-purple-500 to-pink-500
              hover:from-purple-400 hover:to-pink-400
              transition-all duration-300 shadow-lg shadow-purple-500/30
              disabled:opacity-60"
              disabled={txStatus === "pending"}
            >
              {txStatus === "pending" ? "Submitting..." : "Submit Redemption Request"}
            </button>
          </form>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xl">
                📜
              </div>
              <h2 className="text-xl font-semibold">Redemption History</h2>
            </div>
            <button
              className="px-4 py-2 rounded-lg text-sm font-mono font-semibold
              bg-gray-800/50 border border-gray-700 text-gray-300 
              hover:border-cyan-500/50 transition-all duration-300"
              onClick={() => {
                loadOffchainRequests();
                loadOnchainRedemptions();
              }}
              disabled={loadingOffchain || loadingOnchain}
            >
              Refresh
            </button>
          </div>

          <div className="flex border-b border-gray-800 mb-6">
            <button
              className={`px-6 py-3 font-mono font-semibold text-sm transition-all duration-300 ${
                activeTab === "offchain"
                  ? "border-b-2 border-cyan-500 text-cyan-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              onClick={() => setActiveTab("offchain")}
            >
              Off-chain Requests ({offchainRequests.length})
            </button>
            <button
              className={`px-6 py-3 font-mono font-semibold text-sm ml-4 transition-all duration-300 ${
                activeTab === "onchain"
                  ? "border-b-2 border-cyan-500 text-cyan-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              onClick={() => setActiveTab("onchain")}
            >
              On-chain Redemptions ({onchainRedemptions.length})
            </button>
          </div>

          {activeTab === "offchain" && (
            <>
              {loadingOffchain ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                </div>
              ) : offchainRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <p className="text-gray-400 font-mono">No off-chain redemption requests yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {offchainRequests.map((r) => (
                    <div
                      key={r.id}
                      className="bg-gray-950/50 border border-gray-800/50 rounded-xl p-4 hover:border-purple-500/30 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-lg text-purple-400">
                            {parseFloat(r.rusdAmount).toFixed(2)} RUSD
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                            Request ID: #{r.id} • {formatters.formatDate(r.timestamp)}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-mono ${
                            r.status === 0
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              : r.status === 1
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {r.status === 0 ? "PENDING" : r.status === 1 ? "FULFILLED" : "REJECTED"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">Request CID:</span>
                          <span className="text-xs text-gray-400 font-mono truncate">
                            {r.requestCID}
                          </span>
                        </div>

                        {r.fulfillmentCID && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-mono">Proof CID:</span>
                            <span className="text-xs text-emerald-400 font-mono truncate">
                              {r.fulfillmentCID}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "onchain" && (
            <>
              {loadingOnchain ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                </div>
              ) : onchainRedemptions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">⛓️</div>
                  <p className="text-gray-400 font-mono">No on-chain redemptions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {onchainRedemptions.map((r, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-950/50 border border-gray-800/50 rounded-xl p-4 hover:border-cyan-500/30 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-lg text-cyan-400">
                            {parseFloat(r.rusdAmount).toFixed(2)} RUSD → {parseFloat(r.polAmount).toFixed(4)} POL
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                            {formatters.formatDate(r.timestamp)}
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Completed
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">Tx Hash:</span>
                          <a
                            href={`https://polygonscan.com/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-400 font-mono hover:text-cyan-300 hover:underline truncate"
                          >
                            {r.txHash.slice(0, 10)}...{r.txHash.slice(-8)}
                          </a>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">Block:</span>
                          <span className="text-xs text-gray-400 font-mono">{r.blockNumber}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// HELPER FUNCTION - FETCH ON-CHAIN REDEMPTIONS
// ============================================

const fetchOnchainRedemptions = async ({
  provider,
  donationTreasuryAddress,
  abi,
  fromBlock,
  toBlock,
  chunkSize = 5000,
  merchant = null,
}) => {
  try {
    if (!provider) throw new Error("Provider not found");
    if (!donationTreasuryAddress)
      throw new Error("DonationTreasury address missing");
    if (!abi) throw new Error("DonationTreasury ABI missing");

    const iface = new ethers.Interface(abi);

    const eventTopic = iface.getEvent("RedeemedOnChain").topicHash;

    const latestBlock = await provider.getBlockNumber();
    const startBlock =
      typeof fromBlock === "number" ? fromBlock : Math.max(latestBlock - 50000, 0);
    const endBlock = typeof toBlock === "number" ? toBlock : latestBlock;

    if (startBlock > endBlock) {
      throw new Error(`Invalid range: fromBlock ${startBlock} > toBlock ${endBlock}`);
    }

    const logs = [];

    for (let start = startBlock; start <= endBlock; start += chunkSize) {
      const finish = Math.min(start + chunkSize - 1, endBlock);

      const part = await provider.getLogs({
        address: donationTreasuryAddress,
        fromBlock: start,
        toBlock: finish,
        topics: [eventTopic],
      });

      logs.push(...part);
    }

    const parsed = logs
      .map((log) => {
        const decoded = iface.parseLog(log);

        const merchantAddr = decoded.args.merchant;

        return {
          merchant: merchantAddr,
          rusdAmount: ethers.formatEther(decoded.args.rusdAmount),
          polAmount: ethers.formatEther(decoded.args.polAmount),
          timestamp: Number(decoded.args.timestamp),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      })
      .filter((x) => {
        if (!merchant) return true;
        return x.merchant.toLowerCase() === merchant.toLowerCase();
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    return { success: true, data: parsed };
  } catch (err) {
    console.error("fetchOnchainRedemptions error:", err);
    return {
      success: false,
      data: [],
      error:
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Failed to fetch on-chain redemptions",
    };
  }
};

// ============================================
// MERCHANT WITHDRAW
// ============================================

export const MerchantWithdraw = () => {
  const { account, chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefUSD : null
  );

  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState("0");
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account || !reliefUSD?.readContract) return;
    loadBalance();
  }, [account, reliefUSD?.readContract]);

  const loadBalance = async () => {
    try {
      setLoading(true);
      const bal = await reliefUSD.getBalance(account);
      setBalance(bal);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load balance:", err);
      setBalance("0");
      setLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setError("");
    setTxHash("");

    try {
      if (!amount || parseFloat(amount) <= 0) {
        setError("Please enter valid amount");
        return;
      }

      const bal = parseFloat(balance || "0");
      if (parseFloat(amount) > bal) {
        setError(`Insufficient balance. Available: ${bal.toFixed(2)} RUSD`);
        return;
      }

      setTxStatus("pending");

      await new Promise((r) => setTimeout(r, 2000));

      setTxStatus("success");
      setAmount("");
      await loadBalance();
    } catch (err) {
      const msg = err?.message || "Withdrawal failed";
      setError(msg);
      setTxStatus("error");
    }
  };

  if (loading) {
    return (
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
        <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-12">
          <div className="mb-8">
            <SkeletonBlock className="h-3 w-32 mb-2" />
            <SkeletonBlock className="h-10 w-64" />
          </div>
          <SkeletonBlock className="h-24 mb-6" />
          <SkeletonBlock className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
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

      <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Transaction
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Withdraw Funds</h1>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 mb-6">
          <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono mb-1">
            Available Balance
          </p>
          <p className="text-3xl font-bold text-emerald-400">
            {parseFloat(balance || "0").toFixed(2)} RUSD
          </p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl">
              💰
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-orange-400 font-mono">
                Withdrawal Request
              </p>
              <h2 className="text-xl font-semibold">Transfer Funds</h2>
            </div>
          </div>

          <form onSubmit={handleWithdraw} className="space-y-6">
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Amount (RUSD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to withdraw"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-mono text-sm">
                {error}
              </div>
            )}

            <TransactionStatus status={txStatus} hash={txHash} error={error} />

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-orange-500 to-red-500
              hover:from-orange-400 hover:to-red-400
              transition-all duration-300 shadow-lg shadow-orange-500/30
              disabled:opacity-60"
              disabled={txStatus === "pending"}
            >
              {txStatus === "pending" ? "Processing..." : "Withdraw"}
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 text-xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-yellow-400 mb-1">Note</p>
                <p className="text-xs text-gray-400">
                  Withdrawal functionality is currently under development. 
                  Please use the redemption feature to convert RUSD to fiat or cryptocurrency.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MERCHANT PAYMENTS
// ============================================

export const MerchantPayments = () => {
  const { account, chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState("ALL");

  useEffect(() => {
    if (!account || !reliefManager?.readContract) return;
    loadPayments();
  }, [account, filterPeriod, reliefManager?.readContract]);

  const loadPayments = async () => {
    try {
      if (!reliefManager?.readContract) return;

      setLoading(true);

      const txIds = await reliefManager.getMerchantTransactions(account);

      const txList = await Promise.all(
        txIds.map(async (id) => {
          const tx = await reliefManager.getTransaction(id);

          return {
            id: Number(id),
            beneficiary: tx[0],
            merchant: tx[1],
            amount: ethers.formatEther(tx[2]),
            category: categoryMapping.toString(Number(tx[3])),
            timestamp: Number(tx[4]),
            note: tx[5],
          };
        })
      );

      let finalList = txList.reverse();

      if (filterPeriod !== "ALL") {
        const now = Math.floor(Date.now() / 1000);

        const seconds =
          filterPeriod === "TODAY"
            ? 24 * 60 * 60
            : filterPeriod === "WEEK"
            ? 7 * 24 * 60 * 60
            : 30 * 24 * 60 * 60;

        finalList = finalList.filter((tx) => now - tx.timestamp <= seconds);
      }

      setPayments(finalList);
    } catch (err) {
      console.error("Failed to load merchant payments:", err);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PaymentsSkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
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
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Records
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Payment History</h1>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">
                🔍
              </div>
              <h2 className="text-lg font-semibold">Filter by Period</h2>
            </div>
            <select
              className="bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono text-sm"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="WEEK">This Week</option>
              <option value="MONTH">This Month</option>
            </select>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-12 text-center">
            <div className="text-6xl mb-4">💳</div>
            <p className="text-xl font-semibold mb-2">No payments found</p>
            <p className="text-gray-400 font-mono">No transactions match the selected filter</p>
          </div>
        ) : (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-800 bg-gray-950/40">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Beneficiary
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Note
                  </th>
                </tr>
              </thead>

            <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                  >
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      {formatters.formatDate(payment.timestamp)}
                    </td>

                    <td className="px-6 py-4 text-sm font-mono text-cyan-400 whitespace-nowrap truncate max-w-[220px]">
                      {formatters.formatAddress(payment.beneficiary)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {payment.category}
                      </span>
                    </td>

                    <td className="px-6 py-4 font-semibold whitespace-nowrap text-emerald-400">
                      +{parseFloat(payment.amount).toFixed(2)} RUSD
                    </td>

                    <td className="px-6 py-4 text-gray-400 text-sm whitespace-nowrap truncate max-w-[260px]">
                      {payment.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}
      </div>
    </div>
  );
}; 