import { ethers } from "ethers";
import axios from "axios";
import { constants, errorHandler } from "../utils/Utils";

// ==================== WEB3 SERVICE ====================

export const web3Service = {
  // ✅ Provider (MetaMask)
  getProvider: () => {
    if (!window.ethereum) throw new Error("MetaMask not installed");
    return new ethers.BrowserProvider(window.ethereum);
  },

  // ✅ Signer (MetaMask Account)
  getSigner: async () => {
    const provider = web3Service.getProvider();
    const signer = await provider.getSigner();

    // ensures unlocked signer
    await signer.getAddress();
    return signer;
  },

  // ✅ always triggers MetaMask popup
  requestAccounts: async () => {
    if (!window.ethereum) throw new Error("MetaMask not installed");

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No MetaMask account selected");
    }

    return accounts;
  },

  // ✅ Get selected account
  getAccount: async () => {
    const accounts = await web3Service.requestAccounts();
    return accounts[0];
  },

getAccountsSilent: async () => {
  if (!window.ethereum) return [];
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts || [];
},


  // ✅ Wallet balance
  getBalance: async (address) => {
    const provider = web3Service.getProvider();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  },

  // ✅ Chain ID
  getChainId: async () => {
    const provider = web3Service.getProvider();
    const network = await provider.getNetwork();
    return Number(network.chainId);
  },

  // ✅ Correct network?
  isCorrectNetwork: async () => {
    const chainId = await web3Service.getChainId();
    return chainId === constants.CHAIN_ID;
  },

  // ✅ Frontend disconnect
  disconnectWallet: () => {
    try {
      localStorage.removeItem("walletAddress");
      localStorage.removeItem("userRole");
      localStorage.removeItem("theme");
    } catch (e) {
      console.warn("disconnectWallet cleanup failed:", e);
    }
  },
};

// ==================== CONTRACT SERVICE ====================

export const contractService = {
  // ✅ Write contract using signer
  getContract: async (address, abi) => {
    if (!address) throw new Error("Contract address missing");
    if (!abi) throw new Error("Contract ABI missing");

    const signer = await web3Service.getSigner();
    return new ethers.Contract(address, abi, signer);
  },

  // ✅ ReliefUSD
  getReliefUSD: async (abi) => {
    return await contractService.getContract(constants.RELIEF_USD_ADDRESS, abi);
  },

  // ✅ ReliefManager
  getReliefManager: async (abi) => {
    return await contractService.getContract(
      constants.RELIEF_MANAGER_ADDRESS,
      abi
    );
  },

  // ✅ DonationTreasury
  getDonationTreasury: async (abi) => {
    return await contractService.getContract(
      constants.DONATION_TREASURY_ADDRESS,
      abi
    );
  },

  // ✅ Wait tx confirmation
  waitForTransaction: async (tx) => {
    console.log("✅ Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed:", receipt);
    return receipt;
  },
};

// ==================== AXIOS BACKEND CLIENT ====================

const apiClient = axios.create({
  baseURL: constants.BACKEND_URL,
  withCredentials: true,
});

// ==================== IPFS SERVICE ====================

export const ipfsService = {
  // ==================== BENEFICIARY ====================

  uploadBeneficiaryProfile: async (profileData) => {
    try {
      const res = await apiClient.post(
        "/api/beneficiary/upload-profile",
        profileData
      );
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  uploadBeneficiaryBatch: async (profiles) => {
    try {
      const res = await apiClient.post(
        "/api/beneficiary/upload-profiles-batch",
        { profiles }
      );
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  // ==================== MERCHANT ====================

  uploadMerchantProfile: async (profileData) => {
    try {
      const res = await apiClient.post(
        "/api/merchant/upload-profile",
        profileData
      );
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  uploadMerchantBatch: async (profiles) => {
    try {
      const res = await apiClient.post(
        "/api/merchant/upload-profiles-batch",
        { profiles }
      );
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  // ==================== DOCUMENT UPLOAD ====================

  uploadDocument: async (file, documentType, walletAddress, description = "") => {
    try {
      const formData = new FormData();
      formData.append("document", file);
      formData.append("documentType", documentType);
      formData.append("walletAddress", walletAddress);
      formData.append("description", description);

      const res = await apiClient.post("/api/upload-document", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  // ==================== PROFILE ====================

  fetchProfile: async (cid) => {
    try {
      const res = await apiClient.get(`/api/profile/${cid}`);
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  updateProfile: async (oldCID, updatedData, profileType) => {
    try {
      const res = await apiClient.put("/api/profile/update", {
        oldCID,
        updatedData,
        profileType,
      });

      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  // ==================== REDEMPTION (OFF-CHAIN INR) ====================

  /**
   * ✅ Merchant submits INR redemption request
   * backend stores JSON in IPFS
   * POST /api/redemption/request
   */
  uploadRedemptionRequest: async ({
    merchantWallet,
    rusdAmount,
    inrAmount,
    upiId,
    upiLink,
    note,
  }) => {
    try {
      const payload = {
        merchantWallet,
        rusdAmount,
        inrAmount,
        upiId: upiId || "",
        upiLink: upiLink || "",
        note: note || "",
      };

      const res = await apiClient.post("/api/redemption/request", payload);
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  /**
   * ✅ Admin uploads proof file screenshot / receipt
   * backend stores proof file in IPFS
   * POST /api/redemption/proof
   */
  uploadRedemptionProof: async (file, requestId, merchantWallet) => {
    try {
      if (!file) throw new Error("Proof file missing");

      const formData = new FormData();
      formData.append("proof", file);
      formData.append("requestId", requestId || "");
      formData.append("merchantWallet", merchantWallet || "");

      const res = await apiClient.post("/api/redemption/proof", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },
};

// ==================== API SERVICE ====================

export const apiService = {
  healthCheck: async () => {
    try {
      const res = await apiClient.get("/api/health");
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  testPinata: async () => {
    try {
      const res = await apiClient.get("/api/test-pinata");
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  categoryToEnum: async (category) => {
    try {
      const res = await apiClient.get(`/api/category/to-enum/${category}`);
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  enumToCategory: async (enumValue) => {
    try {
      const res = await apiClient.get(`/api/category/to-string/${enumValue}`);
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },

  categoryMappings: async () => {
    try {
      const res = await apiClient.get("/api/category/mappings");
      return res.data;
    } catch (error) {
      throw new Error(errorHandler.handleAPIError(error));
    }
  },
};

// ==================== AUTH SERVICE ====================

export const authService = {
  signMessage: async (message) => {
    try {
      const signer = await web3Service.getSigner();
      const signature = await signer.signMessage(message);
      return signature;
    } catch {
      throw new Error("Failed to sign message");
    }
  },

  verifySignature: (message, signature, address) => {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  },

  generateNonce: () => Math.floor(Math.random() * 1000000),
};

// ==================== STORAGE SERVICE ====================

export const storageService = {
  save: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
      return false;
    }
  },

  load: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
      return null;
    }
  },

  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Failed to remove from localStorage:", error);
      return false;
    }
  },

  clear: () => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error("Failed to clear localStorage:", error);
      return false;
    }
  },

  saveWallet: (address) => storageService.save("walletAddress", address),
  loadWallet: () => storageService.load("walletAddress"),

  saveRole: (role) => storageService.save("userRole", role),
  loadRole: () => storageService.load("userRole"),
};
