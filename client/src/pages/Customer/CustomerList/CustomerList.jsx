// src/pages/Customer/CustomerList.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerList.css';
import axios from 'axios';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Customers');
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/customers/getallcustomers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      alert('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCustomers();
  }, [fetchCurrentUser, fetchCustomers]);

  const handleDelete = async (id, customerName) => {
    if (window.confirm(`Are you sure you want to delete customer "${customerName}"?`)) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/customers/deletecustomer/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchCustomers();
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Failed to delete customer. Please try again.');
      }
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm('');
  };

  // Filter customers based on search term (Name or Email)
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      if (!searchTerm.trim()) return true;
      
      const query = searchTerm.toLowerCase().trim();
      return (
        customer.name?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query)
      );
    });
  }, [customers, searchTerm]);

  if (!user) {
    return <div className="customer-list-loading">Loading...</div>;
  }

  return (
    <div className="customer-list-layout">
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
      <main className={`customer-list-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-list-container-wrapper">
          <div className="customer-list-container">
            <div className="customer-list-header-section">
              <h2 className="customer-list-page-title">Customer Management</h2>

              {/* Exact same controls group as OrderList */}
              <div className="customer-list-controls-group">
                {/* Search bar */}
                <div className="customer-list-search-container">
                  <input
                    type="text"
                    className="customer-list-search-input"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search customers by name or email"
                  />
                  {searchTerm && (
                    <button
                      className="customer-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Create Button */}
                <Link to="/customer/create" className="customer-list-create-button">
                  Create Customer
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="customer-list-loading">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="customer-list-no-data">
                No customers found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ''}
              </div>
            ) : (
              <div className="customer-list-table-wrapper">
                <table className="customer-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Address</th>
                      <th scope="col">Pincode</th>
                      <th scope="col">Credit Limit</th>
                      <th scope="col">Balance</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer, index) => (
                      <tr key={customer._id}>
                        <td>{index + 1}</td>
                        <td>{customer.name}</td>
                        <td>{customer.email}</td>
                        <td>{customer.phoneNumber}</td>
                        <td>{customer.address}</td>
                        <td>{customer.pincode}</td>
                        <td>AED{customer.creditLimit.toFixed(2)}</td>
                        <td>AED{customer.balanceCreditLimit.toFixed(2)}</td>
                        <td>{customer.billingType}</td>
                        <td>
                          <Link
                            to={`/customer/create?edit=${customer._id}`}
                            className="customer-list-icon-button customer-list-edit-button"
                            aria-label={`Edit customer ${customer.name}`}
                          >
                            ✎
                          </Link>
                        </td>
                        <td>
                          <button
                            className="customer-list-icon-button customer-list-delete-button"
                            onClick={() => handleDelete(customer._id, customer.name)}
                            aria-label={`Delete customer ${customer.name}`}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
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

export default CustomerList;