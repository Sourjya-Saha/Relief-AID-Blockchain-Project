import { Component , useEffect} from "react";
import { Link, useLocation } from "react-router-dom";
import { useWeb3, useAuth } from "../hooks/Web3Hooks";
import { formatters, constants } from "../utils/Utils";
import { useSnackbar } from "./Snackbar";
import { parseTxError } from "../utils/txErrors";

// ==================== HEADER ====================
export const Header = () => {
  const { account, disconnect } = useWeb3();
  const { userRole, signOut } = useAuth();

  const handleDisconnect = () => {
    signOut();
    disconnect();
  };

  return (
    <header className="bg-[#0B0F14] border-b border-gray-800/50 sticky top-0 z-50 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex justify-between items-center gap-4">
          <Link to="/" className="flex items-center space-x-2 sm:space-x-3 group flex-shrink-0">
            <span className="text-lg sm:text-2xl font-mono font-bold text-white">ReliefAID</span>
          </Link>

          {account && (
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Desktop: Full info */}
              <div className="hidden md:block text-right">
                <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">
                  Connected
                </div>
                <div className="text-sm font-mono text-cyan-400">
                  {formatters.formatAddress(account)}
                </div>
              </div>

              {/* Mobile: Just address */}
              <div className="md:hidden text-right">
                <div className="text-xs sm:text-sm font-mono text-cyan-400">
                  {formatters.formatAddress(account)}
                </div>
              </div>

              {userRole && (
                <span className="px-2 sm:px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                  {userRole}
                </span>
              )}

              <button
                onClick={handleDisconnect}
                className="px-3 sm:px-4 py-2 rounded-lg border border-gray-700 hover:border-cyan-500/50 text-xs sm:text-sm font-semibold transition-all duration-300 hover:bg-cyan-500/5 text-white whitespace-nowrap font-mono"
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
  const location = useLocation();

  const getNavLinks = () => {
    if (!userRole || userRole === null || userRole === undefined) {
      return [
        { to: "/", label: "Home" },
        { to: "/audit", label: "Public Audit" },
      ];
    }

    switch (userRole) {
      case "ADMIN":
        return [
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/beneficiaries", label: "Beneficiaries" },
          { to: "/admin/merchants", label: "Merchants" },
          { to: "/admin/distribute", label: "Distribute" },
        ];
      case "BENEFICIARY":
        return [
          { to: "/beneficiary", label: "Dashboard" },
          { to: "/beneficiary/spend", label: "Spend" },
          { to: "/beneficiary/history", label: "History" },
        ];
      case "MERCHANT":
        return [
          { to: "/merchant", label: "Dashboard" },
          { to: "/merchant/payments", label: "Payments" },
        ];
      default:
        return [
          { to: "/", label: "Home" },
          { to: "/audit", label: "Public Audit" },
        ];
    }
  };

  const navLinks = getNavLinks();

  if (!navLinks || navLinks.length === 0) {
    return null;
  }

  return (
    <nav className="bg-[#0B0F14] border-b border-gray-800/50 overflow-x-auto font-mono">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-4 sm:space-x-8 min-w-max">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`py-3 sm:py-4 px-2 border-b-2 text-sm sm:text-base whitespace-nowrap ${
                  isActive 
                    ? "border-cyan-500 text-white" 
                    : "border-transparent text-gray-400"
                } hover:border-cyan-500 hover:text-white transition-all duration-300 font-medium`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

// ==================== FOOTER ====================
export const Footer = () => {
  return (
    <footer className="bg-[#0B0F14] border-t border-gray-800/50 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <h3 className="text-base sm:text-xl font-bold text-white font-mono">ReliefAID</h3>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">
              Relief infrastructure for the real world. Transparent, verifiable,
              on-chain.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-white uppercase tracking-wider text-xs sm:text-sm">
              Protocol
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link to="/" className="hover:text-cyan-400 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/audit" className="hover:text-cyan-400 transition-colors">
                  Public Audit
                </Link>
              </li>
            </ul>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <h4 className="font-semibold mb-4 text-white uppercase tracking-wider text-xs sm:text-sm">
              Network
            </h4>
            <p className="text-xs sm:text-sm mb-1 font-mono">Polygon Amoy Testnet</p>
            <p className="text-xs sm:text-sm font-mono text-cyan-400">Chain ID: 80002</p>
            <div className="mt-4">
              <a
                href="https://amoy.polygonscan.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm hover:text-cyan-400 transition-colors inline-flex items-center gap-1"
              >
                Block Explorer →
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800/50 mt-6 sm:mt-8 pt-6 sm:pt-8 text-center text-xs sm:text-sm">
          <p>© 2026 ReliefAID Protocol. Immutable by design.</p>
        </div>
      </div>
    </footer>
  );
};

// ==================== LOADING SPINNER ====================
export const LoadingSpinner = ({ size = "md", text = "" }) => {
  const sizes = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 sm:w-8 sm:h-8 border-2 sm:border-3",
    lg: "w-10 h-10 sm:w-12 sm:h-12 border-3 sm:border-4",
    xl: "w-12 h-12 sm:w-16 sm:h-16 border-3 sm:border-4",
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8">
      <div className="relative">
        <div
          className={`${sizes[size]} border-gray-800 border-t-cyan-500 rounded-full animate-spin`}
        ></div>
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-50"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)",
          }}
        ></div>
      </div>
      {text && <p className="mt-4 text-gray-400 font-mono text-xs sm:text-sm text-center px-4">{text}</p>}
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
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0F14] p-4">
          <div className="max-w-md w-full bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <span className="text-2xl sm:text-3xl text-red-400">⚠</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
              System Error
            </h2>
            <p className="text-sm sm:text-base text-gray-400 mb-6 font-mono break-words">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-xl font-semibold hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 text-sm sm:text-base"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== MODAL ====================
export const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        ></div>

        <div
          className={`inline-block align-bottom bg-gray-900 border border-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle ${sizes[size]} w-full mx-4`}
        >
          <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6 md:p-8">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-bold text-white">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <span className="text-2xl sm:text-3xl leading-none">&times;</span>
              </button>
            </div>
            <div className="text-gray-300 text-sm sm:text-base">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== TRANSACTION STATUS ====================
export const TransactionStatus = ({ status, hash, error, onClear }) => {
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    if (status === "success")
      showSnackbar("Transaction confirmed on-chain", "success");

    if (status === "error")
      showSnackbar(parseTxError(error), "error");
  }, [status]);

  if (!status) return null;

  const config = {
    pending: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-400",
      icon: "⏳",
      label: "Waiting for confirmation...",
    },
    success: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      icon: "✓",
      label: "Transaction Confirmed",
    },
    error: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      icon: "✕",
      label: "Transaction Failed",
    },
  }[status];

  return (
    <div
      className={`${config.bg} border ${config.border} rounded-xl p-4 backdrop-blur`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg border ${config.border} flex items-center justify-center`}
          >
            <span className={`${config.text} text-lg`}>
              {config.icon}
            </span>
          </div>

          <span className={`font-mono ${config.text}`}>
            {config.label}
          </span>
        </div>

        {onClear && (
          <button
            onClick={onClear}
            className="text-gray-500 hover:text-white transition"
          >
            ✕
          </button>
        )}
      </div>

      {hash && (
        <a
          href={`${constants.EXPLORER_URL}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-sm text-cyan-400 hover:underline font-mono"
        >
          View on Explorer →
        </a>
      )}
    </div>
  );
};