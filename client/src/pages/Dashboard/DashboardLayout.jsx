// DashboardLayout.jsx
import React, { useEffect, useState } from 'react';
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
  const backendUrl = process.env.REACT_APP_BACKEND_IP;


  const navigate = useNavigate();
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await axios.get(`${backendUrl}/api/auth/me`, {  // ← you need this endpoint
          headers: { Authorization: `Bearer ${token}` }
        });

        setUser(response.data.user || response.data);
      } catch (error) {
        console.error("Failed to load user", error);
        localStorage.removeItem('token');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate, backendUrl]);

  if (loading) {
    return <div className="loading">Loading user information...</div>;
  }

  // If no user after loading → redirect
  if (!user) {
    return null; // or redirect handled in useEffect
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
          <h2>{activeItem}</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Users</h3>
              <p>1,248</p>
            </div>
            <div className="stat-card">
              <h3>Revenue</h3>
              <p>$24,560</p>
            </div>
            <div className="stat-card">
              <h3>Orders</h3>
              <p>324</p>
            </div>
            <div className="stat-card">
              <h3>Products</h3>
              <p>89</p>
            </div>
          </div>
          <div className="content-section">
            <h3>Recent Activity</h3>
            <p>This is a placeholder for dashboard content. In a real application, this area would display charts, tables, or other relevant data.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;