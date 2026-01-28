import { useState, useEffect } from 'react';
import { useWeb3, useReliefManager, useReliefUSD } from '../hooks/Web3Hooks';
import { LoadingSpinner, Modal, TransactionStatus } from './Common';
import { formatters, categoryMapping } from '../utils/Utils';
import ReliefManagerABI from '../contracts/ReliefManager.json';
import ReliefUSDABI from '../contracts/ReliefUSD.json';
import addresses from '../contracts/addresses.json';
import { ethers } from "ethers";

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
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-64" />
      </div>

      {/* Profile Card */}
      <SkeletonBlock className="h-48 mb-10" />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
        {[...Array(4)].map((_, i) => (
          <SkeletonBlock key={i} className="h-32" />
        ))}
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
        {[...Array(3)].map((_, i) => (
          <SkeletonBlock key={i} className="h-64" />
        ))}
      </div>
    </div>
  </div>
);

const SpendFundsSkeleton = () => (
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

    <div className="relative max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-64" />
      </div>

      <SkeletonBlock className="h-24 mb-6" />
      <SkeletonBlock className="h-96" />
    </div>
  </div>
);

const TransactionHistorySkeleton = () => (
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

      <SkeletonBlock className="h-[600px]" />
    </div>
  </div>
);

// ============================================
// HELPER FUNCTIONS
// ============================================

const getLegacyOverrides = async (contract, gasLimit = 600000) => {
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
// BENEFICIARY DASHBOARD
// ============================================

const API_BASE_URL = process.env.PUBLIC_BACKEND_URL ;

export const BeneficiaryDashboard = () => {
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
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [spendingLimits, setSpendingLimits] = useState({
    FOOD: '0',
    MEDICAL: '0',
    SHELTER: '0'
  });

  useEffect(() => {
    if (!account || !reliefManager?.readContract || !reliefUSD?.readContract) return;
    loadData();
  }, [account, reliefManager?.readContract, reliefUSD?.readContract]);

  const loadData = async () => {
    try {
      setLoading(true);

      const beneficiaryDetails = await reliefManager.getBeneficiaryDetails(account);
      const tokenBalance = await reliefUSD.getBalance(account);

      setDetails(beneficiaryDetails);
      setBalance(tokenBalance);

      // Load spending limits
      const limits = {
        FOOD: '0',
        MEDICAL: '0',
        SHELTER: '0'
      };

      for (const cat of ['FOOD', 'MEDICAL', 'SHELTER']) {
        const enumValue = cat === 'FOOD' ? 0 : cat === 'MEDICAL' ? 1 : 2;
        const limitWei = await reliefManager.readContract.spendingLimits(account, enumValue);
        limits[cat] = ethers.formatEther(limitWei);
      }

      setSpendingLimits(limits);

      // Load profile from IPFS if CID exists
      if (beneficiaryDetails.profileCID) {
        loadProfile(beneficiaryDetails.profileCID);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
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
      console.error('Failed to load profile:', error);
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
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Relief Dashboard
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Beneficiary Portal</h1>
        </div>

        {/* Profile Card */}
        {profile && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl">
                👤
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
                  Profile Information
                </p>
                <h2 className="text-xl font-semibold">{profile.name}</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Phone</p>
                <p className="font-semibold">{profile.phone}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">Address</p>
                <p className="font-semibold">{profile.address}</p>
              </div>
           <div className="sm:col-span-3">
  <p className="text-xs sm:text-sm text-gray-400 mb-1 font-mono">
    Additional Info
  </p>

  <p className="font-semibold text-gray-300">
    {Object.keys(profile.additionalInfo || {}).length > 0
      ? JSON.stringify(profile.additionalInfo)
      : "No additional information provided"}
  </p>
</div>


            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="mb-10">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono">
              Account Overview
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
              title="Total Spent"
              value={`${parseFloat(details?.totalSpent || 0).toFixed(2)}`}
              unit="RUSD"
              icon="📤"
              color="purple"
            />
            <StatCard
              title="Available"
              value={`${parseFloat(details?.currentBalance || 0).toFixed(2)}`}
              unit="RUSD"
              icon="✅"
              color="orange"
            />
          </div>
        </div>

        {/* Category Cards */}
        <div className="mb-10">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-mono">
              Spending Limits
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <CategoryCard
              category="Food"
              spent={parseFloat(details?.foodSpent || 0)}
              limit={parseFloat(spendingLimits.FOOD || 0)}
              icon="🍔"
              color="emerald"
            />
            <CategoryCard
              category="Medical"
              spent={parseFloat(details?.medicalSpent || 0)}
              limit={parseFloat(spendingLimits.MEDICAL || 0)}
              icon="💊"
              color="cyan"
            />
            <CategoryCard
              category="Shelter"
              spent={parseFloat(details?.shelterSpent || 0)}
              limit={parseFloat(spendingLimits.SHELTER || 0)}
              icon="🏠"
              color="purple"
            />
          </div>
        </div>
      </div>
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
// CATEGORY CARD COMPONENT
// ============================================

const CategoryCard = ({ category, spent, limit, icon, color }) => {
  const percentage = limit > 0 ? (spent / limit) * 100 : 0;
  const remaining = (limit - spent).toFixed(2);

  const colors = {
    cyan: "border-cyan-500/20 hover:border-cyan-500/60",
    emerald: "border-emerald-500/20 hover:border-emerald-500/60",
    purple: "border-purple-500/20 hover:border-purple-500/60",
  };

  const iconColors = {
    cyan: "bg-cyan-500/10 border-cyan-500/20",
    emerald: "bg-emerald-500/10 border-emerald-500/20",
    purple: "bg-purple-500/10 border-purple-500/20",
  };

  return (
    <div
      className={`bg-gray-900/50 backdrop-blur-sm border rounded-xl p-6 hover:shadow-lg transition-all duration-300 ${colors[color]}`}
    >
      <div className="flex items-center gap-3 mb-6">
        <div
          className={`w-14 h-14 rounded-lg border flex items-center justify-center text-3xl ${iconColors[color]}`}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{category}</h3>
          <p className="text-sm text-gray-400 font-mono">
            Remaining: <span className="text-emerald-400 font-semibold">{remaining}</span> RUSD
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400 font-mono">Spent:</span>
          <span className="font-semibold">{spent.toFixed(2)} RUSD</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400 font-mono">Limit:</span>
          <span className="font-semibold">{limit.toFixed(2)} RUSD</span>
        </div>

        <div className="w-full bg-gray-800/50 rounded-full h-3 border border-gray-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage >= 90
                ? "bg-gradient-to-r from-red-500 to-red-600"
                : percentage >= 70
                ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                : "bg-gradient-to-r from-emerald-500 to-cyan-500"
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-500 text-right font-mono">
          {percentage.toFixed(1)}% used
        </p>
      </div>
    </div>
  );
};

// ============================================
// SPEND FUNDS COMPONENT
// ============================================

export const SpendFunds = () => {
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

  const [merchants, setMerchants] = useState([]);
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [filterCategory, setFilterCategory] = useState("ALL");

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadMerchants();
  }, [reliefManager?.readContract]);

  const loadMerchants = async () => {
    try {
      setLoading(true);

      const merchantAddresses = await reliefManager.getAllMerchants();

      const merchantList = await Promise.all(
        merchantAddresses.map(async (addr) => {
          const details = await reliefManager.getMerchantDetails(addr);
          return { address: addr, ...details };
        })
      );

      setMerchants(merchantList.filter(m => m.isRegistered));
    } catch (err) {
      console.error("Failed to load merchants:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSpend = async (e) => {
    e.preventDefault();
    setError("");
    setTxHash("");

    try {
      if (!selectedMerchant || !amount || parseFloat(amount) <= 0) {
        setError("Please select merchant and enter valid amount");
        return;
      }

      if (!reliefUSD?.writeContract || !reliefManager?.writeContract) {
        setError("Wallet not connected. Please connect MetaMask.");
        return;
      }

      setTxStatus("pending");

      const managerAddress = addresses?.[chainKey]?.ReliefManager;
      if (!managerAddress) throw new Error("ReliefManager address missing");

      const amtWei = ethers.parseEther(amount.toString());

      const approveOverrides = await getLegacyOverrides(reliefUSD.writeContract, 200000);
      const spendOverrides = await getLegacyOverrides(reliefManager.writeContract, 600000);

      const currentAllowance = await reliefUSD.getAllowance(account, managerAddress);

      if (parseFloat(currentAllowance) < parseFloat(amount)) {
        console.log("🧪 Simulating approve...");
        await reliefUSD.writeContract.approve.staticCall(managerAddress, amtWei);
        console.log("✅ Approve simulation passed");

        console.log("📝 Approving ReliefManager...");
        const approveTx = await reliefUSD.writeContract.approve(
          managerAddress,
          amtWei,
          approveOverrides
        );

        console.log("⛓️ Approve hash:", approveTx.hash);
        setTxHash(approveTx.hash);

        await approveTx.wait();
        console.log("✅ Approved");
      }

      console.log("🧪 Simulating spend...");
      await reliefManager.writeContract.spend.staticCall(
        selectedMerchant,
        amtWei,
        note || ""
      );
      console.log("✅ Spend simulation passed");

      console.log("📝 Sending spend tx...");
      const spendTx = await reliefManager.writeContract.spend(
        selectedMerchant,
        amtWei,
        note || "",
        spendOverrides
      );

      console.log("⛓️ Spend hash:", spendTx.hash);
      setTxHash(spendTx.hash);

      await spendTx.wait();
      console.log("✅ Spend confirmed");

      setTxStatus("success");
      setAmount("");
      setNote("");
      setSelectedMerchant("");
    } catch (err) {
      console.error("❌ Spend failed:", err);

      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Spend failed";

      setError(msg);
      setTxStatus("error");
    }
  };

  const filteredMerchants =
    filterCategory === "ALL"
      ? merchants
      : merchants.filter((m) => m.category === filterCategory);

  if (loading) return <SpendFundsSkeleton />;

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

      <div className="relative max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Transaction
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">Spend Relief Funds</h1>
        </div>

        {/* Filter Section */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider text-cyan-400 font-mono mb-1">
              Filter by Category
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {["ALL", "FOOD", "MEDICAL", "SHELTER"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-mono font-semibold transition-all duration-300 ${
                  filterCategory === cat
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg "
                    : "bg-gray-800/50 border border-gray-700 text-gray-300 hover:border-cyan-500/50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Spend Form */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8">
          <form onSubmit={handleSpend} className="space-y-6">
            {/* Select Merchant */}
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Select Merchant
              </label>
              <select
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                value={selectedMerchant}
                onChange={(e) => setSelectedMerchant(e.target.value)}
                required
              >
                <option value="">-- Select Merchant --</option>
                {filteredMerchants.map((merchant) => (
                  <option key={merchant.address} value={merchant.address}>
                    {merchant.name} ({merchant.category}) -{" "}
                    {formatters.formatAddress(merchant.address)}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Amount (RUSD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to spend"
                required
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
                Note (Optional)
              </label>
              <textarea
                className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors                 font-mono"
                rows="3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note about this transaction..."
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-mono text-sm">
                {error}
              </div>
            )}

            {/* TX STATUS */}
            <TransactionStatus status={txStatus} hash={txHash} error={error} />

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={txStatus === "pending"}
              className="w-full py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-cyan-500 to-emerald-500
              hover:from-cyan-400 hover:to-emerald-400
              transition-all duration-300 shadow-lg shadow-cyan-500/30
              disabled:opacity-60"
            >
              {txStatus === "pending" ? "Processing..." : "Spend Funds"}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================
// TRANSACTION HISTORY
// ============================================

export const BeneficiaryTransactionHistory = () => {

  const { account, chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account || !reliefManager?.readContract) return;
    loadTransactions();
  }, [account, reliefManager?.readContract]);

  const loadTransactions = async () => {
    try {
      setLoading(true);

      const txIds = await reliefManager.getBeneficiaryTransactions(account);

      const txList = await Promise.all(
        txIds.map(async (id) => {
          const tx = await reliefManager.getTransaction(id);

          return {
            id: Number(id),
            merchant: tx[1],
            amount: ethers.formatEther(tx[2]),
            category: categoryMapping.toString(Number(tx[3])),
            timestamp: Number(tx[4]),
            note: tx[5],
          };
        })
      );

      setTransactions(txList.reverse());
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <TransactionHistorySkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">

      {/* Grid BG */}
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

        {/* HEADER */}
        <div className="mb-8 sm:mb-12">
          <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 font-mono">
            Records
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold">
            Transaction History
          </h1>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-12 text-center">
            <p className="text-gray-400 font-mono">
              No transactions found
            </p>
          </div>
        ) : (

          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl overflow-x-auto">

            <table className="w-full">
              <thead className="border-b border-gray-800 bg-gray-950/40">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase">Merchant</th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-mono text-gray-400 uppercase">Note</th>
                </tr>
              </thead>

       <tbody>
  {transactions.map((tx) => (
    <tr
      key={tx.id}
      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
    >
      {/* DATE */}
      <td className="px-6 py-4 text-sm whitespace-nowrap">
        {formatters.formatDate(tx.timestamp)}
      </td>

      {/* MERCHANT */}
      <td className="px-6 py-4 text-sm font-mono text-cyan-400 whitespace-nowrap truncate max-w-[220px]">
        {formatters.formatAddress(tx.merchant)}
      </td>

      {/* CATEGORY */}
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className="px-3 py-1 rounded-full text-xs font-mono
          bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
        >
          {tx.category}
        </span>
      </td>

      {/* AMOUNT */}
      <td className="px-6 py-4 font-semibold whitespace-nowrap">
        {parseFloat(tx.amount).toFixed(2)} RUSD
      </td>

      {/* NOTE */}
      <td className="px-6 py-4 text-gray-400 text-sm whitespace-nowrap truncate max-w-[260px]">
        {tx.note || "-"}
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
