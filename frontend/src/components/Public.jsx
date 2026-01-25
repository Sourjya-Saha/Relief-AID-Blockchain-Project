import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";

import {
  useWeb3,
  useReliefManager,
  useReliefUSD,
  useContract,
  useAuth,
} from "../hooks/Web3Hooks";

import { LoadingSpinner, TransactionStatus } from "./Common";
import { formatters, categoryMapping } from "../utils/Utils";

import ReliefManagerABI from "../contracts/ReliefManager.json";
import ReliefUSDABI from "../contracts/ReliefUSD.json";
import DonationTreasuryABI from "../contracts/DonationTreasury.json";

import addresses from "../contracts/addresses.json";
import {
  HeroSkeleton,
  StatsGridSkeleton,
  DonationSkeleton,
  FlowSkeleton,
  TableSkeleton,
} from "./Skeletons";

// ==================== LANDING PAGE ====================
export const LandingPage = () => {
  const {
    account,
    provider,
    connectWallet,
    signer,
    isCorrectNetwork,
    switchToCorrectNetwork,
  } = useWeb3();

  const fixedChainId = 80002;

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    addresses?.[fixedChainId]?.ReliefManager
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    addresses?.[fixedChainId]?.ReliefUSD
  );

  const donationTreasuryAddress = addresses?.[fixedChainId]?.DonationTreasury;

  const donationTreasury = useContract(
    DonationTreasuryABI.abi,
    donationTreasuryAddress
  );

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [donationAmount, setDonationAmount] = useState("");
  const [donating, setDonating] = useState(false);

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

  // Mouse position for parallax effect
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
 const [pageLoading, setPageLoading] = useState(true);

useEffect(() => {
  const t = setTimeout(() => setPageLoading(false), 1200);
  return () => clearTimeout(t);
}, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Load Stats
  useEffect(() => {
    if (!reliefManager?.readContract) return;
    if (!reliefUSD?.readContract) return;
    loadStats();
  }, [reliefManager?.readContract, reliefUSD?.readContract]);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const systemStats = await reliefManager.readContract.getSystemStats();
      const totalSupply = await reliefUSD.readContract.totalSupply();

      const parsed = {
        activeBeneficiaries: Number(systemStats[0]),
        activeMerchants: Number(systemStats[1]),
        totalBeneficiariesRegistered: Number(systemStats[2]),
        totalMerchantsRegistered: Number(systemStats[3]),
        totalTransactions: Number(systemStats[4]),
        totalDistributed: ethers.formatEther(systemStats[5]),
        totalSpent: ethers.formatEther(systemStats[6]),
        contractETHBalance: ethers.formatEther(systemStats[7]),
        totalSupply: ethers.formatEther(totalSupply),
      };

      setStats(parsed);
    } catch (error) {
      console.error("Failed to load stats:", error);
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleDonateConnectWallet = async () => {
    try {
      setTxStatus(null);
      setTxHash(null);
      setTxError(null);

      if (!window.ethereum) {
        alert("MetaMask not installed. Please install MetaMask to continue.");
        window.open("https://metamask.io/download/", "_blank");
        return;
      }

      const addr = await connectWallet();

      if (!isCorrectNetwork) {
        await switchToCorrectNetwork();
        await connectWallet();
      }

      console.log("✅ Donation wallet connected:", addr);
    } catch (err) {
      console.error("Wallet connect failed:", err);
      setTxStatus("error");
      setTxError(err?.message || "Failed to connect wallet");
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        if (!reliefUSD?.readContract) return;
        if (!donationTreasuryAddress) return;

        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const hasRole = await reliefUSD.readContract.hasRole(
          MINTER_ROLE,
          donationTreasuryAddress
        );

        console.log("✅ DonationTreasury has MINTER_ROLE ?", hasRole);
      } catch (e) {
        console.log("Role check failed:", e);
      }
    };
    run();
  }, [reliefUSD?.readContract, donationTreasuryAddress]);

  const handleDonate = async () => {
    try {
      if (!account) {
        await handleDonateConnectWallet();
        return;
      }

      if (!donationTreasuryAddress) {
        alert("DonationTreasury address missing in addresses.json");
        return;
      }

      if (!donationAmount || Number(donationAmount) <= 0) {
        alert("Please enter a valid donation amount");
        return;
      }

      setDonating(true);
      setTxStatus("pending");
      setTxHash(null);
      setTxError(null);

      const amountWei = ethers.parseEther(donationAmount.toString());

      if (!provider) throw new Error("Provider not ready");
      const net = await provider.getNetwork();

      if (Number(net.chainId) !== 80002) {
        throw new Error("Wrong network. Please switch to Polygon Amoy (80002).");
      }

      const hasDonateFn = DonationTreasuryABI?.abi?.some(
        (f) => f.type === "function" && f.name === "donate"
      );

      const gasPrice = await provider.send("eth_gasPrice", []);

      let tx;

      if (hasDonateFn && donationTreasury?.writeContract?.donate) {
        await donationTreasury.writeContract.donate.staticCall({
          value: amountWei,
        });

        tx = await donationTreasury.writeContract.donate({
          value: amountWei,
          gasLimit: 300000,
          gasPrice,
        });
      } else {
        if (!signer) throw new Error("Signer not available");

        tx = await signer.sendTransaction({
          to: donationTreasuryAddress,
          value: amountWei,
          gasLimit: 300000,
          gasPrice,
        });
      }

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setDonationAmount("");
      await loadStats();
    } catch (err) {
      console.error("❌ Donation failed:", err);

      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Donation failed";

      setTxStatus("error");
      setTxError(msg);
    } finally {
      setDonating(false);
    }
  };
if (pageLoading) return <HeroSkeleton />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-cyan-500/20 rounded-full blur-3xl"
          style={{
            transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-emerald-500/20 rounded-full blur-3xl"
          style={{
            transform: `translate(${-mousePos.x}px, ${-mousePos.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 py-16 sm:py-20">
        {/* Enhanced Grid Pattern - Now visible everywhere */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none z-0"
          style={{
            backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.2) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(6, 182, 212, 0.2) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Animated Floating Data Fragments - Now visible on all screens */}
        <FloatingTexts />

        <div className="max-w-6xl mx-auto text-center relative z-10 w-full">
          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold mb-6 sm:mb-8 tracking-tight">
            <span className="bg-gradient-to-br from-white via-cyan-100 to-emerald-100 bg-clip-text text-transparent">
              Relief Infrastructure
            </span>
            <br />
            <span className="text-gray-400 text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
              for the Real World
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-base sm:text-lg md:text-xl font-mono text-gray-400 mb-12 sm:mb-16 max-w-2xl mx-auto font-light">
            Transparent. Verifiable. On-chain.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center px-4">
            <Link
              to="/login"
              className="w-full sm:w-auto group relative px-8 py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/50 hover:scale-105"
            >
              <span className="relative font-mono z-10">Launch App</span>
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>

            <Link
              to="/audit"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold border border-gray-700 hover:border-cyan-500/50 bg-gray-900/50 backdrop-blur-sm transition-all duration-300 font-mono hover:bg-gray-800/50"
            >
              View Public Audit
            </Link>
          </div>
        </div>
      </section>

      {/* Live System Snapshot */}
      {loadingStats && (
  <StatsGridSkeleton />
)}


      {loadingStats ? <FlowSkeleton /> : (
        <section className="relative pb-20 sm:pb-32 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-xs sm:text-sm uppercase tracking-wider text-cyan-400 mb-4 font-mono">
                Live System Status
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-100">
                Protocol Running
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <StatCard
                value={parseFloat(stats.totalDistributed).toFixed(0)}
                label="Funds Secured"
                unit="RUSD"
                color="cyan"
                sublabel={`Total Supply: ${parseFloat(stats.totalSupply).toFixed(0)}`}
              />
              <StatCard
                value={parseFloat(stats.totalSpent).toFixed(0)}
                label="Aid Released"
                unit="RUSD"
                color="emerald"
                sublabel={`${stats.totalTransactions} transactions`}
              />
              <StatCard
                value={stats.activeBeneficiaries + stats.activeMerchants}
                label="Verified Entities"
                color="cyan"
                sublabel={`${stats.activeBeneficiaries} beneficiaries, ${stats.activeMerchants} merchants`}
              />
            </div>
          </div>
        </section>
      )}

      {/* Donation Section */}
    {loadingStats ? <DonationSkeleton /> : ( <section className="relative py-20 sm:py-32 px-4 sm:px-6 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="p-6 sm:p-8 md:p-12">
            <div className="mb-8">
              <p className="text-xs sm:text-sm uppercase tracking-wider text-cyan-400 mb-2 font-mono">
                Contribute Capital
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Fund Protocol Treasury</h2>
              <p className="text-sm sm:text-base text-gray-400">
                Direct on-chain contribution to DonationTreasury contract.
                Polygon Amoy (80002).
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs sm:text-sm font-mono text-gray-400 mb-3 uppercase tracking-wider">
                  Amount (POL)
                </label>
                <input
                  type="number"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-xl sm:text-2xl font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  min="0"
                  step="0.01"
                />
              </div>

              {!account ? (
                <button
                  onClick={handleDonateConnectWallet}
                  className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 text-sm sm:text-base"
                >
                  Connect Wallet
                </button>
              ) : !isCorrectNetwork ? (
                <button
                  onClick={switchToCorrectNetwork}
                  className="w-full px-6 sm:px-8 py-3 sm:py-4 border border-cyan-500 rounded-xl font-semibold hover:bg-cyan-500/10 transition-all duration-300 text-sm sm:text-base"
                >
                  Switch to Polygon Amoy
                </button>
              ) : (
                <button
                  onClick={handleDonate}
                  disabled={donating}
                  className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-mono"
                >
                  {donating ? "Processing..." : "Execute Transaction"}
                </button>
              )}

              <div className="mt-6">
                <TransactionStatus
                  status={txStatus}
                  hash={txHash}
                  error={txError}
                />
              </div>
            </div>
          </div>
        </div>
      </section> )}

      {/* Enhanced Protocol Flow */}
     {/* Enhanced Protocol Flow */}
<section className="relative py-20 sm:py-36 px-4 sm:px-6 border-t border-gray-800/60 bg-gradient-to-b from-[#0B0F14] to-[#0F1623] overflow-hidden">
  <div className="max-w-6xl mx-auto">

    {/* Header */}
    <div className="text-center mb-16 sm:mb-24">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-400 font-mono mb-4">
        Protocol Architecture
      </p>
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
        Capital Flow
      </h2>
      <p className="text-sm sm:text-base md:text-lg text-gray-500">
        Deterministic. Verifiable. On-chain.
      </p>
    </div>

    {/* Flow Container */}
    <div className="relative max-w-4xl mx-auto">

      {/* Vertical Spine */}
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/0 via-cyan-500/40 to-cyan-500/0" />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 animate-pulse" />
      </div>

      {[
        {
          title: "Donation Received",
          subtitle: "Capital Entry",
          desc: "POL enters the DonationTreasury and is locked on-chain.",
          icon: "⬇",
          color: "cyan",
        },
        {
          title: "Escrow & Mint",
          subtitle: "Smart Contract Enforcement",
          desc: "RUSD is minted at protocol rate and routed to ReliefManager.",
          icon: "⚙",
          color: "emerald",
        },
        {
          title: "Identity Verification",
          subtitle: "Whitelisted Actors",
          desc: "Beneficiaries and merchants are validated via AccessControl.",
          icon: "✓",
          color: "cyan",
        },
        {
          title: "Redemption Executed",
          subtitle: "On / Off-chain Settlement",
          desc: "RUSD burned. POL released automatically or via admin approval.",
          icon: "⇄",
          color: "emerald",
        },
        {
          title: "Audit & Finality",
          subtitle: "Immutable Record",
          desc: "Transaction hash, timestamp, and state permanently recorded.",
          icon: "∞",
          color: "cyan",
        },
      ].map((step, i) => (
        <div
          key={i}
          className="relative flex flex-col md:flex-row items-center mb-16 sm:mb-20 md:mb-24 last:mb-0"
        >

          {/* Connector Line (desktop only) */}
          <div
            className={`hidden md:block absolute left-1/2 top-1/2 w-20 h-0.5
            ${
              i % 2 === 0
                ? "translate-x-0 bg-gradient-to-r"
                : "-translate-x-full bg-gradient-to-l"
            }
            ${
              step.color === "cyan"
                ? "from-cyan-500/40"
                : "from-emerald-500/40"
            } to-transparent`}
          />

          {/* Center Node */}
          <div className="relative md:absolute md:left-1/2 md:-translate-x-1/2 z-20 mb-6 md:mb-0">
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl bg-[#0F1623]
              border-2 flex items-center justify-center text-xl sm:text-2xl shadow-2xl
              ${
                step.color === "cyan"
                  ? "border-cyan-500/60 text-cyan-400 shadow-cyan-500/20"
                  : "border-emerald-500/60 text-emerald-400 shadow-emerald-500/20"
              }`}
            >
              {step.icon}
            </div>
          </div>

          {/* Card */}
          <div
            className={`w-full md:w-[calc(50%-4rem)]
            text-center md:text-left
            ${
              i % 2 === 0
                ? "md:ml-auto md:pl-16"
                : "md:mr-auto md:pr-16 md:text-right"
            }`}
          >
            <div
              className={`relative bg-gradient-to-br from-[#0F1623] to-[#1a1f2e]
              border rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-7
              transition-all duration-300 hover:scale-[1.02]
              ${
                step.color === "cyan"
                  ? "border-cyan-500/20 hover:border-cyan-500/60 hover:shadow-lg hover:shadow-cyan-500/10"
                  : "border-emerald-500/20 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10"
              }`}
            >
              {/* Glow Accent */}
              <div
                className={`absolute top-0 right-0 w-20 h-20 opacity-10 blur-2xl rounded-full
                ${
                  step.color === "cyan"
                    ? "bg-cyan-500"
                    : "bg-emerald-500"
                }`}
              />

              <p
                className={`text-xs sm:text-sm font-mono mb-2 uppercase tracking-wider
                ${
                  step.color === "cyan"
                    ? "text-cyan-400"
                    : "text-emerald-400"
                }`}
              >
                {step.subtitle}
              </p>

              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-2 sm:mb-3">
                {step.title}
              </h3>

              <p className="text-sm sm:text-sm text-gray-400 leading-relaxed font-mono">
                {step.desc}
              </p>
            </div>
          </div>

        </div>
      ))}
    </div>
  </div>
</section>


      {/* Final Statement */}
      <section className="relative py-20 sm:py-32 px-4 sm:px-6 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-8 sm:mb-12 leading-tight">
            When everything breaks,
            <br />
            <span className="bg-gradient-to-br from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              truth must not.
            </span>
          </h2>

          <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
            <Link
              to="/login"
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-mono font-semibold hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300"
            >
              Enter Platform
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

// Floating animated texts component
const FloatingTexts = () => {
  const floatingData = [
    { text: "0x7f...a4c2", delay: 0, duration: 20 },
    { text: "Block #847293", delay: 2, duration: 25 },
    { text: "Verified ✓", delay: 4, duration: 22 },
    { text: "RUSD Minted", delay: 1, duration: 23 },
    { text: "Treasury Lock", delay: 3, duration: 21 },
    { text: "AccessControl", delay: 5, duration: 24 },
    { text: "Immutable", delay: 2.5, duration: 26 },
    { text: "On-chain", delay: 4.5, duration: 19 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {floatingData.map((item, i) => (
        <div
          key={i}
          className="absolute text-xs sm:text-sm font-mono opacity-20 animate-float"
          style={{
            top: `${15 + (i * 12) % 70}%`,
            left: `${10 + (i * 15) % 80}%`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            color: i % 2 === 0 ? "#06b6d4" : "#10b981",
          }}
        >
          {item.text}
        </div>
      ))}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.3;
          }
          50% {
            transform: translate(100px, -150px) rotate(5deg);
            opacity: 0.2;
          }
          90% {
            opacity: 0.15;
          }
        }
        .animate-float {
          animation: float linear infinite;
        }
      `}</style>
    </div>
  );
};


const StatCard = ({ value, label, unit, color, sublabel }) => (
  <div className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 sm:p-6 hover:border-cyan-500/50 transition-all duration-300">
    <div className="flex items-baseline gap-2 mb-2">
      <div
        className={`text-2xl sm:text-3xl md:text-4xl font-bold ${
          color === "cyan" ? "text-cyan-400" : "text-emerald-400"
        }`}
      >
        {value}
      </div>
      {unit && <span className="text-sm sm:text-base md:text-lg text-gray-500 font-mono">{unit}</span>}
    </div>
    <div className="text-gray-400 text-xs sm:text-sm mb-1">{label}</div>
    {sublabel && <div className="text-gray-600 text-xs font-mono break-words">{sublabel}</div>}
  </div>
);

// ==================== AUDIT TRAIL ====================
export const AuditTrail = () => {
  const fixedChainId = 80002;

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    addresses?.[fixedChainId]?.ReliefManager
  );

  const [stats, setStats] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadAuditData();
  }, [reliefManager?.readContract]);

  const loadAuditData = async () => {
    try {
      if (!reliefManager?.readContract) return;
      setLoading(true);

      const systemStats = await reliefManager.readContract.getSystemStats();

      const parsedStats = {
        activeBeneficiaries: Number(systemStats[0]),
        activeMerchants: Number(systemStats[1]),
        totalBeneficiariesRegistered: Number(systemStats[2]),
        totalMerchantsRegistered: Number(systemStats[3]),
        totalTransactions: Number(systemStats[4]),
        totalDistributed: ethers.formatEther(systemStats[5]),
        totalSpent: ethers.formatEther(systemStats[6]),
        contractETHBalance: ethers.formatEther(systemStats[7]),
      };

      setStats(parsedStats);

      const totalTxBN = await reliefManager.readContract.getTotalTransactions();
      const total = Number(totalTxBN);

      if (total === 0) {
        setRecentTx([]);
        return;
      }

      const LIMIT = 10;
      const start = Math.max(0, total - LIMIT);

      const txList = [];

      for (let i = total - 1; i >= start; i--) {
        const tx = await reliefManager.readContract.getTransaction(i);

        txList.push({
          id: i,
          beneficiary: tx[0],
          merchant: tx[1],
          amount: ethers.formatEther(tx[2]),
          category: categoryMapping.toString(Number(tx[3])),
          timestamp: Number(tx[4]),
          note: tx[5],
        });
      }

      setRecentTx(txList);
    } catch (err) {
      console.error("Audit loading failed:", err);
      setRecentTx([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };
if (loading) return <TableSkeleton />;


  return (
    <div className="min-h-screen bg-[#0B0F14] text-white relative">
      {/* Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="relative py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-xs sm:text-sm uppercase tracking-wider text-cyan-400 mb-4 font-mono">
              Public Ledger
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6">
              Immutable Audit Trail
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-gray-400">
              Complete transparency. Zero trust required.
            </p>
          </div>

          {/* System Stats */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold mb-4 sm:mb-6 text-cyan-400 font-mono uppercase tracking-wider">
              Protocol Metrics
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div>
                <p className="text-gray-500 text-xs sm:text-sm mb-2 font-mono">Active Merchants</p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400">
                  {stats?.activeMerchants ?? 0}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  Registered: {stats?.totalMerchantsRegistered ?? 0}
                </p>
              </div>

              <div>
                <p className="text-gray-500 text-xs sm:text-sm mb-2 font-mono">Distributed</p>
                <p className="text-2xl sm:text-3xl font-bold text-cyan-400">
                  {parseFloat(stats?.totalDistributed ?? 0).toFixed(0)}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  Spent: {parseFloat(stats?.totalSpent ?? 0).toFixed(0)} RUSD
                </p>
              </div>

              <div>
                <p className="text-gray-500 text-xs sm:text-sm mb-2 font-mono">Transactions</p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400">
                  {stats?.totalTransactions ?? 0}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  All time on-chain
                </p>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-4 sm:p-6 md:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-base sm:text-lg md:text-xl font-semibold text-cyan-400 font-mono uppercase tracking-wider">
                Recent Transactions
              </h2>
              <button
                onClick={loadAuditData}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-700 hover:border-cyan-500/50 text-xs sm:text-sm font-semibold transition-all duration-300 hover:bg-cyan-500/5"
              >
                🔄 Refresh
              </button>
            </div>

            {recentTx.length === 0 ? (
              <div className="text-center py-12 sm:py-16">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl text-gray-600">∅</span>
                </div>
                <p className="text-sm sm:text-base text-gray-500 font-mono">No transactions recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Timestamp
                        </th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Beneficiary
                        </th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Merchant
                        </th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Amount
                        </th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-mono text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Category
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-800/50">
                      {recentTx.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-mono text-gray-400 whitespace-nowrap">
                            {formatters.formatDate(tx.timestamp)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-mono text-cyan-400 whitespace-nowrap">
                            {formatters.formatAddress(tx.beneficiary)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-mono text-emerald-400 whitespace-nowrap">
                            {formatters.formatAddress(tx.merchant)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                            {parseFloat(tx.amount).toFixed(2)} RUSD
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="px-2 sm:px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono whitespace-nowrap">
                              {tx.category}
                            </span>
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
    </div>
  );
};