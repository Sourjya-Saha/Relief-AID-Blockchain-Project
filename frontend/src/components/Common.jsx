import { useState, useEffect, Component } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";

import { useWeb3, useReliefManager, useReliefUSD, useContract, useAuth } from "../hooks/Web3Hooks";
import { formatters, categoryMapping, constants } from "../utils/Utils";


import ReliefManagerABI from "../contracts/ReliefManager.json";
import ReliefUSDABI from "../contracts/ReliefUSD.json";
import DonationTreasuryABI from "../contracts/DonationTreasury.json";

import addresses from "../contracts/addresses.json";

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

  const [txStatus, setTxStatus] = useState(null); // pending/success/error
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

  // -----------------------------
  // Load Stats
  // -----------------------------
  useEffect(() => {
    if (!reliefManager?.readContract) return;
    if (!reliefUSD?.readContract) return;

    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // -----------------------------
  // Donation: Connect Wallet
  // -----------------------------
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

      // ✅ connect once
      const addr = await connectWallet();

      // ✅ switch network if required
      if (!isCorrectNetwork) {
        await switchToCorrectNetwork();
        await connectWallet(); // refresh provider/signer/account after switching
      }

      console.log("✅ Donation wallet connected:", addr);
    } catch (err) {
      console.error("Wallet connect failed:", err);
      setTxStatus("error");
      setTxError(err?.message || "Failed to connect wallet");
    }
  };

  // -----------------------------
  // Debug: role check
  // -----------------------------
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

  // -----------------------------
  // Donate POL
  // -----------------------------
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

      console.log("💛 Donate Debug:");
      console.log("👤 Donor:", account);
      console.log("🏦 Treasury:", donationTreasuryAddress);
      console.log("💰 Amount POL:", donationAmount);
      console.log("💰 Amount Wei:", amountWei.toString());

      // ✅ Check chain
      if (!provider) throw new Error("Provider not ready");
      const net = await provider.getNetwork();
      console.log("🌐 ChainId:", Number(net.chainId));

      if (Number(net.chainId) !== 80002) {
        throw new Error("Wrong network. Please switch to Polygon Amoy (80002).");
      }

      // ✅ Check donate() existence
      const hasDonateFn = DonationTreasuryABI?.abi?.some(
        (f) => f.type === "function" && f.name === "donate"
      );

      // ✅ Legacy gasPrice (NO eth_maxPriorityFeePerGas)
      const gasPrice = await provider.send("eth_gasPrice", []);
      console.log("⛽ legacy gasPrice:", gasPrice.toString());

      let tx;

      if (hasDonateFn && donationTreasury?.writeContract?.donate) {
        // ✅ simulate
        console.log("🧪 Simulating donate()...");
        await donationTreasury.writeContract.donate.staticCall({
          value: amountWei,
        });
        console.log("✅ Simulation PASSED");

        // ✅ send
        console.log("📝 Sending donation tx via donate()...");
        tx = await donationTreasury.writeContract.donate({
          value: amountWei,
          gasLimit: 300000,
          gasPrice,
        });
      } else {
        // fallback: direct send POL to contract
        console.log("⚠️ donate() not found. Fallback sending POL...");
        if (!signer) throw new Error("Signer not available");

        tx = await signer.sendTransaction({
          to: donationTreasuryAddress,
          value: amountWei,
          gasLimit: 300000,
          gasPrice,
        });
      }

      console.log("⛓️ TX hash:", tx.hash);
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      console.log("✅ Confirmed in block:", receipt.blockNumber);

      setTxStatus("success");
      setDonationAmount("");

      await loadStats();
    } catch (err) {
      console.error("❌ Donation failed FULL ERROR:", err);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50">
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="w-24 h-24 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-8">
            <span className="text-4xl text-white font-bold">R</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Relief Aid System
          </h1>

          <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Transparent decentralized emergency relief distribution on Polygon Amoy.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-2xl mx-auto">
            <Link to="/login" className="btn-primary text-lg py-4 px-8">
              Login
            </Link>

            <Link to="/audit" className="btn-secondary text-lg py-4 px-8">
              View Audit Trail
            </Link>
          </div>
        </div>
      </section>

      {/* Donation Section */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto card p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            💛 Donate to Relief Fund
          </h2>

          <p className="text-gray-600 mb-6">
            Anyone can donate POL to support emergency aid distribution. Funds are stored
            on-chain in the DonationTreasury contract.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Donation Amount (POL)
              </label>

              <input
                type="number"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                placeholder="e.g. 0.1"
                className="input w-full"
                min="0"
                step="0.01"
              />

              <p className="text-xs text-gray-400 mt-2">
                Network: Polygon Amoy (Chain ID: 80002)
              </p>
            </div>

            {!account ? (
              <button
                onClick={handleDonateConnectWallet}
                className="btn-primary w-full py-3"
              >
                🦊 Connect Wallet
              </button>
            ) : !isCorrectNetwork ? (
              <button
                onClick={switchToCorrectNetwork}
                className="btn-secondary w-full py-3"
              >
                🔁 Switch to Amoy
              </button>
            ) : (
              <button
                onClick={handleDonate}
                disabled={donating}
                className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {donating ? "Donating..." : "Donate Now"}
              </button>
            )}
          </div>

          <div className="mt-6">
            <TransactionStatus status={txStatus} hash={txHash} error={txError} />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      {loadingStats && <LoadingSpinner text="Loading stats..." />}

      {stats && !loadingStats && (
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-primary-600 mb-2">
                  {stats.activeBeneficiaries}
                </div>
                <div className="text-gray-600">Active Beneficiaries</div>
                <div className="text-xs text-gray-400 mt-1">
                  Registered: {stats.totalBeneficiariesRegistered}
                </div>
              </div>

              <div>
                <div className="text-4xl font-bold text-green-600 mb-2">
                  {stats.activeMerchants}
                </div>
                <div className="text-gray-600">Active Merchants</div>
                <div className="text-xs text-gray-400 mt-1">
                  Registered: {stats.totalMerchantsRegistered}
                </div>
              </div>

              <div>
                <div className="text-4xl font-bold text-purple-600 mb-2">
                  {parseFloat(stats.totalDistributed).toFixed(0)}
                </div>
                <div className="text-gray-600">RUSD Distributed</div>
                <div className="text-xs text-gray-400 mt-1">
                  Total Spent: {parseFloat(stats.totalSpent).toFixed(0)} RUSD
                </div>
              </div>

              <div>
                <div className="text-4xl font-bold text-orange-600 mb-2">
                  {stats.totalTransactions}
                </div>
                <div className="text-gray-600">Transactions</div>
                <div className="text-xs text-gray-400 mt-1">
                  Total Spent: {parseFloat(stats.totalSpent).toFixed(0)} RUSD
                </div>
              </div>
            </div>

            <div className="mt-10 text-center text-gray-500 text-sm">
              Total Supply (RUSD):{" "}
              <span className="font-semibold">
                {parseFloat(stats.totalSupply).toFixed(2)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">How It Works</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Fully decentralized aid distribution powered by smart contracts
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon="👥"
              title="1. Register Beneficiaries"
              description="Admin verifies and registers beneficiaries on-chain with IPFS profiles"
            />
            <FeatureCard
              icon="💰"
              title="2. Distribute Aid"
              description="Mint and distribute ReliefUSD stablecoins with category spending limits"
            />
            <FeatureCard
              icon="🛒"
              title="3. Secure Spending"
              description="Beneficiaries spend only at verified merchants within approved limits"
            />
          </div>
        </div>
      </section>
    </div>
  );
};


const FeatureCard = ({ icon, title, description }) => (
  <div className="group">
    <div className="card p-8 hover:shadow-xl transition-all group-hover:-translate-y-2">
      <div className="text-4xl mb-6">{icon}</div>
      <h3 className="text-2xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (loading) return <LoadingSpinner text="Loading audit trail..." />;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-10 text-center">
          Public Audit Trail
        </h1>

        <div className="card mb-8">
          <h2 className="text-xl font-semibold mb-4">System Stats</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-gray-600 text-sm">Active Beneficiaries</p>
              <p className="text-2xl font-bold">{stats?.activeBeneficiaries ?? 0}</p>
              <p className="text-xs text-gray-400">
                Registered: {stats?.totalBeneficiariesRegistered ?? 0}
              </p>
            </div>

            <div>
              <p className="text-gray-600 text-sm">Active Merchants</p>
              <p className="text-2xl font-bold">{stats?.activeMerchants ?? 0}</p>
              <p className="text-xs text-gray-400">
                Registered: {stats?.totalMerchantsRegistered ?? 0}
              </p>
            </div>

            <div>
              <p className="text-gray-600 text-sm">Distributed</p>
              <p className="text-2xl font-bold">
                {parseFloat(stats?.totalDistributed ?? 0).toFixed(2)} RUSD
              </p>
              <p className="text-xs text-gray-400">
                Spent: {parseFloat(stats?.totalSpent ?? 0).toFixed(2)} RUSD
              </p>
            </div>

            <div>
              <p className="text-gray-600 text-sm">Transactions</p>
              <p className="text-2xl font-bold">{stats?.totalTransactions ?? 0}</p>
              <p className="text-xs text-gray-400">
                Spent: {parseFloat(stats?.totalSpent ?? 0).toFixed(2)} RUSD
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            <button onClick={loadAuditData} className="btn-secondary">
              🔄 Refresh
            </button>
          </div>

          {recentTx.length === 0 ? (
            <p className="text-center text-gray-600 py-10">
              No transactions found yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Beneficiary
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Merchant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Category
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {recentTx.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-6 py-4 text-sm">
                        {formatters.formatDate(tx.timestamp)}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {formatters.formatAddress(tx.beneficiary)}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {formatters.formatAddress(tx.merchant)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        {parseFloat(tx.amount).toFixed(2)} RUSD
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="badge badge-info">{tx.category}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== HEADER ====================

export const Header = () => {
  const { account, disconnect } = useWeb3();
  const { userRole, signOut } = useAuth();

  const handleDisconnect = () => {
    signOut();
    disconnect();
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl font-bold">R</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Relief Aid</span>
          </Link>

          {account && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Connected</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatters.formatAddress(account)}
                </div>
              </div>

              {userRole && <span className="badge badge-info">{userRole}</span>}

              <button
                onClick={handleDisconnect}
                className="btn-secondary text-sm"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// ==================== NAVBAR ====================

export const Navbar = () => {
  const { userRole } = useAuth();

  const getNavLinks = () => {
    switch (userRole) {
      case 'ADMIN':
        return [
          { to: '/admin', label: 'Dashboard' },
          { to: '/admin/beneficiaries', label: 'Beneficiaries' },
          { to: '/admin/merchants', label: 'Merchants' },
          { to: '/admin/distribute', label: 'Distribute' },
        ];
      case 'BENEFICIARY':
        return [
          { to: '/beneficiary', label: 'Dashboard' },
          { to: '/beneficiary/spend', label: 'Spend' },
          { to: '/beneficiary/history', label: 'History' },
        ];
      case 'MERCHANT':
        return [
          { to: '/merchant', label: 'Dashboard' },
          { to: '/merchant/payments', label: 'Payments' },
        ];
      default:
        return [
          { to: '/', label: 'Home' },
          { to: '/audit', label: 'Public Audit' },
        ];
    }
  };

  return (
    <nav className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8">
          {getNavLinks().map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="py-4 px-2 border-b-2 border-transparent hover:border-primary-600 text-gray-700 hover:text-gray-900 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

// ==================== FOOTER ====================

export const Footer = () => {
  return (
    <footer className="bg-gray-800 text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4">Relief Aid System</h3>
            <p className="text-gray-400 text-sm">
              Decentralized emergency relief distribution on Polygon Amoy
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/" className="hover:text-white">Home</Link></li>
              <li><Link to="/audit" className="hover:text-white">Public Audit</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Network</h4>
            <p className="text-sm text-gray-400">Polygon Amoy Testnet</p>
            <p className="text-sm text-gray-400">Chain ID: 80002</p>
          </div>
        </div>
        
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-sm text-gray-400">
          © 2026 Relief Aid System. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

// ==================== LOADING SPINNER ====================

export const LoadingSpinner = ({ size = 'md', text = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`${sizes[size]} border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin`}></div>
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  );
};

// ==================== ERROR BOUNDARY ====================

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="card max-w-md w-full text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== MODAL ====================

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        <div className={`inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle ${sizes[size]} w-full`}>
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== TRANSACTION STATUS ====================

export const TransactionStatus = ({ status, hash, error, onClear }) => {
  const getStatusColor = () => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "success":
        return "bg-green-100 text-green-800 border-green-200";
      case "error":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "pending":
        return "⏳";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "pending":
        return "Transaction Pending...";
      case "success":
        return "Transaction Successful!";
      case "error":
        return "Transaction Failed";
      default:
        return "Transaction Status";
    }
  };

  if (!status) return null;

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{getStatusIcon()}</span>
          <span className="font-semibold">{getStatusText()}</span>
        </div>

        {/* optional clear */}
        {onClear && (
          <button
            onClick={onClear}
            className="text-sm underline hover:no-underline"
          >
            Dismiss
          </button>
        )}
      </div>

      {hash && (
        <a
          href={`${constants.EXPLORER_URL}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline hover:no-underline"
        >
          View on Explorer
        </a>
      )}

      {error && <p className="text-sm mt-2">{error}</p>}
    </div>
  );
};