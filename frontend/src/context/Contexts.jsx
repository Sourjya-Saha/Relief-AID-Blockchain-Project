import { createContext, useState, useEffect, useContext } from "react";
import { ethers } from "ethers";

import { web3Service, authService, storageService } from "../services/Services";
import { constants, helpers } from "../utils/Utils";

import addresses from "../contracts/addresses.json";
import ReliefManager from "../contracts/ReliefManager.json";

// ==================== WEB3 CONTEXT ====================

export const Web3Context = createContext();

export const Web3Provider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);

  // ------------------------------
  // ✅ helper to update state
  // ------------------------------
  const updateState = async (address) => {
    const web3Provider = web3Service.getProvider();
    const network = await web3Provider.getNetwork();

    const web3Signer = await web3Provider.getSigner();
    const web3Balance = await web3Provider.getBalance(address);

    setProvider(web3Provider);
    setSigner(web3Signer);
    setAccount(address);
    setChainId(Number(network.chainId));
    setBalance(ethers.formatEther(web3Balance));
    setIsCorrectNetwork(Number(network.chainId) === constants.CHAIN_ID);

    storageService.saveWallet(address);
  };

  // ✅ NEW: silent accounts fetch (NO popup)
  const getAccountsSilent = async () => {
    if (!helpers.isMetaMaskInstalled()) return [];
    try {
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      return accounts || [];
    } catch {
      return [];
    }
  };

  // ------------------------------
  // ✅ CONNECT WALLET (popup)
  // ------------------------------
  const connectWallet = async () => {
    try {
      setLoading(true);

      if (!helpers.isMetaMaskInstalled()) {
        throw new Error("MetaMask not installed");
      }

      // ✅ triggers MetaMask popup
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No MetaMask account selected");
      }

      const selectedAccount = accounts[0];

      await updateState(selectedAccount);
      return selectedAccount;
    } catch (error) {
      console.error("Connect wallet error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------
  // ✅ INIT WEB3 (silent - no popup)
  // ------------------------------
  const initWeb3 = async () => {
    try {
      setLoading(true);

      if (!helpers.isMetaMaskInstalled()) return null;

      const accounts = await getAccountsSilent();
      if (!accounts || accounts.length === 0) return null;

      const selectedAccount = accounts[0];
      await updateState(selectedAccount);
      return selectedAccount;
    } catch (error) {
      console.warn("Silent initWeb3 failed:", error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------
  // ✅ DISCONNECT
  // ------------------------------
  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setBalance("0");
    setIsCorrectNetwork(false);

    storageService.remove("walletAddress");
    storageService.remove("userRole");
  };

  // ------------------------------
  // ✅ SWITCH NETWORK (and refresh state)
  // ------------------------------
  const switchToCorrectNetwork = async () => {
    const ok = await helpers.switchNetwork();
    if (ok) {
      await initWeb3(); // ✅ refresh provider/signer/chain/account silently
    }
    return ok;
  };

  // ------------------------------
  // ✅ Auto restore wallet on refresh
  // ------------------------------
  useEffect(() => {
    initWeb3();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------
  // ✅ Listen for wallet changes
  // ------------------------------
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnect();
        return;
      }

      const selectedAccount = accounts[0];
      await updateState(selectedAccount);
    };

    const handleChainChanged = async () => {
      // refresh state (no reload required)
      await initWeb3();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    provider,
    signer,
    account,
    chainId,
    isCorrectNetwork,
    balance,
    loading,
    connectWallet,
    initWeb3,
    disconnect,
    switchToCorrectNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};

// ==================== AUTH CONTEXT ====================

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { account, connectWallet } = useContext(Web3Context);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(false);

  // ✅ Sign in with wallet
  const signIn = async () => {
    try {
      setLoading(true);

      // ✅ popup only happens when calling login
      const address = await connectWallet();

      const message = helpers.generateLoginMessage(address);
      const signature = await authService.signMessage(message);

      const isValid = authService.verifySignature(message, signature, address);
      if (!isValid) throw new Error("Invalid signature");

      // ✅ Get ReliefManager address
      const chainKey = String(constants.CHAIN_ID);
      const contractAddress = addresses?.[chainKey]?.ReliefManager;

      if (!contractAddress) {
        throw new Error(
          "ReliefManager address missing in addresses.json for chain 80002"
        );
      }

      // ✅ read provider
      const provider = web3Service.getProvider();
      const contract = new ethers.Contract(
        contractAddress,
        ReliefManager.abi,
        provider
      );

      const roles = await contract.getUserRole(address);

      let role = null;
      if (roles[0]) role = "ADMIN";
      else if (roles[1]) role = "BENEFICIARY";
      else if (roles[2]) role = "MERCHANT";

      setIsAuthenticated(true);
      updateUserRole(role);

      return role;
    } catch (error) {
      console.error("Sign in error:", error);
      setIsAuthenticated(false);
      setUserRole(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = () => {
    setIsAuthenticated(false);
    setUserRole(null);
    storageService.remove("userRole");
  };

  // Update user role
  const updateUserRole = (role) => {
    setUserRole(role);
    storageService.saveRole(role);
  };

  // ✅ Restore auth state after refresh
  useEffect(() => {
    const savedWallet = storageService.loadWallet();
    const savedRole = storageService.loadRole();

    if (
      savedWallet &&
      account &&
      savedWallet.toLowerCase() === account.toLowerCase()
    ) {
      setIsAuthenticated(true);
      if (savedRole) setUserRole(savedRole);
    } else {
      // if wallet changed → reset auth
      setIsAuthenticated(false);
      setUserRole(null);
      storageService.remove("userRole");
    }
  }, [account]);

  const value = {
    isAuthenticated,
    userRole,
    loading,
    signIn,
    signOut,
    updateUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ==================== CONTRACT CONTEXT ====================

export const ContractContext = createContext();

export const ContractProvider = ({ children }) => {
  const [reliefUSDContract, setReliefUSDContract] = useState(null);
  const [reliefManagerContract, setReliefManagerContract] = useState(null);
  const [loading, setLoading] = useState(false);

  const value = {
    reliefUSDContract,
    reliefManagerContract,
    setReliefUSDContract,
    setReliefManagerContract,
    loading,
    setLoading,
  };

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
};

// ==================== THEME CONTEXT ====================

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState("light");

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    storageService.save("theme", newTheme);
  };

  useEffect(() => {
    const savedTheme = storageService.load("theme");
    if (savedTheme) setTheme(savedTheme);
  }, []);

  const value = { theme, toggleTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
