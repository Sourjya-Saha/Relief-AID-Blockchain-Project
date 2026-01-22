import { ethers } from "ethers";

/**
 * ✅ Load ON-CHAIN Merchant Redemptions (RedeemedOnChain events)
 * Works without any contract change (event log scanning)
 *
 * @param {Object} params
 * @param {ethers.Provider} params.provider - ethers provider (BrowserProvider)
 * @param {string} params.donationTreasuryAddress - DonationTreasury contract address
 * @param {Array} params.abi - DonationTreasury ABI
 *
 * @param {number} [params.fromBlock] - start scanning block
 * @param {number} [params.toBlock] - end scanning block
 * @param {number} [params.chunkSize=5000] - chunk size for getLogs calls
 * @param {string|null} [params.merchant=null] - optional merchant filter
 *
 * @returns {Promise<{success:boolean, data:Array, error?:string}>}
 */
export const fetchOnchainRedemptions = async ({
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

    // ✅ Event signature from ABI
    const eventTopic = iface.getEvent("RedeemedOnChain").topicHash;

    // ✅ determine block range
    const latestBlock = await provider.getBlockNumber();
    const startBlock =
      typeof fromBlock === "number" ? fromBlock : Math.max(latestBlock - 50000, 0);
    const endBlock = typeof toBlock === "number" ? toBlock : latestBlock;

    if (startBlock > endBlock) {
      throw new Error(`Invalid range: fromBlock ${startBlock} > toBlock ${endBlock}`);
    }

    const logs = [];

    // ✅ chunk scan to avoid JSON RPC "limit exceeded"
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
