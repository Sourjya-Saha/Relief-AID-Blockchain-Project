import { useState, useEffect } from 'react';
import { useWeb3, useReliefManager, useReliefUSD } from '../hooks/Web3Hooks';
import { LoadingSpinner, Modal, TransactionStatus } from './Common';
import { formatters, categoryMapping } from '../utils/Utils';
import ReliefManagerABI from '../contracts/ReliefManager.json';
import ReliefUSDABI from '../contracts/ReliefUSD.json';
import addresses from '../contracts/addresses.json';
import { ethers } from "ethers";
// ==================== BENEFICIARY DASHBOARD ====================



const getLegacyOverrides = async (contract, gasLimit = 600000) => {
  const provider = contract?.runner?.provider;

  // fallback gasPrice (in case provider fails)
  const fallbackGasPrice = ethers.parseUnits("30", "gwei");

  let gasPrice = fallbackGasPrice;
  try {
    if (provider?.getFeeData) {
      const feeData = await provider.getFeeData();

      // ✅ ONLY use gasPrice
      if (feeData?.gasPrice) gasPrice = feeData.gasPrice;
    }
  } catch (e) {
    console.warn("⚠️ getFeeData failed, using fallback gasPrice", e);
  }

  return {
    gasLimit,
    gasPrice,
    // ✅ IMPORTANT: do NOT include maxFeePerGas / maxPriorityFeePerGas
  };
};

export const BeneficiaryDashboard = () => {
  const { account, chainId } = useWeb3();
  const reliefManager = useReliefManager(ReliefManagerABI.abi, addresses[chainId]?.ReliefManager);
  const reliefUSD = useReliefUSD(ReliefUSDABI.abi, addresses[chainId]?.ReliefUSD);
  const [details, setDetails] = useState(null);
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    loadData();
  }, [account]);

  const loadData = async () => {
    try {
      setLoading(true);
      const beneficiaryDetails = await reliefManager.getBeneficiaryDetails(account);
      const tokenBalance = await reliefUSD.getBalance(account);
      
      setDetails(beneficiaryDetails);
      setBalance(tokenBalance);
      
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
      const response = await fetch(`http://localhost:5000/api/profile/${cid}`);
      const data = await response.json();
      if (data.success) {
        setProfile(data.data);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Beneficiary Dashboard</h1>
      
      {profile && (
        <div className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-medium">{profile.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{profile.phone}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-medium">{profile.address}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <BalanceCard 
          title="Current Balance" 
          value={`${parseFloat(balance).toFixed(2)} RUSD`}
          icon="💰"
          color="green"
        />
        <BalanceCard 
          title="Total Received" 
          value={`${parseFloat(details?.totalReceived || 0).toFixed(2)} RUSD`}
          icon="📥"
          color="blue"
        />
        <BalanceCard 
          title="Total Spent" 
          value={`${parseFloat(details?.totalSpent || 0).toFixed(2)} RUSD`}
          icon="📤"
          color="purple"
        />
        <BalanceCard 
          title="Available" 
          value={`${parseFloat(details?.currentBalance || 0).toFixed(2)} RUSD`}
          icon="✅"
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <CategoryCard 
          category="Food"
          spent={parseFloat(details?.foodSpent || 0).toFixed(2)}
          limit={parseFloat(details?.foodLimit || 0).toFixed(2)}
          icon="🍔"
        />
        <CategoryCard 
          category="Medical"
          spent={parseFloat(details?.medicalSpent || 0).toFixed(2)}
          limit={parseFloat(details?.medicalLimit || 0).toFixed(2)}
          icon="💊"
        />
        <CategoryCard 
          category="Shelter"
          spent={parseFloat(details?.shelterSpent || 0).toFixed(2)}
          limit={parseFloat(details?.shelterLimit || 0).toFixed(2)}
          icon="🏠"
        />
      </div>
    </div>
  );
};

const BalanceCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800'
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const CategoryCard = ({ category, spent, limit, icon }) => {
  const percentage = limit > 0 ? (spent / limit) * 100 : 0;
  const remaining = (limit - spent).toFixed(2);

  return (
    <div className="card">
      <div className="flex items-center space-x-3 mb-4">
        <div className="text-3xl">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
          <p className="text-sm text-gray-600">Remaining: {remaining} RUSD</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Spent:</span>
          <span className="font-semibold">{spent} RUSD</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Limit:</span>
          <span className="font-semibold">{limit} RUSD</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div 
            className={`h-2 rounded-full ${
              percentage >= 90 ? 'bg-red-600' : 
              percentage >= 70 ? 'bg-yellow-600' : 
              'bg-green-600'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-500 text-right">{percentage.toFixed(1)}% used</p>
      </div>
    </div>
  );
};

// ==================== SPEND FUNDS ====================

export const SpendFunds = () => {
  const { account, chainId } = useWeb3();

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    addresses[chainId]?.ReliefManager
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    addresses[chainId]?.ReliefUSD
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
    loadMerchants();
  }, []);

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

      setMerchants(merchantList);
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

    const managerAddress = addresses?.[chainId]?.ReliefManager;
    if (!managerAddress) throw new Error("ReliefManager address missing");

    const amtWei = ethers.parseEther(amount.toString());

    // ✅ Force legacy gas overrides
    const approveOverrides = await getLegacyOverrides(reliefUSD.writeContract, 200000);
    const spendOverrides = await getLegacyOverrides(reliefManager.writeContract, 600000);

    // ✅ 1) Allowance check
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

    // ✅ 2) Simulate spend
    console.log("🧪 Simulating spend...");
    await reliefManager.writeContract.spend.staticCall(
      selectedMerchant,
      amtWei,
      note || ""
    );
    console.log("✅ Spend simulation passed");

    // ✅ 3) Send spend tx
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

  if (loading) return <LoadingSpinner text="Loading merchants..." />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Spend Relief Funds</h1>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Filter by Category</h2>

        <div className="flex space-x-2">
          {["ALL", "FOOD", "MEDICAL", "SHELTER"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded-lg ${
                filterCategory === cat
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSpend} className="space-y-6">
          <div>
            <label className="label">Select Merchant</label>
            <select
              className="input-field"
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

          <div>
            <label className="label">Amount (RUSD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount to spend"
              required
            />
          </div>

          <div>
            <label className="label">Note (Optional)</label>
            <textarea
              className="input-field"
              rows="3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this transaction..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <TransactionStatus status={txStatus} hash={txHash} error={error} />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={txStatus === "pending"}
          >
            {txStatus === "pending" ? "Processing..." : "Spend Funds"}
          </button>
        </form>
      </div>
    </div>
  );
};


// ==================== TRANSACTION HISTORY ====================
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
export const BeneficiaryTransactionHistory = () => {
  const { account, chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTransactions = async () => {
    try {
      if (!account) return;

      // must have readContract
      if (!reliefManager?.readContract) {
        console.warn("ReliefManager contract not ready yet");
        return;
      }

      setLoading(true);

      // 1) tx ids
      const txIds = await reliefManager.getBeneficiaryTransactions(account);

      // 2) tx details
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

      // show newest first
      setTransactions(txList.reverse());
    } catch (error) {
      console.error("Failed to load transactions:", error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, reliefManager?.readContract]);

  if (loading) return <LoadingSpinner text="Loading transactions..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Transaction History
      </h1>

      {transactions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">No transactions yet</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Merchant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatters.formatDate(tx.timestamp)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                    {formatters.formatAddress(tx.merchant)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="badge badge-info">{tx.category}</span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                    {parseFloat(tx.amount).toFixed(2)} RUSD
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="badge badge-success">Completed</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
