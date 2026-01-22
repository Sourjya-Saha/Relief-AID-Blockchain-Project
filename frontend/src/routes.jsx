import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/Web3Hooks";
import { Header, Footer, Navbar, LoadingSpinner } from "./components/Common";

import {
  Home,
  Login,
  AdminPage,
  BeneficiaryPage,
  MerchantPage,
  PublicAudit,
  Unverified,
  NotFound,
} from "./pages/Pages";

// ==================== PROTECTED ROUTE ====================
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, userRole, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner text="Checking auth..." />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unverified" replace />;
  }

  return children;
};

// ==================== APP ROUTES ====================
export default function AppRoutes() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <Navbar />

      <main className="flex-grow">
        <Routes>
          {/* PUBLIC */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/audit" element={<PublicAudit />} />

          {/* ADMIN */}
          <Route
            path="/admin/:page?"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* BENEFICIARY */}
          <Route
            path="/beneficiary/:page?"
            element={
              <ProtectedRoute allowedRoles={["BENEFICIARY"]}>
                <BeneficiaryPage />
              </ProtectedRoute>
            }
          />

          {/* MERCHANT */}
          <Route
            path="/merchant/:page?"
            element={
              <ProtectedRoute allowedRoles={["MERCHANT"]}>
                <MerchantPage />
              </ProtectedRoute>
            }
          />

          {/* UNVERIFIED */}
          <Route
            path="/unverified"
            element={
              <ProtectedRoute>
                <Unverified />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
