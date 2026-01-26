import { useEffect } from "react";
import {
  Navigate,
  useParams,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";

import { useWeb3, useAuth } from "../hooks/Web3Hooks";
import { ErrorBoundary, LoadingSpinner } from "../components/Common";
import { formatters } from "../utils/Utils";

import {
  AdminDashboard,
  BeneficiaryManagement,
  MerchantManagement,
  DistributeFunds,
  SetSpendingLimits,
} from "../components/Admin";

import {
  BeneficiaryDashboard,
  SpendFunds,
  BeneficiaryTransactionHistory,
} from "../components/Beneficiary";

import {
  MerchantDashboard,
  MerchantPayments,
  MerchantWithdraw,
} from "../components/Merchant";

import {
  LandingPage,
  AuditTrail,
} from "../components/Public";

// ==================== ADMIN PAGES ====================
export const AdminPage = () => {
  const { page = "" } = useParams(); // ✅ FIXED
  const { userRole, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner text="Checking authorization..." />;

  if (userRole !== "ADMIN") return <Navigate to="/unverified" replace />;

  const adminRoutes = {
    "": <AdminDashboard />,
    beneficiaries: <BeneficiaryManagement />,
    merchants: <MerchantManagement />,
    distribute: <DistributeFunds />,
    limits: <SetSpendingLimits />,
  };

  // ✅ FIXED: fallback should NOT redirect to /admin again
  const Component = adminRoutes[page] || <AdminDashboard />;

  return <ErrorBoundary>{Component}</ErrorBoundary>;
};

// ==================== BENEFICIARY PAGES ====================
export const BeneficiaryPage = () => {
  const { page = "" } = useParams(); // ✅ FIXED
  const { userRole, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner text="Checking authorization..." />;

  if (userRole !== "BENEFICIARY") return <Navigate to="/unverified" replace />;

  const beneficiaryRoutes = {
    "": <BeneficiaryDashboard />,
    spend: <SpendFunds />,
    history: <BeneficiaryTransactionHistory />,
  };

  const Component = beneficiaryRoutes[page] || <BeneficiaryDashboard />;

  return <ErrorBoundary>{Component}</ErrorBoundary>;
};

// ==================== MERCHANT PAGES ====================
export const MerchantPage = () => {
  const { page = "" } = useParams(); // ✅ FIXED
  const { userRole, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner text="Checking authorization..." />;

  if (userRole !== "MERCHANT") return <Navigate to="/unverified" replace />;

  const merchantRoutes = {
    "": <MerchantDashboard />,
    payments: <MerchantPayments />,
    withdraw: <MerchantWithdraw />,
  };

  const Component = merchantRoutes[page] || <MerchantDashboard />;

  return <ErrorBoundary>{Component}</ErrorBoundary>;
};

// ==================== PUBLIC PAGES ====================
export const PublicAudit = () => (
  <ErrorBoundary>
    <AuditTrail />
  </ErrorBoundary>
);

export const TransactionExplorerPage = () => (
  <ErrorBoundary>
    <TransactionExplorer />
  </ErrorBoundary>
);

export const AboutPageComponent = () => (
  <ErrorBoundary>
    <AboutPage />
  </ErrorBoundary>
);

// ==================== HOME PAGE ====================
export const Home = () => <LandingPage />;

// ==================== LOGIN PAGE ====================

export const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { account, isCorrectNetwork, switchToCorrectNetwork } = useWeb3();
  const { isAuthenticated, userRole, signIn, isLoading } = useAuth();

  // Auto redirect
  useEffect(() => {
    if (isAuthenticated && userRole && !isLoading) {
      const redirectTo =
        location.state?.from?.pathname ||
        (userRole === "ADMIN"
          ? "/admin"
          : userRole === "BENEFICIARY"
          ? "/beneficiary"
          : userRole === "MERCHANT"
          ? "/merchant"
          : "/unverified");

      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, userRole, isLoading, navigate, location]);

  const handleConnect = async () => {
    try {
      if (!window.ethereum) {
        window.open("https://metamask.io/download/", "_blank");
        return;
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });

      if (!isCorrectNetwork) {
        await switchToCorrectNetwork();
      }

      const role = await signIn();

      if (role === "ADMIN") navigate("/admin", { replace: true });
      else if (role === "BENEFICIARY") navigate("/beneficiary", { replace: true });
      else if (role === "MERCHANT") navigate("/merchant", { replace: true });
      else navigate("/unverified", { replace: true });
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  if (isLoading) return <LoadingSpinner text="Checking wallet..." />;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0B0F14] text-white
flex items-center justify-center relative overflow-hidden px-4">


      {/* Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

  <div className="relative w-full max-w-md
rounded-2xl p-8
flex flex-col items-center text-center">



        <div className="text-center mb-8">
          

          <h1 className="text-3xl font-bold font-mono">Relief Aid</h1>
          <p className="text-gray-400 mt-1">
            Connect your wallet to continue
          </p>
        </div>

        {!isCorrectNetwork && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-3 rounded-xl mb-6 text-sm">
            Please switch to <strong>Polygon Amoy Testnet (80002)</strong>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="w-full py-3 rounded-xl font-semibold text-white
          bg-gradient-to-r from-cyan-500 to-emerald-500
          hover:from-cyan-400 hover:to-emerald-400
          transition-all duration-300 shadow-lg
          flex items-center justify-center gap-2"
        >
          <span>🦊</span>
          <span className="font-mono">{account ? "Sign In" : "Connect MetaMask"}</span>
        </button>

        <div className="mt-6 text-center text-sm text-gray-400">
          Don’t have MetaMask?{" "}
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            Download here
          </a>
        </div>
      </div>
    </div>
  );
};



// ==================== UNVERIFIED PAGE ====================

export const Unverified = () => {
  const { account } = useWeb3();
  const { userRole, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return <LoadingSpinner text="Loading..." />;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center relative overflow-hidden px-4">

      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative w-full max-w-md bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-8 text-center">

        <div className="text-6xl mb-4">🔐</div>

        <h1 className="text-3xl font-bold mb-3">
          {userRole ? "Access Denied" : "Wallet Not Registered"}
        </h1>

        <p className="text-gray-400 mb-6">
          Wallet:{" "}
          <span className="font-mono text-cyan-400">
            {formatters.formatAddress(account)}
          </span>
        </p>

        <button
          onClick={() => navigate("/")}
          className="w-full py-3 rounded-xl font-semibold text-white
          bg-gradient-to-r from-cyan-500 to-emerald-500
          hover:from-cyan-400 hover:to-emerald-400 transition-all"
        >
          Back to Home
        </button>

        {!userRole && (
          <Link
            to="/audit"
            className="block mt-3 w-full py-3 rounded-xl font-semibold
            bg-gray-800 border border-gray-700 text-gray-300 hover:border-cyan-500/50"
          >
            View Public Audit
          </Link>
        )}
      </div>
    </div>
  );
};



// ==================== NOT FOUND PAGE ====================

export const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center relative overflow-hidden px-4">

      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
          `,
          backgroundSize: "45px 45px",
        }}
      />

      <div className="relative text-center">

        <div className="text-8xl font-bold text-cyan-400 mb-4">404</div>

        <h1 className="text-3xl font-bold mb-3">Page Not Found</h1>

        <p className="text-gray-400 mb-6">
          The page you're looking for doesn't exist.
        </p>

        <button
          onClick={() => navigate("/")}
          className="px-8 py-3 rounded-xl font-semibold text-white
          bg-gradient-to-r from-cyan-500 to-emerald-500
          hover:from-cyan-400 hover:to-emerald-400 transition-all"
        >
          Go Home
        </button>

      </div>
    </div>
  );
};


// ==================== DEFAULT EXPORT ====================
export default {
  Home,
  Login,
  AdminPage,
  BeneficiaryPage,
  MerchantPage,
  PublicAudit,
  Unverified,
  NotFound,
  TransactionExplorerPage,
  AboutPageComponent,
};
