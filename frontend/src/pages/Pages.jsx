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

  // ✅ Auto redirect if already logged in
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
      alert("MetaMask not installed");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    // ✅ 1) Always trigger MetaMask popup if wallet not connected
    await window.ethereum.request({ method: "eth_requestAccounts" });

    // ✅ 2) If wrong network → switch to polygon amoy
    if (!isCorrectNetwork) {
      await switchToCorrectNetwork();
    }

    // ✅ 3) Now sign-in (this will open signature popup)
    const role = await signIn();

    // ✅ 4) Redirect based on role
    if (role === "ADMIN") navigate("/admin", { replace: true });
    else if (role === "BENEFICIARY") navigate("/beneficiary", { replace: true });
    else if (role === "MERCHANT") navigate("/merchant", { replace: true });
    else navigate("/unverified", { replace: true });

  } catch (error) {
    console.error("Login failed:", error);
  }
};


  if (isLoading) return <LoadingSpinner text="Checking wallet..." />;

  if (account && isAuthenticated && userRole) {
    return <LoadingSpinner text="Redirecting..." />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 py-12 px-4">
      <div className="max-w-md w-full card">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-white font-bold">R</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Relief Aid
          </h1>
          <p className="text-gray-600">Connect your wallet to continue</p>
        </div>

        {!isCorrectNetwork && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6">
            Please switch to{" "}
            <strong>Polygon Amoy Testnet (Chain ID: 80002)</strong>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="btn-primary w-full flex items-center justify-center space-x-3 py-4 text-lg"
        >
          <span>🦊</span>
          <span>{account ? "Sign In" : "Connect MetaMask"}</span>
        </button>

        <div className="mt-8 text-center space-y-2">
          <p className="text-sm text-gray-600">
            Don't have MetaMask?{" "}
            <a
              href="https://metamask.io/download/"
              target="_blank"
              className="text-primary-600 hover:underline"
              rel="noopener noreferrer"
            >
              Download here
            </a>
          </p>
          <p className="text-xs text-gray-500">
            Network: Polygon Amoy Testnet (80002)
          </p>
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full text-center card">
        <div className="text-6xl mb-6">🔐</div>

        {userRole ? (
          <>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Access Denied
            </h1>
            <p className="text-gray-600 mb-8">
              Your wallet <strong>{formatters.formatAddress(account)}</strong>{" "}
              is not authorized for any dashboard.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Wallet Not Registered
            </h1>
            <p className="text-gray-600 mb-8">
              Your wallet <strong>{formatters.formatAddress(account)}</strong>{" "}
              has not been registered as a beneficiary, merchant, or admin.
            </p>
          </>
        )}

        <div className="space-y-3">
          <button
            onClick={() => navigate("/")}
            className="btn-primary w-full py-3 text-lg"
          >
            Back to Home
          </button>

          {!userRole && (
            <Link
              to="/audit"
              className="block btn-secondary w-full py-3 text-lg text-center"
            >
              View Public Audit
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== NOT FOUND ====================
export const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-8xl mb-8">404</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Page Not Found
        </h1>
        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist.
        </p>

        <button
          onClick={() => navigate("/")}
          className="btn-primary w-full py-3 text-lg"
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
