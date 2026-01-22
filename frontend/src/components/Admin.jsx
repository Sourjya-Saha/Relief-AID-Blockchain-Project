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
  if (s === 0) return { text: "PENDING", cls: "badge badge-info" };
  if (s === 1) return { text: "FULFILLED", cls: "badge badge-success" };
  return { text: "REJECTED", cls: "badge badge-danger" };
};

// ============================================================
// ADMIN DASHBOARD (CLEAN VERSION)
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

  // -----------------------------
  // RENDER
  // -----------------------------
  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  if (!account) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="card text-center py-12">
          <p className="text-gray-700 font-semibold">Wallet not connected</p>
          <p className="text-gray-500 text-sm mt-2">Connect your wallet first.</p>
        </div>
      </div>
    );
  }

  if (!chainKey) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="card text-center py-12">
          <p className="text-gray-700 font-semibold">ChainId not detected</p>
          <p className="text-gray-500 text-sm mt-2">Reconnect wallet.</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>
        <div className="card text-center py-12">
          <p className="text-gray-700 font-semibold">Stats not loaded</p>
          <p className="text-gray-500 text-sm mt-2">Check console for errors.</p>
          <button
            onClick={() => {
              loadStats();
              loadRequests();
            }}
            className="btn-primary mt-4"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>

        <button
          onClick={() => {
            loadStats();
            loadRequests();
            loadOnchainRedemptions();
          }}
          className="btn-secondary"
          disabled={loadingRequests || actionLoading || loadingOnchain}
        >
          🔄 Refresh All
        </button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <StatCard title="Active Beneficiaries" value={stats.activeBeneficiaries ?? 0} icon="👥" color="blue" />
        <StatCard title="Revoked Beneficiaries" value={stats.revokedBeneficiaries ?? 0} icon="⛔" color="orange" />
        <StatCard title="Registered Beneficiaries" value={stats.registeredBeneficiaries ?? 0} icon="📝" color="purple" />

        <StatCard title="Active Merchants" value={stats.activeMerchants ?? 0} icon="🏪" color="green" />
        <StatCard title="Revoked Merchants" value={stats.revokedMerchants ?? 0} icon="⛔" color="orange" />
        <StatCard title="Registered Merchants" value={stats.registeredMerchants ?? 0} icon="📌" color="purple" />

        <StatCard title="RUSD Total Supply" value={`${parseFloat(stats.totalSupply ?? 0).toFixed(2)} RUSD`} icon="🪙" color="purple" />
        <StatCard title="Total Distributed" value={`${parseFloat(stats.totalDistributed ?? 0).toFixed(2)} RUSD`} icon="💰" color="purple" />
        <StatCard title="Total Spent" value={`${parseFloat(stats.totalSpent ?? 0).toFixed(2)} RUSD`} icon="🧾" color="green" />

        <StatCard title="Treasury Balance" value={`${parseFloat(stats.treasuryBalancePOL ?? 0).toFixed(4)} POL`} icon="🏦" color="blue" />
        <StatCard title="Total Donated" value={`${parseFloat(stats.totalDonatedPOL ?? 0).toFixed(4)} POL`} icon="🎁" color="green" />
        <StatCard title="Total Redeemed" value={`${parseFloat(stats.totalRedeemedPOL ?? 0).toFixed(4)} POL`} icon="🔁" color="orange" />

        <StatCard title="Redeemed (RUSD)" value={`${parseFloat(stats.totalRedeemedRUSD ?? 0).toFixed(2)} RUSD`} icon="🔥" color="purple" />
        <StatCard title="POL → RUSD Rate" value={`1 POL = ${stats.polToRusdRate ?? 0} RUSD`} icon="⚖️" color="blue" />
        <StatCard title="Offchain Requests" value={stats.totalRequests ?? 0} icon="📥" color="orange" />
      </div>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <QuickAction title="Register Beneficiary" description="Add new beneficiary" link="/admin/beneficiaries" icon="➕" />
        <QuickAction title="Register Merchant" description="Add new merchant" link="/admin/merchants" icon="🏪" />
        <QuickAction title="Distribute Funds" description="Distribute relief to beneficiaries" link="/admin/distribute" icon="💸" />
        <QuickAction title="Public Audit Trail" description="View system transactions" link="/audit" icon="🔍" />
      </div>

      {/* ADMIN CONTROLS */}
      <div className="card mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Admin Controls</h2>

        <div className="mb-6">
          <TransactionStatus status={adminTxStatus} hash={adminTxHash} error={adminTxError} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Update Rate */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">⚖️ Update POL → RUSD Rate</h3>
            <label className="label">New Rate</label>
            <input
              type="number"
              min="1"
              className="input-field"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="e.g. 1000"
            />
            <button onClick={handleUpdateRate} className="btn-primary mt-4 w-full">
              Update Rate
            </button>
          </div>

          {/* Withdraw POL */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">🏦 Withdraw POL from Treasury</h3>
            <label className="label">Recipient Address</label>
            <input
              type="text"
              className="input-field font-mono"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              placeholder="0x..."
            />
            <label className="label mt-3">Amount (POL)</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              className="input-field"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="e.g. 0.25"
            />
            <button onClick={handleWithdrawPOL} className="btn-primary mt-4 w-full">
              Withdraw POL
            </button>
          </div>
        </div>
      </div>

      {/* OFFCHAIN REQUESTS TABLE */}
      <div className="card mb-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Merchant Offchain Redemption Requests
          </h2>
          <button
            className="btn-secondary"
            onClick={loadRequests}
            disabled={loadingRequests || actionLoading}
          >
            🔄 Refresh
          </button>
        </div>

        {loadingRequests ? (
          <LoadingSpinner text="Loading requests..." />
        ) : requests.length === 0 ? (
          <p className="text-gray-600 text-center py-10">
            No offchain redemption requests found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Merchant</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
  INR
</th>
<th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
  UPI ID
</th>
<th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
  Note
</th>

                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map((r) => {
                  const st = statusLabel(r.status);
                  const details = cidDetailsMap?.[r.id];

                  return (
                    <tr key={r.id}>
                      <td className="px-6 py-4 text-sm font-semibold">#{r.id}</td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {formatters.formatAddress(r.merchant)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        {parseFloat(r.rusdAmount).toFixed(2)} RUSD
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
  {details?.inrAmount ? `₹${details.inrAmount}` : "-"}
</td>

<td className="px-6 py-4 text-sm font-mono">
  {details?.upiId || "-"}
</td>

<td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
  {details?.note || "-"}
</td>

                      <td className="px-6 py-4 text-sm">
                        <span className={st.cls}>{st.text}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">{formatters.formatDate(r.timestamp)}</td>
                      <td className="px-6 py-4 text-sm">
  <div className="flex flex-col gap-3">
    <button
      onClick={() =>
        alert(
          `requestCID:\n${r.requestCID}\n\nfulfillmentCID:\n${
            r.fulfillmentCID || "(none)"
          }`
        )
      }
      className="text-primary-600 hover:text-primary-800 text-left"
      type="button"
    >
      View CID
    </button>

    {r.status === 0 && (
      <div className="flex flex-col gap-4">
        {/* ✅ Fulfill */}
        <div className="border rounded-lg p-3 bg-green-50">
          <p className="text-xs text-gray-700 font-semibold mb-2">
            ✅ Fulfill Proof Upload
          </p>

          <input
            type="file"
            accept="image/*,.pdf"
            className="input-field"
            onChange={(e) =>
              setFulfillProofFiles((prev) => ({
                ...prev,
                [r.id]: e.target.files?.[0] || null,
              }))
            }
          />

          {fulfillProofFiles?.[r.id] && (
            <p className="text-xs text-green-700 mt-2 font-semibold">
              Selected: {fulfillProofFiles[r.id]?.name}
            </p>
          )}

          <button
            onClick={() => handleFulfill(r)}
            disabled={actionLoading || !fulfillProofFiles?.[r.id]}
            className={`btn-primary w-full mt-3 ${
              actionLoading || !fulfillProofFiles?.[r.id]
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            type="button"
          >
            ✅ Upload & Fulfill
          </button>
        </div>

        {/* ✅ Reject */}
        <div className="border rounded-lg p-3 bg-red-50">
          <p className="text-xs text-gray-700 font-semibold mb-2">
            ❌ Reject Proof Upload
          </p>

          <input
            type="file"
            accept="image/*,.pdf"
            className="input-field"
            onChange={(e) =>
              setRejectProofFiles((prev) => ({
                ...prev,
                [r.id]: e.target.files?.[0] || null,
              }))
            }
          />

          {rejectProofFiles?.[r.id] && (
            <p className="text-xs text-red-700 mt-2 font-semibold">
              Selected: {rejectProofFiles[r.id]?.name}
            </p>
          )}

          <button
            onClick={() => handleReject(r)}
            disabled={actionLoading || !rejectProofFiles?.[r.id]}
            className={`btn-danger w-full mt-3 ${
              actionLoading || !rejectProofFiles?.[r.id]
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            type="button"
          >
            ❌ Upload & Reject
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
        )}
      </div>

      {/* ✅ ON-CHAIN REDEMPTIONS TABLE */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Merchant On-Chain Redemptions
          </h2>
          <button
            className="btn-secondary"
            onClick={loadOnchainRedemptions}
            disabled={loadingOnchain}
          >
            🔄 Refresh
          </button>
        </div>

        {loadingOnchain ? (
          <LoadingSpinner text="Loading on-chain redemptions..." />
        ) : onchainRedemptions.length === 0 ? (
          <p className="text-gray-600 text-center py-10">
            No on-chain redemptions found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                    Merchant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                    RUSD Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                    POL Received
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                    TX Hash
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {onchainRedemptions.map((redemption, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 text-sm font-mono">
                      {formatters.formatAddress(redemption.merchant)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold">
                      {parseFloat(redemption.rusdAmount).toFixed(2)} RUSD
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">
                      {parseFloat(redemption.polAmount).toFixed(4)} POL
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {formatters.formatDate(redemption.timestamp)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <a
                        href={`https://amoy.polygonscan.com/tx/${redemption.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-800 font-mono text-xs"
                      >
                        {redemption.txHash.slice(0, 10)}...{redemption.txHash.slice(-8)}
                      </a>
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

  function QuickAction({ title, description, link, icon }) {
    return (
      <div
        onClick={() => navigate(link)}
        className="card hover:shadow-lg transition-shadow cursor-pointer"
      >
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-2xl">
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
      </div>
    );
  }
};

// ==================== STATCARD ====================
const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    purple: "bg-purple-100 text-purple-800",
    orange: "bg-orange-100 text-orange-800",
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

// ============================================================
// BENEFICIARY MANAGEMENT
// ============================================================
export const BeneficiaryManagement = () => {
  const { chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager contract not ready");

      const list = await reliefManager.getAllBeneficiaries();
      const uniqueList = [...new Set(list)];

      const beneficiaryList = await Promise.all(
        uniqueList.map(async (addr) => {
          const details = await reliefManager.getBeneficiaryDetails(addr);
          return { address: addr, ...details };
        })
      );

      setBeneficiaries(beneficiaryList);
    } catch (error) {
      console.error("Failed to load beneficiaries:", error);
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadBeneficiaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reliefManager?.readContract]);

const handleRevoke = async (ben) => {
  try {
    if (!askConfirm(`Revoke beneficiary access?\n\n${ben.address}`)) return;

    if (!reliefManager?.writeContract)
      throw new Error("Wallet not connected or contract not ready");

    setActionLoading(true);

    // ✅ provider from ethers runner
    const provider = reliefManager.writeContract.runner?.provider;
    if (!provider) throw new Error("Provider not available");

    // ✅ Legacy gas for Amoy
    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    console.log("🛑 Revoking beneficiary:", ben.address);
    console.log("⛽ gasPrice:", gasPrice.toString());

    // ✅ Optional simulation
    console.log("🧪 Simulating removeBeneficiary...");
    await reliefManager.writeContract.removeBeneficiary.staticCall(ben.address);
    console.log("✅ Simulation passed");

    // ✅ Send tx
    const tx = await reliefManager.writeContract.removeBeneficiary(ben.address, {
      gasLimit: 400000,
      gasPrice,
    });

    console.log("⛓️ TX Hash:", tx.hash);
    await tx.wait();

    await loadBeneficiaries();
  } catch (err) {
    console.error("❌ revoke failed:", err);
    alert(
      err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Failed to revoke beneficiary"
    );
  } finally {
    setActionLoading(false);
  }
};

const handleReWhitelist = async (ben) => {
  try {
    if (!askConfirm(`Re-Whitelist beneficiary?\n\n${ben.address}`)) return;

    if (!reliefManager?.writeContract)
      throw new Error("Wallet not connected or contract not ready");

    setActionLoading(true);

    // ✅ provider from ethers runner
    const provider = reliefManager.writeContract.runner?.provider;
    if (!provider) throw new Error("Provider not available");

    // ✅ Legacy gas for Amoy
    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    console.log("✅ Re-whitelisting beneficiary:", ben.address);
    console.log("⛽ gasPrice:", gasPrice.toString());

    // ✅ Optional simulation
    console.log("🧪 Simulating reWhitelistBeneficiary...");
    await reliefManager.writeContract.reWhitelistBeneficiary.staticCall(
      ben.address
    );
    console.log("✅ Simulation passed");

    // ✅ Send tx
    const tx = await reliefManager.writeContract.reWhitelistBeneficiary(
      ben.address,
      {
        gasLimit: 400000,
        gasPrice,
      }
    );

    console.log("⛓️ TX Hash:", tx.hash);
    await tx.wait();

    await loadBeneficiaries();
  } catch (err) {
    console.error("❌ reWhitelist failed:", err);
    alert(
      err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Failed to re-whitelist beneficiary"
    );
  } finally {
    setActionLoading(false);
  }
};


  if (loading) return <LoadingSpinner text="Loading beneficiaries..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Beneficiary Management
        </h1>

        <button
          onClick={() => setShowModal(true)}
          className="btn-primary"
          disabled={actionLoading}
        >
          ➕ Add Beneficiary
        </button>
      </div>

      {beneficiaries.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">No beneficiaries registered yet</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Received
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {beneficiaries.map((ben) => (
                <tr key={ben.address}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-mono text-sm">
                      {formatters.formatAddress(ben.address)}
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {ben.isWhitelisted ? (
                      <span className="badge badge-success">ACTIVE</span>
                    ) : (
                      <span className="badge badge-danger">REVOKED</span>
                    )}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {parseFloat(ben.totalReceived).toFixed(2)} RUSD
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {parseFloat(ben.totalSpent).toFixed(2)} RUSD
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {parseFloat(ben.currentBalance).toFixed(2)} RUSD
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap space-x-4">
                    <button
                      onClick={() => setSelectedBeneficiary(ben)}
                      className="text-primary-600 hover:text-primary-800 text-sm"
                      disabled={actionLoading}
                    >
                      View
                    </button>

                    {ben.isWhitelisted ? (
                      <button
                        onClick={() => handleRevoke(ben)}
                        className="text-red-600 hover:text-red-800 text-sm"
                        disabled={actionLoading}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReWhitelist(ben)}
                        className="text-green-600 hover:text-green-800 text-sm"
                        disabled={actionLoading}
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


<SetSpendingLimits/>
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
  );
};

// ---------------- DETAILS ----------------
const BeneficiaryDetails = ({ beneficiary }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600">Address</p>
          <p className="font-mono text-sm">
            {formatters.formatAddress(beneficiary.address)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Total Received</p>
          <p className="font-semibold">
            {parseFloat(beneficiary.totalReceived).toFixed(2)} RUSD
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Total Spent</p>
          <p className="font-semibold">
            {parseFloat(beneficiary.totalSpent).toFixed(2)} RUSD
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Current Balance</p>
          <p className="font-semibold">
            {parseFloat(beneficiary.currentBalance).toFixed(2)} RUSD
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// REGISTER BENEFICIARY FORM
// ============================================================
const RegisterBeneficiaryForm = ({ onSuccess }) => {
  const { chainId, provider } = useWeb3(); // ✅ TAKE provider FROM WEB3 HOOK
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
      if (!validators.isAddress(formData.walletAddress)) {
        setError("Invalid wallet address");
        return;
      }

      if (!reliefManager?.writeContract) {
        setError("Wallet not connected. Please connect MetaMask.");
        return;
      }

      if (!provider) {
        setError("Provider not ready");
        return;
      }

      setTxStatus("pending");

      // ✅ Upload to backend -> IPFS
      const response = await fetch(
        "http://localhost:5000/api/beneficiary/upload-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const ipfsData = await response.json();
      if (!ipfsData.success) throw new Error(ipfsData.error);

      // ✅ Check chain
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== 80002) {
        throw new Error("Wrong network. Switch to Polygon Amoy (80002).");
      }

      // ✅ IMPORTANT FIX: LEGACY GAS (Amoy safe)
      const gasPriceHex = await provider.send("eth_gasPrice", []);
      const gasPrice = BigInt(gasPriceHex);

      console.log("⛽ gasPrice:", gasPrice.toString());

      // ✅ Simulation first (good practice)
      console.log("🧪 Simulating registerBeneficiary...");
      await reliefManager.writeContract.registerBeneficiary.staticCall(
        formData.walletAddress,
        ipfsData.cid
      );
      console.log("✅ Simulation passed");

      console.log("📝 Sending registerBeneficiary tx...");
      const tx = await reliefManager.writeContract.registerBeneficiary(
        formData.walletAddress,
        ipfsData.cid,
        {
          gasLimit: 600000,
          gasPrice: gasPrice, // ✅ THIS FIXES INTERNAL JSON RPC ERROR
        }
      );

      console.log("⛓️ TX Hash:", tx.hash);
      setTxHash(tx.hash);

      await tx.wait();
      setTxStatus("success");

      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      console.error("❌ registerBeneficiary failed:", err);

      setError(
        err?.reason ||
          err?.shortMessage ||
          err?.info?.error?.message ||
          err?.message ||
          "Failed to register beneficiary"
      );

      setTxStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Full Name</label>
        <input
          type="text"
          className="input-field"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Phone Number</label>
        <input
          type="tel"
          className="input-field"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Physical Address</label>
        <textarea
          className="input-field"
          rows="3"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Wallet Address</label>
        <input
          type="text"
          className="input-field font-mono"
          value={formData.walletAddress}
          onChange={(e) =>
            setFormData({ ...formData, walletAddress: e.target.value })
          }
          placeholder="0x..."
          required
        />
      </div>

      <div>
        <label className="label">Additional Information (Optional)</label>
        <textarea
          className="input-field"
          rows="2"
          value={formData.additionalInfo}
          onChange={(e) =>
            setFormData({ ...formData, additionalInfo: e.target.value })
          }
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
        {txStatus === "pending" ? "Registering..." : "Register Beneficiary"}
      </button>
    </form>
  );
};


// ============================================================
// MERCHANT MANAGEMENT
// ============================================================
export const MerchantManagement = () => {
  const { chainId } = useWeb3();
  const chainKey = getChainKey(chainId);

  const reliefManager = useReliefManager(
    ReliefManagerABI.abi,
    chainKey ? addresses?.[chainKey]?.ReliefManager : null
  );

  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState("ALL");

  const loadMerchants = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager contract not ready");

      const list = await reliefManager.getAllMerchants();
      const uniqueList = [...new Set(list)];

      const merchantList = await Promise.all(
        uniqueList.map(async (addr) => {
          const details = await reliefManager.getMerchantDetails(addr);
          return { address: addr, ...details };
        })
      );

      setMerchants(merchantList);
    } catch (error) {
      console.error("Failed to load merchants:", error);
      setMerchants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadMerchants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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


  const filteredMerchants =
    filterCategory === "ALL"
      ? merchants
      : merchants.filter((m) => m.category === filterCategory);

  if (loading) return <LoadingSpinner text="Loading merchants..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Merchant Management
        </h1>

        <button
          onClick={() => setShowModal(true)}
          className="btn-primary"
          disabled={actionLoading}
        >
          ➕ Add Merchant
        </button>
      </div>

      <div className="mb-6">
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
              disabled={actionLoading}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filteredMerchants.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">No merchants found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMerchants.map((merchant) => (
            <div key={merchant.address} className="card">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {merchant.name || "Unnamed Merchant"}
                </h3>

                <div className="flex flex-col items-end gap-2">
                  <span className="badge badge-info">{merchant.category}</span>

                  {merchant.isRegistered ? (
                    <span className="badge badge-success">ACTIVE</span>
                  ) : (
                    <span className="badge badge-danger">REVOKED</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Address:</span>
                  <span className="font-mono">
                    {formatters.formatAddress(merchant.address)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Total Received:</span>
                  <span className="font-semibold">
                    {parseFloat(merchant.totalReceived).toFixed(2)} RUSD
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Balance:</span>
                  <span className="font-semibold">
                    {parseFloat(merchant.currentBalance).toFixed(2)} RUSD
                  </span>
                </div>
              </div>

              <div className="mt-5 flex gap-3">
                {merchant.isRegistered ? (
                  <button
                    onClick={() => handleRevoke(merchant)}
                    className="btn-secondary bg-red-600 hover:bg-red-700 text-white w-full"
                    disabled={actionLoading}
                  >
                    Revoke
                  </button>
                ) : (
                  <button
                    onClick={() => handleReWhitelist(merchant)}
                    className="btn-secondary bg-green-600 hover:bg-green-700 text-white w-full"
                    disabled={actionLoading}
                  >
                    Re-Whitelist
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
  );
};

// ============================================================
// REGISTER MERCHANT FORM
// ============================================================
const RegisterMerchantForm = ({ onSuccess }) => {
  const { chainId, provider } = useWeb3(); // ✅ take provider from hook
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
    businessLicense: "",
    additionalInfo: "",
  });

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!validators.isAddress(formData.walletAddress)) {
        setError("Invalid wallet address");
        return;
      }

      if (!reliefManager?.writeContract) {
        setError("Wallet not connected. Please connect MetaMask.");
        return;
      }

      if (!provider) {
        setError("Provider not ready");
        return;
      }

      setTxStatus("pending");
      setTxHash("");

      // ✅ upload profile -> backend -> IPFS
      const response = await fetch(
        "http://localhost:5000/api/merchant/upload-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      const ipfsData = await response.json();
      if (!ipfsData.success) throw new Error(ipfsData.error);

      // ✅ Ensure correct chain
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== 80002) {
        throw new Error("Wrong network. Switch to Polygon Amoy (80002).");
      }

      // ✅ Polygon Amoy safe gas: use legacy gasPrice
      const gasPriceHex = await provider.send("eth_gasPrice", []);
      const gasPrice = BigInt(gasPriceHex);
      console.log("⛽ gasPrice:", gasPrice.toString());

      // ✅ Simulate
      console.log("🧪 Simulating registerMerchant...");
      await reliefManager.writeContract.registerMerchant.staticCall(
        formData.walletAddress,
        ipfsData.categoryEnum, // backend gives correct enum index
        formData.name,
        ipfsData.cid
      );
      console.log("✅ Simulation passed");

      // ✅ Send TX with legacy gas
      console.log("📝 Sending registerMerchant tx...");
      const tx = await reliefManager.writeContract.registerMerchant(
        formData.walletAddress,
        ipfsData.categoryEnum,
        formData.name,
        ipfsData.cid,
        {
          gasLimit: 700000,
          gasPrice: gasPrice,
        }
      );

      console.log("⛓️ TX Hash:", tx.hash);
      setTxHash(tx.hash);

      await tx.wait();
      setTxStatus("success");

      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      console.error("❌ registerMerchant failed:", err);

      setError(
        err?.reason ||
          err?.shortMessage ||
          err?.info?.error?.message ||
          err?.message ||
          "Failed to register merchant"
      );

      setTxStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Business Name</label>
        <input
          type="text"
          className="input-field"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Category</label>
        <select
          className="input-field"
          value={formData.category}
          onChange={(e) =>
            setFormData({ ...formData, category: e.target.value })
          }
          required
        >
          <option value="FOOD">Food</option>
          <option value="MEDICAL">Medical</option>
          <option value="SHELTER">Shelter</option>
        </select>
      </div>

      <div>
        <label className="label">Phone Number</label>
        <input
          type="tel"
          className="input-field"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Physical Address</label>
        <textarea
          className="input-field"
          rows="3"
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          required
        />
      </div>

      <div>
        <label className="label">Wallet Address</label>
        <input
          type="text"
          className="input-field font-mono"
          value={formData.walletAddress}
          onChange={(e) =>
            setFormData({ ...formData, walletAddress: e.target.value })
          }
          placeholder="0x..."
          required
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
        {txStatus === "pending" ? "Registering..." : "Register Merchant"}
      </button>
    </form>
  );
};


// ============================================================
// DISTRIBUTE FUNDS
// ============================================================
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

  const [loading, setLoading] = useState(false);
  const [contractBalance, setContractBalance] = useState("0");

  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager contract not ready");

      const list = await reliefManager.readContract.getAllBeneficiaries();

      const beneficiaryList = await Promise.all(
        list.map(async (addr) => {
          const details = await reliefManager.readContract.getBeneficiaryDetails(
            addr
          );

          // If your details struct differs, update these keys
          return {
            address: addr,
            ...details,
            currentBalance: details?.currentBalance
              ? ethers.formatEther(details.currentBalance)
              : "0",
          };
        })
      );

      setBeneficiaries(beneficiaryList);

      // ✅ Load ReliefManager's RUSD balance
      if (reliefUSD?.readContract) {
        const managerAddress = chainKey
          ? addresses?.[chainKey]?.ReliefManager
          : null;

        if (managerAddress) {
          const balance = await reliefUSD.readContract.balanceOf(managerAddress);
          setContractBalance(ethers.formatEther(balance));
        }
      }
    } catch (err) {
      console.error("Failed to load beneficiaries:", err);
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    if (!reliefUSD?.readContract) return;
    loadBeneficiaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reliefManager?.readContract, reliefUSD?.readContract]);

  const handleDistribute = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (!selectedBeneficiary || !amount || parseFloat(amount) <= 0) {
        setError("Please select beneficiary and enter valid amount");
        return;
      }

      if (!reliefManager?.writeContract) {
        setError("Wallet not connected. Please connect MetaMask.");
        return;
      }

      if (!provider) {
        setError("Provider not ready");
        return;
      }

      // ✅ Pre-check balance
      if (parseFloat(amount) > parseFloat(contractBalance)) {
        setError(
          `Insufficient RUSD in ReliefManager contract. Available: ${parseFloat(
            contractBalance
          ).toFixed(2)} RUSD`
        );
        return;
      }

      setTxStatus("pending");
      setTxHash("");

      const amountWei = ethers.parseEther(amount.toString());

      // ✅ DEBUG LOGS
      console.log("🚀 Distribute Funds Debug:");
      console.log("👤 Admin account:", account);
      console.log("🎯 Beneficiary:", selectedBeneficiary);
      console.log("💰 Amount (RUSD):", amount);
      console.log("💰 Amount (wei):", amountWei.toString());
      console.log("💼 Contract Balance:", contractBalance, "RUSD");

      // ✅ Simulation call
      console.log("🧪 Running simulation...");
      await reliefManager.writeContract.distributeFunds.staticCall(
        selectedBeneficiary,
        amountWei
      );
      console.log("✅ Simulation passed");

      // ✅ IMPORTANT FIX: LEGACY GAS (no EIP-1559)
      const gasPrice = await provider.send("eth_gasPrice", []);
      console.log("⛽ legacy gasPrice:", gasPrice.toString());

      // ✅ Send tx with legacy gasPrice
      console.log("📝 Sending transaction...");
      const tx = await reliefManager.writeContract.distributeFunds(
        selectedBeneficiary,
        amountWei,
        {
          gasLimit: 300000,
          gasPrice, // ✅ fix
        }
      );

      console.log("⛓️ TX Hash:", tx.hash);
      setTxHash(tx.hash);

      console.log("⏳ Waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("✅ TX Confirmed in block:", receipt.blockNumber);

      setTxStatus("success");
      setAmount("");
      setSelectedBeneficiary("");

      await loadBeneficiaries();
    } catch (err) {
      console.error("❌ Distribute failed FULL ERROR:", err);

      let errorMessage =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Transaction failed";

      // extra friendly messages
      if (errorMessage.includes("AccessControl")) {
        errorMessage =
          "Missing permission (ADMIN / MANAGER role). Your wallet cannot distribute.";
      } else if (errorMessage.toLowerCase().includes("user rejected")) {
        errorMessage = "Transaction rejected by user";
      } else if (errorMessage.toLowerCase().includes("gas")) {
        errorMessage =
          "Gas estimation / send failed. (RPC issue). Retrying with legacy gasPrice should fix.";
      }

      console.log("🧾 Extracted error:", errorMessage);

      setError(errorMessage);
      setTxStatus("error");
    }
  };

  if (loading) return <LoadingSpinner text="Loading beneficiaries..." />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Distribute Relief Funds
      </h1>

      {/* ✅ Contract Balance Display */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-600 font-semibold">
              ReliefManager Contract Balance
            </p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {parseFloat(contractBalance).toFixed(2)} RUSD
            </p>
          </div>
          <div className="text-4xl">💰</div>
        </div>

        {parseFloat(contractBalance) === 0 && (
          <p className="text-sm text-red-600 mt-2">
            ⚠️ Contract has no RUSD. Mint tokens to the ReliefManager address first.
          </p>
        )}
      </div>

      <div className="card">
        <form onSubmit={handleDistribute} className="space-y-6">
          <div>
            <label className="label">Select Beneficiary</label>
            <select
              className="input-field"
              value={selectedBeneficiary}
              onChange={(e) => setSelectedBeneficiary(e.target.value)}
              required
            >
              <option value="">-- Select Beneficiary --</option>
              {beneficiaries.map((ben) => (
                <option key={ben.address} value={ben.address}>
                  {formatters.formatAddress(ben.address)} - Balance:{" "}
                  {parseFloat(ben.currentBalance || 0).toFixed(2)} RUSD
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
              max={contractBalance}
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount to distribute"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum available: {parseFloat(contractBalance).toFixed(2)} RUSD
            </p>
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
            disabled={txStatus === "pending" || parseFloat(contractBalance) === 0}
          >
            {txStatus === "pending" ? "Distributing..." : "Distribute Funds"}
          </button>
        </form>
      </div>

      {/* ✅ Help Section */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">Troubleshooting</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Ensure ReliefManager holds RUSD tokens</li>
          <li>• Your account must have proper role permission</li>
          <li>• Beneficiary must be whitelisted</li>
          <li>• RPC must support gas calls (fixed using legacy gasPrice)</li>
        </ul>
      </div>
    </div>
  );
};
// ============================================================
// SET SPENDING LIMITS
// ============================================================
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

  // ✅ show current limits
  const [currentLimits, setCurrentLimits] = useState({
    FOOD: "0",
    MEDICAL: "0",
    SHELTER: "0",
  });

  const [loading, setLoading] = useState(false);

  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState("");

  const categories = ["FOOD", "MEDICAL", "SHELTER"];

  // -----------------------------
  // LOAD BENEFICIARIES
  // -----------------------------
  const loadBeneficiaries = async () => {
    try {
      setLoading(true);

      if (!reliefManager?.readContract)
        throw new Error("ReliefManager contract not ready");

      const list = await reliefManager.getAllBeneficiaries();

      const beneficiaryList = await Promise.all(
        list.map(async (addr) => {
          const details = await reliefManager.getBeneficiaryDetails(addr);
          return { address: addr, ...details };
        })
      );

      setBeneficiaries(beneficiaryList);
    } catch (err) {
      console.error("Failed to load beneficiaries:", err);
      setBeneficiaries([]);
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // LOAD CURRENT LIMITS
  // -----------------------------
  const loadCurrentLimits = async (beneficiaryAddr) => {
    try {
      if (!beneficiaryAddr) return;
      if (!reliefManager?.readContract) return;

      const newCurrent = {};

      for (const cat of categories) {
        // ✅ convert category to enum (assuming categoryMapping has toEnum)
        // if yours is different, replace this mapping logic
        const enumValue =
          cat === "FOOD" ? 0 : cat === "MEDICAL" ? 1 : 2;

        // ✅ IMPORTANT: change this based on your contract
        // Option A: getSpendingLimit(beneficiary, enum)
        // const limitWei = await reliefManager.readContract.getSpendingLimit(beneficiaryAddr, enumValue);

        // Option B: spendingLimits(address, enum) public mapping getter
        const limitWei = await reliefManager.readContract.spendingLimits(
          beneficiaryAddr,
          enumValue
        );

        newCurrent[cat] = ethers.formatEther(limitWei);
      }

      setCurrentLimits({
        FOOD: newCurrent.FOOD || "0",
        MEDICAL: newCurrent.MEDICAL || "0",
        SHELTER: newCurrent.SHELTER || "0",
      });
    } catch (err) {
      console.error("Failed to load current limits:", err);

      // don’t break UI
      setCurrentLimits({
        FOOD: "0",
        MEDICAL: "0",
        SHELTER: "0",
      });
    }
  };

  useEffect(() => {
    if (!reliefManager?.readContract) return;
    loadBeneficiaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reliefManager?.readContract]);

  useEffect(() => {
    if (!selectedBeneficiary) return;
    loadCurrentLimits(selectedBeneficiary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBeneficiary]);

  // -----------------------------
  // SET LIMIT
  // -----------------------------
  const handleSetLimit = async (category) => {
    setError("");
    setTxHash(null);

    try {
      if (!selectedBeneficiary) throw new Error("Select beneficiary first");

      const raw = limits[category];
      if (!raw || Number(raw) < 0) throw new Error("Enter valid limit amount");

      if (!reliefManager?.writeContract)
        throw new Error("Wallet not connected. Please connect MetaMask.");

      setTxStatus("pending");

      const limitWei = ethers.parseEther(raw.toString());

      // ✅ category enum
      const enumValue =
        category === "FOOD" ? 0 : category === "MEDICAL" ? 1 : 2;

      // ✅ simulate
      await reliefManager.writeContract.setSpendingLimit.staticCall(
        selectedBeneficiary,
        enumValue,
        limitWei
      );

      // ✅ legacy gas overrides (Amoy fix)
      const txOverrides = await getLegacyOverrides(
        reliefManager.writeContract,
        250000
      );

      const tx = await reliefManager.writeContract.setSpendingLimit(
        selectedBeneficiary,
        enumValue,
        limitWei,
        txOverrides
      );

      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");

      // ✅ refresh current limits
      await loadCurrentLimits(selectedBeneficiary);

      // optional reset only this category input
      setLimits((prev) => ({ ...prev, [category]: "" }));

      setTimeout(() => setTxStatus(null), 1500);
    } catch (err) {
      console.error("❌ set limit failed:", err);

      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Transaction failed";

      setError(msg);
      setTxStatus("error");
    }
  };

  if (loading) return <LoadingSpinner text="Loading beneficiaries..." />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Set Spending Limits
      </h1>

      <div className="card">
        <div className="space-y-6">
          {/* Select Beneficiary */}
          <div>
            <label className="label">Select Beneficiary</label>
            <select
              className="input-field"
              value={selectedBeneficiary}
              onChange={(e) => setSelectedBeneficiary(e.target.value)}
              required
            >
              <option value="">-- Select Beneficiary --</option>
              {beneficiaries.map((ben) => (
                <option key={ben.address} value={ben.address}>
                  {formatters.formatAddress(ben.address)}
                </option>
              ))}
            </select>
          </div>

          {/* Limits */}
          {categories.map((category) => (
            <div key={category} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{category}</h3>

                {/* ✅ current limit display */}
                <span className="text-sm text-gray-600">
                  Current Limit:{" "}
                  <b>{parseFloat(currentLimits[category] || "0").toFixed(2)} RUSD</b>
                </span>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="label">New Limit (RUSD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    value={limits[category]}
                    onChange={(e) =>
                      setLimits({ ...limits, [category]: e.target.value })
                    }
                    placeholder={`Enter ${category.toLowerCase()} limit`}
                    disabled={!selectedBeneficiary || txStatus === "pending"}
                  />
                </div>

                <button
                  onClick={() => handleSetLimit(category)}
                  className="btn-secondary"
                  disabled={
                    txStatus === "pending" ||
                    !selectedBeneficiary ||
                    !limits[category]
                  }
                >
                  Set Limit
                </button>
              </div>
            </div>
          ))}

          {/* Errors */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <TransactionStatus status={txStatus} hash={txHash} error={error} />
        </div>
      </div>
    </div>
  );
};
