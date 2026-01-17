// src/pages/Customer/Credit/CustomerCreditLimit.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerCreditLimit.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const CustomerCreditLimit = () => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Credit Limit');
  const [user, setUser] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  // Fetch logged-in user
  const fetchCurrentUser = useCallback(async () => {
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
    }
  }, [backendUrl, navigate]);

  // Fetch customer's own credit profile (using new endpoint)
  const fetchMyCreditDetails = useCallback(async () => {
    if (!user) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/customers/my-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomer(response.data);
    } catch (error) {
      console.error("Error fetching credit details:", error);
      alert("Failed to load your credit limit details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user) {
      fetchMyCreditDetails();
    }
  }, [user, fetchMyCreditDetails]);

  if (loading) {
    return <div className="loading">Loading your credit details...</div>;
  }

  if (!customer) {
    return <div className="error">Your customer profile not found. Contact support.</div>;
  }

  const usedCredit = customer.creditLimit - customer.balanceCreditLimit;
  const availableCredit = customer.balanceCreditLimit;
  const creditUtilization = customer.creditLimit > 0 
    ? ((usedCredit / customer.creditLimit) * 100).toFixed(1) 
    : 0;

  return (
    <div className="customer-credit-layout">
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
        <div className="credit-details-container">
          <h2>My Credit Limit</h2>

          <div className="credit-summary">
            <div className="credit-card">
              <h3>Total Credit Limit</h3>
              <p className="amount">₹{customer.creditLimit.toFixed(2)}</p>
            </div>

            <div className="credit-card">
              <h3>Available Credit</h3>
              <p className="amount available">₹{availableCredit.toFixed(2)}</p>
            </div>

            <div className="credit-card">
              <h3>Used Credit</h3>
              <p className="amount used">₹{usedCredit.toFixed(2)}</p>
            </div>

            <div className="credit-card">
              <h3>Credit Utilization</h3>
              <p className="utilization">{creditUtilization}%</p>
              <div className="utilization-bar">
                <div
                  className="utilization-fill"
                  style={{
                    width: `${Math.min(creditUtilization, 100)}%`,
                    background: creditUtilization > 80 ? '#ef4444' : creditUtilization > 50 ? '#f59e0b' : '#10b981',
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="billing-info">
            <h3>Billing Information</h3>
            <div className="info-row">
              <span className="label">Billing Type:</span>
              <span className="value">
                {customer.billingType === 'creditcard' ? 'Credit Card (30-day cycle)' : 'Immediate Payment'}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Email:</span>
              <span className="value">{customer.email}</span>
            </div>
            <div className="info-row">
              <span className="label">Phone:</span>
              <span className="value">{customer.phoneNumber}</span>
            </div>
            <div className="info-row">
              <span className="label">Address:</span>
              <span className="value">{customer.address}, {customer.pincode}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerCreditLimit;