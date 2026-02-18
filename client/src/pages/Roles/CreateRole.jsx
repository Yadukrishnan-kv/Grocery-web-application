// src/pages/Roles/CreateRole.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './CreateRole.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const CreateRole = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  
  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  // Fetch current user for header
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  // Individual menu permissions (not grouped)
  const MENU_PERMISSIONS = {
    Dashboard: "menu.dashboard",
    Users: "menu.users",
    Products: "menu.products", 
    Customers: "menu.customers",
    Sales: "menu.sales",
    Deliveries: "menu.deliveries",
    CustomerOrders: "menu.customer.orders",
    CustomerOrderReports: "menu.customer.order.reports",
    CustomerBillStatement: "menu.customer.bill.statement",
    CustomerCreditLimit: "menu.customer.credit.limit",
    CreateCustomerRequest: "menu.customer.requests.create",
    MyCustomerRequests: "menu.customer.requests.my",
    Settings: "menu.settings",
    CashWallet: "menu.CashWallet",  
    ChequeWallet: "menu.ChequeWallet",  
    WalletMoney: "menu.wallet.money",
    paymentRequestsdelivery: "menu.paymentRequestsdelivery",
    paymentRequestssales: "menu.paymentRequestssales",



  };

  const handleMenuToggle = (menuPermission) => {
    setSelectedPermissions(prev => 
      prev.includes(menuPermission)
        ? prev.filter(p => p !== menuPermission)
        : [...prev, menuPermission]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${backendUrl}/api/roles/createRole`, {
        name: roleName,
        permissions: selectedPermissions
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      navigate('/roles');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="create-role-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem="RolePermission" 
        onSetActiveItem={() => {}} 
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="create-role-container">
          <h1>Create New Role</h1>
          
          {error && <div className="error-banner">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="roleName">Role Name</label>
              <input
                id="roleName"
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                required
                
              />
            </div>

            <div className="permissions-section">
              <h2>Menu Permissions</h2>
              <p className="permission-instruction">
                Select menus to grant access to specific features.
              </p>
              {Object.entries(MENU_PERMISSIONS).map(([menuName, permission]) => (
                <div key={menuName} className="permission-group">
                  <label className="menu-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission)}
                      onChange={() => handleMenuToggle(permission)}
                    />
                    <span className="menu-name">{menuName}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                disabled={loading || !roleName.trim()}
                className="submit-button"
              >
                {loading ? 'Creating...' : 'Create Role'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/roles')}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateRole;