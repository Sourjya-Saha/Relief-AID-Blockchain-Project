import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  useWeb3,
  useReliefManager,
  useReliefUSD,
  useDonationTreasury,
  useIPFS,
} from "../hooks/Web3Hooks";
import { LoadingSpinner, TransactionStatus } from "./Common";
import { formatters, categoryMapping } from "../utils/Utils";

import ReliefManagerABI from "../contracts/ReliefManager.json";
import ReliefUSDABI from "../contracts/ReliefUSD.json";
import DonationTreasuryABI from "../contracts/DonationTreasury.json";

import addresses from "../contracts/addresses.json";


// ==================== MERCHANT DASHBOARD ====================

export const MerchantDashboard = () => {
  const { account, chainId } = useWeb3();

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    addresses?.[chainId]?.ReliefManager
  );

  const reliefUSD = useReliefUSD(
    ReliefUSDABI.abi,
    addresses?.[chainId]?.ReliefUSD
  );

  const [details, setDetails] = useState(null);
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const [recentTx, setRecentTx] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    loadData();
    loadRecentPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, reliefManager?.readContract]);

  const loadData = async () => {
    try {
      setLoading(true);

      const merchantDetails = await reliefManager.getMerchantDetails(account);
      const tokenBalance = await reliefUSD.getBalance(account);

      setDetails(merchantDetails);
      setBalance(tokenBalance);

      if (merchantDetails?.profileCID) loadProfile(merchantDetails.profileCID);
    } catch (error) {
      console.error("Failed to load merchant data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async (cid) => {
    try {
      const response = await fetch(`http://localhost:5000/api/profile/${cid}`);
      const data = await response.json();
      if (data.success) setProfile(data.data);
    } catch (error) {
      console.error("Failed to load merchant profile:", error);
    }
  };

  const loadRecentPayments = async () => {
    try {
      if (!account) return;
      if (!reliefManager?.readContract) return;

      setTxLoading(true);

      const txIds = await reliefManager.getMerchantTransactions(account);

      // ✅ get last 5
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
    } finally {
      setTxLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Merchant Dashboard
      </h1>

      {profile && (
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">{profile.name}</h2>
              <p className="text-gray-600">{details?.category}</p>
            </div>

            <span
              className={`badge ${
                details?.category === "FOOD"
                  ? "badge-success"
                  : details?.category === "MEDICAL"
                  ? "badge-danger"
                  : "badge-info"
              }`}
            >
              {details?.category}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{profile.phone}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Business License</p>
              <p className="font-medium">{profile.businessLicense || "N/A"}</p>
            </div>

            <div className="col-span-2">
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-medium">{profile.address}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Current Balance"
          value={`${parseFloat(balance).toFixed(2)} RUSD`}
          icon="💰"
          color="green"
        />
        <StatCard
          title="Total Received"
          value={`${parseFloat(details?.totalReceived || 0).toFixed(2)} RUSD`}
          icon="📥"
          color="blue"
        />
        <StatCard
          title="Available Balance"
          value={`${parseFloat(details?.currentBalance || 0).toFixed(2)} RUSD`}
          icon="✅"
          color="purple"
        />
      </div>

      {/* ✅ Recent Activity */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>

        {txLoading ? (
          <LoadingSpinner text="Loading recent payments..." />
        ) : recentTx.length === 0 ? (
          <p className="text-gray-600">No payments received yet</p>
        ) : (
          <div className="space-y-3">
            {recentTx.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between border rounded-lg p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    +{parseFloat(tx.amount).toFixed(2)} RUSD{" "}
                    <span className="text-xs text-gray-500">
                      ({tx.category})
                    </span>
                  </p>

                  <p className="text-xs text-gray-500">
                    From: {formatters.formatAddress(tx.beneficiary)} •{" "}
                    {formatters.formatDate(tx.timestamp)}
                  </p>

                  {tx.note && (
                    <p className="text-xs text-gray-600 mt-1">
                      Note: {tx.note}
                    </p>
                  )}
                </div>

                <span className="badge badge-success">Completed</span>
              </div>
            ))}
          </div>
        )}
      </div>


      <MerchantRedemption />
    </div>
  );
};


// ==================== MERCHANT REDEMPTION ====================

const RedemptionStatus = {
  0: "PENDING",
  1: "FULFILLED",
  2: "REJECTED",
};

export const MerchantRedemption = () => {
  const { account, chainId, provider } = useWeb3();

  const donationTreasuryAddress = addresses?.[chainId]?.DonationTreasury;
  const reliefUSDAddress = addresses?.[chainId]?.ReliefUSD;

  const donationTreasury = useDonationTreasury(
    DonationTreasuryABI.abi,
    donationTreasuryAddress
  );

  const reliefUSD = useReliefUSD(ReliefUSDABI.abi, reliefUSDAddress);
  const ipfs = useIPFS();

  // Off-chain redemption form
  const [rusdAmount, setRusdAmount] = useState("");
  const [inrAmount, setInrAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [note, setNote] = useState("");

  // On-chain redemption form
  const [redeemRusdAmount, setRedeemRusdAmount] = useState("");

  const [merchantBalance, setMerchantBalance] = useState("0");

  // ✅ Off-chain request list state
  const [offchainRequests, setOffchainRequests] = useState([]);
  const [loadingOffchain, setLoadingOffchain] = useState(false);

  // ✅ On-chain redemption list state
  const [onchainRedemptions, setOnchainRedemptions] = useState([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);

  // ✅ Active tab state
  const [activeTab, setActiveTab] = useState("offchain"); // "offchain" | "onchain"

  // tx status
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

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

  const loadBalance = async () => {
    try {
      if (!account) return;
      if (!reliefUSD?.readContract) return;

      const bal = await reliefUSD.getBalance(account);
      setMerchantBalance(bal);
    } catch (err) {
      console.error("Failed to load merchant RUSD balance:", err);
      setMerchantBalance("0");
    }
  };

  // ✅ Load off-chain requests
  const loadOffchainRequests = async () => {
    try {
      if (!account) return;
      if (!donationTreasury?.readContract) return;

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

  // ✅ Load on-chain redemptions using event logs
  const loadOnchainRedemptions = async () => {
    try {
      if (!account) return;
      if (!provider) return;
      if (!donationTreasuryAddress) return;

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
    loadBalance();
    loadOffchainRequests();
    loadOnchainRedemptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // upload request to IPFS
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

      // simulate
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Redemption Requests
      </h1>

      {/* Balance */}
      <div className="card mb-6">
        <p className="text-sm text-gray-500">Your RUSD Balance</p>
        <p className="text-2xl font-bold text-gray-900">
          {parseFloat(merchantBalance || "0").toFixed(2)} RUSD
        </p>
      </div>

      {/* ONCHAIN */}
      <div className="card mb-10">
        <h2 className="text-xl font-semibold mb-4">
          Redeem On-chain (RUSD → POL)
        </h2>

        <form onSubmit={handleRedeemOnChain} className="space-y-4">
          <div>
            <label className="label">RUSD Amount</label>
            <input
              className="input-field"
              type="number"
              min="0"
              step="0.01"
              value={redeemRusdAmount}
              onChange={(e) => setRedeemRusdAmount(e.target.value)}
              placeholder="e.g. 100"
              required
            />
          </div>

          <TransactionStatus status={txStatus} hash={txHash} error={txError} />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={txStatus === "pending"}
          >
            {txStatus === "pending" ? "Redeeming..." : "Redeem On-chain"}
          </button>
        </form>
      </div>

      {/* OFFCHAIN */}
      <div className="card mb-10">
        <h2 className="text-xl font-semibold mb-4">
          Request Off-chain Redemption (INR)
        </h2>

        <form onSubmit={handleSubmitRedemption} className="space-y-4">
          <div>
            <label className="label">RUSD Amount</label>
            <input
              className="input-field"
              type="number"
              min="0"
              step="0.01"
              value={rusdAmount}
              onChange={(e) => setRusdAmount(e.target.value)}
              placeholder="e.g. 100"
              required
            />
          </div>

          <div>
            <label className="label">INR Amount</label>
            <input
              className="input-field"
              type="number"
              min="1"
              step="1"
              value={inrAmount}
              onChange={(e) => setInrAmount(e.target.value)}
              placeholder="e.g. 1000"
              required
            />
          </div>

          <div>
            <label className="label">UPI ID</label>
            <input
              className="input-field"
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="example@upi"
              required
            />
          </div>

          <div>
            <label className="label">Note (optional)</label>
            <textarea
              className="input-field"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <TransactionStatus status={txStatus} hash={txHash} error={txError} />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={txStatus === "pending"}
          >
            {txStatus === "pending"
              ? "Submitting..."
              : "Submit Redemption Request"}
          </button>
        </form>
      </div>

      {/* ✅ REDEMPTION HISTORY WITH TABS */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Redemption History</h2>
          <button
            className="btn-secondary"
            onClick={() => {
              loadOffchainRequests();
              loadOnchainRedemptions();
            }}
            disabled={loadingOffchain || loadingOnchain}
          >
            Refresh
          </button>
        </div>

        {/* ✅ Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === "offchain"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("offchain")}
          >
            Off-chain Requests ({offchainRequests.length})
          </button>
          <button
            className={`px-4 py-2 font-medium ml-4 ${
              activeTab === "onchain"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("onchain")}
          >
            On-chain Redemptions ({onchainRedemptions.length})
          </button>
        </div>

        {/* ✅ Off-chain Requests Tab */}
        {activeTab === "offchain" && (
          <>
            {loadingOffchain ? (
              <LoadingSpinner text="Loading off-chain requests..." />
            ) : offchainRequests.length === 0 ? (
              <p className="text-gray-600">No off-chain redemption requests yet.</p>
            ) : (
              <div className="space-y-3">
                {offchainRequests.map((r) => (
                  <div
                    key={r.id}
                    className="border rounded-lg p-4 flex items-start justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {parseFloat(r.rusdAmount).toFixed(2)} RUSD
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Request ID: {r.id} • {formatters.formatDate(r.timestamp)}
                      </p>

                      <p className="text-xs text-gray-600 mt-2">
                        Request CID:{" "}
                        <span className="font-mono">{r.requestCID}</span>
                      </p>

                      {r.fulfillmentCID && (
                        <p className="text-xs text-gray-600 mt-1">
                          Proof CID:{" "}
                          <span className="font-mono">{r.fulfillmentCID}</span>
                        </p>
                      )}
                    </div>

                    <span
                      className={`badge ${
                        r.status === 0
                          ? "badge-info"
                          : r.status === 1
                          ? "badge-success"
                          : "badge-danger"
                      }`}
                    >
                      {r.status === 0
                        ? "PENDING"
                        : r.status === 1
                        ? "FULFILLED"
                        : "REJECTED"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ✅ On-chain Redemptions Tab */}
        {activeTab === "onchain" && (
          <>
            {loadingOnchain ? (
              <LoadingSpinner text="Loading on-chain redemptions..." />
            ) : onchainRedemptions.length === 0 ? (
              <p className="text-gray-600">No on-chain redemptions yet.</p>
            ) : (
              <div className="space-y-3">
                {onchainRedemptions.map((r, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-4 flex items-start justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {parseFloat(r.rusdAmount).toFixed(2)} RUSD → {parseFloat(r.polAmount).toFixed(4)} POL
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatters.formatDate(r.timestamp)}
                      </p>

                      <p className="text-xs text-gray-600 mt-2">
                        Tx Hash:{" "}
                        <a
                          href={`https://polygonscan.com/tx/${r.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 hover:underline"
                        >
                          {r.txHash.slice(0, 10)}...{r.txHash.slice(-8)}
                        </a>
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        Block: {r.blockNumber}
                      </p>
                    </div>

                    <span className="badge badge-success">Completed</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ✅ Helper function to fetch on-chain redemptions
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

    // Event signature from ABI
    const eventTopic = iface.getEvent("RedeemedOnChain").topicHash;

    // Determine block range
    const latestBlock = await provider.getBlockNumber();
    const startBlock =
      typeof fromBlock === "number" ? fromBlock : Math.max(latestBlock - 50000, 0);
    const endBlock = typeof toBlock === "number" ? toBlock : latestBlock;

    if (startBlock > endBlock) {
      throw new Error(`Invalid range: fromBlock ${startBlock} > toBlock ${endBlock}`);
    }

    const logs = [];

    // Chunk scan to avoid JSON RPC "limit exceeded"
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
      .sort((a, b) => b.timestamp - a.timestamp); // newest first

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




const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    purple: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${colors[color]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

// ==================== MERCHANT PAYMENTS ====================

export const MerchantPayments = () => {
  const { account, chainId } = useWeb3();

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    addresses?.[chainId]?.ReliefManager
  );

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState("ALL");

  useEffect(() => {
    if (!account) return;
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // ✅ newest first
      let finalList = txList.reverse();

      // ✅ Filter by time period
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

  if (loading) return <LoadingSpinner text="Loading payments..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Payment History</h1>

      <div className="card mb-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Filter by Period</h2>
          <select
            className="input-field w-48"
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
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">💳</div>
          <p className="text-gray-600 text-lg">No payments received yet</p>
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
                  Beneficiary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Note
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatters.formatDate(payment.timestamp)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                    {formatters.formatAddress(payment.beneficiary)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="badge badge-info">{payment.category}</span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                    {parseFloat(payment.amount).toFixed(2)} RUSD
                  </td>

                  <td className="px-6 py-4 text-sm">{payment.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== WITHDRAWAL ====================
// NOTE: With your current contract design, merchant already has tokens in wallet.
// "Withdraw" doesn't make sense unless you implement burn/redeem/off-ramp.

export const MerchantWithdraw = () => {
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState(null);
  const [error, setError] = useState("");

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!amount || parseFloat(amount) <= 0) {
        setError("Please enter valid amount");
        return;
      }

      setTxStatus("pending");

      // Placeholder
      await new Promise((r) => setTimeout(r, 1000));

      setTxStatus("success");
      setAmount("");
    } catch (err) {
      setError(err.message);
      setTxStatus("error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Withdraw Funds</h1>

      <div className="card">
        <form onSubmit={handleWithdraw} className="space-y-6">
          <div>
            <label className="label">Amount (RUSD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <TransactionStatus status={txStatus} error={error} />

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={txStatus === "pending"}
          >
            {txStatus === "pending" ? "Processing..." : "Withdraw"}
          </button>
        </form>
      </div>
    </div>
  );
};
