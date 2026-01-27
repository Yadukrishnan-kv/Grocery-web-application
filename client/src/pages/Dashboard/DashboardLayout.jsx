import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  // Admin/Salesman stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);

  // Customer-specific stats
  const [customerTotalOrders, setCustomerTotalOrders] = useState(0);
  const [customerDeliveredOrders, setCustomerDeliveredOrders] = useState(0);
  const [creditLimit, setCreditLimit] = useState(0);
  const [usedCredit, setUsedCredit] = useState(0);

  // Delivery-specific stats
  const [assignedOrders, setAssignedOrders] = useState(0);
  const [acceptedOrders, setAcceptedOrders] = useState(0);
  const [deliveredOrders, setDeliveredOrders] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  const fetchAdminSalesmanStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [usersRes, ordersRes, productsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/users/getAllUsers`, config),
        axios.get(`${backendUrl}/api/orders/getallorders`, config),
        axios.get(`${backendUrl}/api/products/getallproducts`, config),
      ]);

      const nonAdminUsers = usersRes.data.filter(
        u => !['admin', 'superadmin'].includes(u.role?.toLowerCase())
      );
      setTotalUsers(nonAdminUsers.length || 0);

      const orders = ordersRes.data || [];
      setTotalOrders(orders.length);
      const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      setRevenue(totalRevenue);

      setTotalProducts(productsRes.data.length || 0);
    } catch (error) {
      console.error('Admin/Salesman stats error:', error);
      setStatsError('Failed to load statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  const fetchCustomerStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      // Get logged-in customer's profile (personalized)
      const profileRes = await axios.get(`${backendUrl}/api/customers/my-profile`, config);
      const customer = profileRes.data;

      if (!customer) {
        setStatsError('Your customer profile not found - contact admin');
        setCustomerTotalOrders(0);
        setCustomerDeliveredOrders(0);
        setCreditLimit(0);
        setUsedCredit(0);
        return;
      }

      setCreditLimit(customer.creditLimit || 0);
      // Used credit = total credit - remaining balance (adjust field names if different)
      setUsedCredit((customer.creditLimit || 0) - (customer.balanceCreditLimit || 0));

      // Get customer's orders
      const ordersRes = await axios.get(`${backendUrl}/api/orders/my-orders`, config);
      const myOrders = ordersRes.data || [];

      setCustomerTotalOrders(myOrders.length);
      setCustomerDeliveredOrders(myOrders.filter(o => o.status?.toLowerCase() === 'delivered').length);

    } catch (error) {
      console.error('Customer stats error:', error);
      setStatsError(error.response?.data?.message || 'Failed to load your statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  const fetchDeliveryManStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const ordersRes = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, config);
      const myOrders = ordersRes.data || [];

      setAssignedOrders(myOrders.length);
      setAcceptedOrders(myOrders.filter(o => o.assignmentStatus?.toLowerCase() === 'accepted').length);
      setDeliveredOrders(myOrders.filter(o => o.status?.toLowerCase() === 'delivered').length);
      setPendingOrders(myOrders.filter(o => o.status?.toLowerCase() === 'pending').length);

    } catch (error) {
      console.error('Delivery stats error:', error);
      setStatsError('Failed to load delivery statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!user?.role) return;

    setStatsLoading(true);
    setStatsError(null);

    const role = user.role.toLowerCase().trim();

    if (role.includes('admin')) {
      fetchAdminSalesmanStats();
    } else if (role.includes('sales')) {
      fetchAdminSalesmanStats(); // Salesman sees subset of admin stats
    } else if (role.includes('customer')) {
      fetchCustomerStats();
    } else if (role.includes('delivery')) {
      fetchDeliveryManStats();
    } else {
      setStatsError(`Dashboard not configured for role: ${user.role}`);
      setStatsLoading(false);
    }
  }, [user, fetchAdminSalesmanStats, fetchCustomerStats, fetchDeliveryManStats]);

  if (loading) {
    return <div className="loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  const renderAdminSalesmanStats = () => (
    <div className="stats-grid">
      {user.role.toLowerCase().includes('admin') && (
        <div className="stat-card">
          <div className="stat-icon users-icon">👥</div>
          <h3>Total Users</h3>
          <p>{totalUsers.toLocaleString()}</p>
        </div>
      )}
      <div className="stat-card">
        <div className="stat-icon revenue-icon">💰</div>
        <h3>Revenue</h3>
        <p>₹{revenue.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Orders</h3>
        <p>{totalOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon products-icon">🛒</div>
        <h3>Total Products</h3>
        <p>{totalProducts.toLocaleString()}</p>
      </div>
    </div>
  );

  const renderCustomerStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Orders</h3>
        <p>{customerTotalOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon delivered-icon">✅</div>
        <h3>Delivered Orders</h3>
        <p>{customerDeliveredOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon credit-limit-icon">💳</div>
        <h3>Credit Limit</h3>
        <p>₹{creditLimit.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon used-credit-icon">📉</div>
        <h3>Used Credit</h3>
        <p>₹{usedCredit.toLocaleString()}</p>
      </div>
    </div>
  );

  const renderDeliveryManStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon assigned-icon">📬</div>
        <h3>Assigned Orders</h3>
        <p>{assignedOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon accepted-icon">👍</div>
        <h3>Accepted Orders</h3>
        <p>{acceptedOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon delivered-icon">✅</div>
        <h3>Delivered</h3>
        <p>{deliveredOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon pending-icon">⏳</div>
        <h3>Pending</h3>
        <p>{pendingOrders.toLocaleString()}</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem={activeItem} 
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="dashboard-content">
          <div className="page-header">
            <h2>Dashboard</h2>
            <p>Welcome back, <span className="user-name">{user.username}</span></p>
          </div>

          {statsError ? (
            <div className="stats-error">{statsError}</div>
          ) : statsLoading ? (
            <div className="stats-skeleton">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="stat-card skeleton"></div>
              ))}
            </div>
          ) : (
            <>
              {(user.role.toLowerCase().includes('admin') || user.role.toLowerCase().includes('sales')) && renderAdminSalesmanStats()}
              {user.role.toLowerCase().includes('customer') && renderCustomerStats()}
              {(user.role.toLowerCase().includes('delivery')) && renderDeliveryManStats()}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;