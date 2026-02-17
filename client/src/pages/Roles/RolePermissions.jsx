// src/pages/Roles/RolePermissions.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './RolePermissions.css';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const RolePermissions = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  
  const { id } = useParams();
  const navigate = useNavigate();
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

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
    Settings: "menu.settings",
    CreateCustomerRequest: "menu.customer.requests.create",
    MyCustomerRequests: "menu.customer.requests.my",
    CashWallet: "menu.CashWallet",  
    ChequeWallet: "menu.ChequeWallet",  
    WalletMoney: "menu.wallet.money",  
  };

  const fetchRole = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/roles/getrole/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRole(response.data);
      setSelectedPermissions(response.data.permissions || []);
    } catch (err) {
      console.error(err);
      alert("Failed to load role");
      navigate('/roles');
    } finally {
      setLoading(false);
    }
  }, [id, backendUrl, navigate]);

  useEffect(() => {
    fetchCurrentUser();
    if (id) {
      fetchRole();
    }
  }, [id, fetchCurrentUser, fetchRole]);

  const handleMenuToggle = (permission) => {
    setSelectedPermissions(prev => 
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSave = async () => {
    if (!window.confirm("Save changes to role permissions?")) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${backendUrl}/api/roles/updatepermissions/${id}`,
        { permissions: selectedPermissions },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Permissions updated successfully!");
      navigate('/roles');
    } catch (err) {
      alert("Failed to save permissions");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return (
    <div className="role-permissions-layout">
      <div className="loading">Loading...</div>
    </div>
  );

  if (!role) return (
    <div className="role-permissions-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <div className="error">Role not found</div>
    </div>
  );

  return (
    <div className="role-permissions-layout">
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
        <div className="role-permissions-container">
          <h1>Manage Permissions for: {role.name}</h1>

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
              className="save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Permissions'}
            </button>
            <button 
              className="cancel-btn" 
              onClick={() => navigate('/roles')}
            >
              Cancel
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RolePermissions;