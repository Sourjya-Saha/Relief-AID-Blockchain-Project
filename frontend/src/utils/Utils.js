// ==================== CONSTANTS ====================
import { ethers } from "ethers";



export const constants = {
  CHAIN_ID: 80002,
  CHAIN_NAME: "Polygon Amoy Testnet",
  RPC_URL:
    import.meta.env.VITE_POLYGON_AMOY_RPC ||
    "https://rpc-amoy.polygon.technology/",
  EXPLORER_URL:
    import.meta.env.VITE_EXPLORER_URL || "https://amoy.polygonscan.com",
  BACKEND_URL: import.meta.env.VITE_PUBLIC_BACKEND_URL || "http://localhost:5000",
  IPFS_GATEWAY:
    import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",

  // Contract Addresses
  RELIEF_USD_ADDRESS: import.meta.env.VITE_RELIEF_USD_ADDRESS || "",
  RELIEF_MANAGER_ADDRESS: import.meta.env.VITE_RELIEF_MANAGER_ADDRESS || "",
DONATION_TREASURY_ADDRESS: import.meta.env.VITE_DONATION_TREASURY_ADDRESS || "",

  // Roles
  ROLES: {
    ADMIN: "ADMIN_ROLE",
    BENEFICIARY: "BENEFICIARY_ROLE",
    MERCHANT: "MERCHANT_ROLE",
  },
};

// ==================== CATEGORY MAPPING ====================

export const categoryMapping = {
  FOOD: 0,
  MEDICAL: 1,
  SHELTER: 2,

  // Reverse mapping
  0: "FOOD",
  1: "MEDICAL",
  2: "SHELTER",

  // Convert string to enum
toEnum: (category) => {
  if (category === null || category === undefined) return undefined;

  // ✅ If already enum number like 0/1/2
  if (typeof category === "number") return category;

  // ✅ If coming from select component as object like { value: "FOOD" }
  if (typeof category === "object" && category.value) {
    category = category.value;
  }

  // ✅ Force string conversion
  const normalized = String(category).trim().toUpperCase();

  // ✅ Accept Shelter/Food/Medical too
  if (normalized === "SHELTER") return 2;
  if (normalized === "FOOD") return 0;
  if (normalized === "MEDICAL") return 1;

  return categoryMapping[normalized];
},



  // Convert enum to string
  toString: (enumValue) => {
    return categoryMapping[enumValue] || "UNKNOWN";
  },

  // Get all categories
  getAll: () => ["FOOD", "MEDICAL", "SHELTER"],

  // Get category color
  getColor: (category) => {
    const colors = {
      FOOD: "bg-green-100 text-green-800",
      MEDICAL: "bg-red-100 text-red-800",
      SHELTER: "bg-blue-100 text-blue-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  },

  // Get category icon
  getIcon: (category) => {
    const icons = {
      FOOD: "🍽️",
      MEDICAL: "⚕️",
      SHELTER: "🏠",
    };
    return icons[category] || "📦";
  },
};

// ==================== FORMATTERS ====================

export const formatters = {
  // Format wallet address
  formatAddress: (address) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  },

  // Format token amount (wei to readable)
  formatTokenAmount: (amount, decimals = 18) => {
  if (!amount) return "0";
  try {
    return Number(ethers.formatUnits(amount, decimals)).toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  } catch {
    return "0";
  }
},


  // Parse token amount (display to wei)
parseTokenAmount: (amount, decimals = 18) => {
  if (!amount) return "0";
  try {
    return ethers.parseUnits(amount.toString(), decimals).toString();
  } catch {
    return "0";
  }
},



  // Format timestamp
  formatDate: (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  // Format relative time
  formatRelativeTime: (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp) * 1000);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "Just now";
  },

  // Format IPFS URL
  formatIPFSUrl: (cid) => {
    if (!cid) return "";
    return `${constants.IPFS_GATEWAY}${cid}`;
  },
};

// ==================== VALIDATORS ====================

export const validators = {
  /**
   * ✅ Your Admin.jsx is calling: validators.isAddress()
   * So we MUST provide it here.
   */

  // ✅ Main address validator
  isValidAddress: (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  // ✅ Alias for Admin.jsx compatibility
  isAddress: (address) => {
    return validators.isValidAddress(address);
  },

  // Validate amount
  isValidAmount: (amount) => {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
  },

  // Validate phone number
  isValidPhone: (phone) => {
    return /^\d{10}$/.test((phone || "").replace(/\D/g, ""));
  },

  // Validate category
  isValidCategory: (category) => {
    return categoryMapping.getAll().includes(category?.toUpperCase());
  },

  // Validate IPFS CID
  isValidCID: (cid) => {
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58}|B[A-Z2-7]{58}|z[1-9A-HJ-NP-Za-km-z]{48}|F[0-9A-F]{50})/i.test(
      cid
    );
  },
};

// ==================== HELPERS ====================

export const helpers = {
  // Sleep/delay function
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  // Copy to clipboard
  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Failed to copy:", err);
      return false;
    }
  },

  // Generate login message
  generateLoginMessage: (address) => {
    const timestamp = new Date().toISOString();
    const nonce = Math.floor(Math.random() * 1000000);
    return `Login to Relief Aid System\nWallet: ${address}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
  },

  // Check MetaMask installation
  isMetaMaskInstalled: () => {
    return (
      typeof window !== "undefined" && typeof window.ethereum !== "undefined"
    );
  },

  // Switch to correct network
  switchNetwork: async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${constants.CHAIN_ID.toString(16)}` }],
      });
      return true;
    } catch (switchError) {
      // Chain not added, try to add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${constants.CHAIN_ID.toString(16)}`,
                chainName: constants.CHAIN_NAME,
                nativeCurrency: {
  name: "POL",
  symbol: "POL",
  decimals: 18,
},

                rpcUrls: [constants.RPC_URL],
                blockExplorerUrls: [constants.EXPLORER_URL],
              },
            ],
          });
          return true;
        } catch (addError) {
          console.error("Failed to add network:", addError);
          return false;
        }
      }

      console.error("Failed to switch network:", switchError);
      return false;
    }
  },

  // Get explorer link
  getExplorerLink: (hash, type = "tx") => {
    return `${constants.EXPLORER_URL}/${type}/${hash}`;
  },
};

// ==================== ERROR HANDLER ====================

export const errorHandler = {
  // Parse error message
  parseError: (error) => {
    if (typeof error === "string") return error;

    if (error?.reason) return error.reason;
    if (error?.data?.message) return error.data.message;

    if (error?.message) {
      if (error.message.includes("user rejected"))
        return "Transaction rejected by user";
      if (error.message.includes("insufficient funds"))
        return "Insufficient funds for transaction";
      return error.message;
    }

    return "An unknown error occurred";
  },

  // Handle transaction error
  handleTransactionError: (error) => {
    const message = errorHandler.parseError(error);
    console.error("Transaction error:", message);
    return message;
  },

  // Handle contract error
  handleContractError: (error) => {
    const message = errorHandler.parseError(error);
    console.error("Contract error:", message);
    return message;
  },

  // Handle API error
  handleAPIError: (error) => {
    if (error.response) {
      return (
        error.response.data?.error ||
        error.response.data?.message ||
        "API request failed"
      );
    }
    if (error.request) {
      return "No response from server";
    }
    return error.message || "Request failed";
  },
};
