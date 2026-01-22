// src/pages/Customer/Bills/CustomerBillStatement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerBillStatement.css';
import axios from 'axios';

const CustomerBillStatement = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Bill Statement');
  const [user, setUser] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

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

  const fetchCustomerBills = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/bills/customer-bills`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBills(response.data);
    } catch (error) {
      console.error('Error fetching customer bills:', error);
      alert('Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCustomerBills();
  }, [fetchCurrentUser, fetchCustomerBills]);

  const handlePayBill = async (billId, amountDue) => {
    const paymentAmount = prompt(`Enter payment amount (Max: $${amountDue.toFixed(2)}):`);
    if (paymentAmount && !isNaN(paymentAmount) && parseFloat(paymentAmount) > 0 && parseFloat(paymentAmount) <= amountDue) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${backendUrl}/api/bills/paybill/${billId}`,
          { paymentAmount: parseFloat(paymentAmount) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        fetchCustomerBills(); // Refresh bills
      } catch (error) {
        console.error('Error paying bill:', error);
        alert('Failed to process payment');
      }
    } else {
      alert('Please enter a valid payment amount.');
    }
  };

  if (!user) {
    return <div className="customer-bills-loading">Loading...</div>;
  }

  return (
    <div className="customer-bills-layout">
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
      <main className={`customer-bills-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-bills-container-wrapper">
          <div className="customer-bills-container">
            <div className="customer-bills-header-section">
              <h2 className="customer-bills-page-title">Bill Statements</h2>
            </div>
            
            {loading ? (
              <div className="customer-bills-loading">Loading bills...</div>
            ) : (
              <div className="customer-bills-table-wrapper">
                <table className="customer-bills-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Cycle Start</th>
                      <th scope="col">Cycle End</th>
                      <th scope="col">Total Used</th>
                      <th scope="col">Amount Due</th>
                      <th scope="col">Due Date</th>
                      <th scope="col">Paid Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length > 0 ? (
                      bills.map((bill, index) => (
                        <tr key={bill._id}>
                          <td>{index + 1}</td>
                          <td>{new Date(bill.cycleStart).toLocaleDateString()}</td>
                          <td>{new Date(bill.cycleEnd).toLocaleDateString()}</td>
                          <td>${bill.totalUsed.toFixed(2)}</td>
                          <td>${bill.amountDue.toFixed(2)}</td>
                          <td>{new Date(bill.dueDate).toLocaleDateString()}</td>
                          <td>${bill.paidAmount.toFixed(2)}</td>
                          <td>
                            <span className={`customer-bills-status-badge customer-bills-status-${bill.status?.toLowerCase() || 'pending'}`}>
                              {bill.status?.charAt(0).toUpperCase() + bill.status?.slice(1) || 'Pending'}
                            </span>
                          </td>
                          <td>
                            {bill.status !== 'paid' && (
                              <button
                                className="customer-bills-pay-button"
                                onClick={() => handlePayBill(bill._id, bill.amountDue)}
                              >
                                Pay Bill
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" className="customer-bills-no-data">
                          No bills found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerBillStatement;