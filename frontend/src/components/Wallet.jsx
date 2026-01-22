import { Link } from 'react-router-dom';
import { useWeb3, useAuth } from '../hooks/Web3Hooks';
import { formatters } from '../utils/Utils';

// ==================== HEADER ====================

export const Header = () => {
  const { account, balance } = useWeb3();
  const { userRole, signOut } = useAuth();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl font-bold">R</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Relief Aid</span>
          </Link>

          {account && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Connected</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatters.formatAddress(account)}
                </div>
              </div>
              
              {userRole && (
                <span className="badge badge-info">{userRole}</span>
              )}
              
              <button onClick={signOut} className="btn-secondary text-sm">
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

  const getNavLinks = () => {
    switch (userRole) {
      case 'ADMIN':
        return [
          { to: '/admin', label: 'Dashboard' },
          { to: '/admin/beneficiaries', label: 'Beneficiaries' },
          { to: '/admin/merchants', label: 'Merchants' },
          { to: '/admin/distribute', label: 'Distribute' },
        ];
      case 'BENEFICIARY':
        return [
          { to: '/beneficiary', label: 'Dashboard' },
          { to: '/beneficiary/spend', label: 'Spend' },
          { to: '/beneficiary/history', label: 'History' },
        ];
      case 'MERCHANT':
        return [
          { to: '/merchant', label: 'Dashboard' },
          { to: '/merchant/payments', label: 'Payments' },
        ];
      default:
        return [
          { to: '/', label: 'Home' },
          { to: '/audit', label: 'Public Audit' },
        ];
    }
  };

  return (
    <nav className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8">
          {getNavLinks().map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="py-4 px-2 border-b-2 border-transparent hover:border-primary-600 text-gray-700 hover:text-gray-900 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

// ==================== FOOTER ====================

export const Footer = () => {
  return (
    <footer className="bg-gray-800 text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4">Relief Aid System</h3>
            <p className="text-gray-400 text-sm">
              Decentralized emergency relief distribution on Polygon Amoy
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/" className="hover:text-white">Home</Link></li>
              <li><Link to="/audit" className="hover:text-white">Public Audit</Link></li>
              <li><Link to="/about" className="hover:text-white">About</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Network</h4>
            <p className="text-sm text-gray-400">Polygon Amoy Testnet</p>
            <p className="text-sm text-gray-400">Chain ID: 80002</p>
          </div>
        </div>
        
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-sm text-gray-400">
          © 2026 Relief Aid System. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

// ==================== LOADING SPINNER ====================

export const LoadingSpinner = ({ size = 'md', text = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`${sizes[size]} border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin`}></div>
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  );
};

// ==================== ERROR BOUNDARY ====================

import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="card max-w-md w-full text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== MODAL ====================

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className={`inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle ${sizes[size]} w-full`}>
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== TRANSACTION STATUS ====================

export const TransactionStatus = ({ status, hash, error }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Transaction Pending...';
      case 'success':
        return 'Transaction Successful!';
      case 'error':
        return 'Transaction Failed';
      default:
        return 'Transaction Status';
    }
  };

  if (!status) return null;

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-2xl">{getStatusIcon()}</span>
        <span className="font-semibold">{getStatusText()}</span>
      </div>
      
      {hash && (
        <a
          href={`https://amoy.polygonscan.com/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline hover:no-underline"
        >
          View on Explorer
        </a>
      )}
      
      {error && (
        <p className="text-sm mt-2">{error}</p>
      )}
    </div>
  );
};