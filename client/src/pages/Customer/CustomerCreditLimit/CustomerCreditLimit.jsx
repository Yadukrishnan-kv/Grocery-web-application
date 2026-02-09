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
    return <div className="customer-credit-loading">Loading your credit details...</div>;
  }

  if (!customer) {
    return <div className="customer-credit-error">Your customer profile not found. Contact support.</div>;
  }

  const usedCredit = customer.creditLimit - customer.balanceCreditLimit;
  const availableCredit = customer.balanceCreditLimit;
  const creditUtilization = customer.creditLimit > 0 
    ? ((usedCredit / customer.creditLimit) * 100).toFixed(1) 
    : 0;

  // Format billing type display
  const getBillingTypeDisplay = () => {
    if (customer.billingType === 'Credit limit') {
      return 'Credit Limit';
    } else if (customer.billingType === 'Cash') {
      return 'Cash Payment';
    }
    return customer.billingType || 'N/A';
  };

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
      <main className={`customer-credit-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-credit-container-wrapper">
          <div className="customer-credit-container">
            <h2 className="customer-credit-page-title">My Credit Limit</h2>

            <div className="customer-credit-summary">
              <div className="customer-credit-card">
                <h3>Total Credit Limit</h3>
                <p className="customer-credit-amount">AED {customer.creditLimit.toFixed(2)}</p>
              </div>

              <div className="customer-credit-card">
                <h3>Available Credit</h3>
                <p className="customer-credit-amount customer-credit-available">AED {availableCredit.toFixed(2)}</p>
              </div>

              <div className="customer-credit-card">
                <h3>Used Credit</h3>
                <p className="customer-credit-amount customer-credit-used">AED {usedCredit.toFixed(2)}</p>
              </div>

              <div className="customer-credit-card">
                <h3>Credit Utilization</h3>
                <p className="customer-credit-utilization">{creditUtilization}%</p>
                <div className="customer-credit-utilization-bar">
                  <div
                    className="customer-credit-utilization-fill"
                    style={{
                      width: `${Math.min(creditUtilization, 100)}%`,
                      background: creditUtilization > 80 ? '#ef4444' : creditUtilization > 50 ? '#f59e0b' : '#10b981',
                    }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="customer-credit-billing-info">
              <h3>Billing Information</h3>
              <div className="customer-credit-info-row">
                <span className="customer-credit-label">Billing Type:</span>
                <span className="customer-credit-value">{getBillingTypeDisplay()}</span>
              </div>
              
              {customer.billingType === 'Credit limit' && (
                <>
                  <div className="customer-credit-info-row">
                    <span className="customer-credit-label">Statement Type:</span>
                    <span className="customer-credit-value">
                      {customer.statementType 
                        ? customer.statementType.charAt(0).toUpperCase() + customer.statementType.slice(1) 
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="customer-credit-info-row">
                    <span className="customer-credit-label">Due Days:</span>
                    <span className="customer-credit-value">
                      {customer.dueDays !== null && customer.dueDays !== undefined 
                        ? `${customer.dueDays} days` 
                        : 'N/A'}
                    </span>
                  </div>
                </>
              )}
              
              <div className="customer-credit-info-row">
                <span className="customer-credit-label">Email:</span>
                <span className="customer-credit-value">{customer.email}</span>
              </div>
              <div className="customer-credit-info-row">
                <span className="customer-credit-label">Phone:</span>
                <span className="customer-credit-value">{customer.phoneNumber}</span>
              </div>
              <div className="customer-credit-info-row">
                <span className="customer-credit-label">Address:</span>
                <span className="customer-credit-value">{customer.address}, {customer.pincode}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerCreditLimit;