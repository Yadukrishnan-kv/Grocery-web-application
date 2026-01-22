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

  const [totalUsers, setTotalUsers] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);

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

 const fetchDashboardStats = useCallback(async () => {
  try {
    setStatsLoading(true);
    setStatsError(null);

    const token = localStorage.getItem('token');
    if (!token) return;

    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    const [usersRes, ordersRes, productsRes] = await Promise.all([
      axios.get(`${backendUrl}/api/users/getAllUsers`, config),
      axios.get(`${backendUrl}/api/orders/getallorders`, config),
      axios.get(`${backendUrl}/api/products/getallproducts`, config),
    ]);

    // Filter users: exclude Admin and superadmin
    const nonAdminUsers = usersRes.data.filter(
      user => user.role !== 'Admin' && user.role !== 'superadmin'
    );

    setTotalUsers(nonAdminUsers.length || 0);

    const orders = ordersRes.data || [];
    setTotalOrders(orders.length);

    // Revenue = sum of totalAmount (you can add payment status filter later if needed)
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    setRevenue(totalRevenue);

    setTotalProducts(productsRes.data.length || 0);
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    setStatsError('Failed to load dashboard statistics');
  } finally {
    setStatsLoading(false);
  }
}, [backendUrl]);

  useEffect(() => {
    fetchUser();
    fetchDashboardStats();
  }, [fetchUser, fetchDashboardStats]);

  if (loading) {
    return <div className="loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

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
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon users-icon">👥</div>
                <h3>Total Users</h3>
                <p>{totalUsers.toLocaleString()}</p>
              </div>
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
          )}

          
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;