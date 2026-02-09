// src/pages/Admin/CustomerList.jsx
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
  const [dueDaysFilter, setDueDaysFilter] = useState('all');

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
      // Use the endpoint that includes pending bill info
      const response = await axios.get(`${backendUrl}/api/customers/getallcustomerswithdue`, {
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

  // Use real pending bill days from backend
  const getDaysRemaining = (customer) => {
    // pendingBillDaysLeft comes from getAllCustomersWithDue endpoint
    return customer.pendingBillDaysLeft !== undefined && customer.pendingBillDaysLeft !== null
      ? customer.pendingBillDaysLeft
      : null;
  };

  const getDueStatusText = (days) => {
    if (days === null) return "No pending bill";
    if (days < 0) return `Overdue by ${Math.abs(days)} days`;
    if (days === 0) return "Due today";
    return `${days} days left`;
  };

  const getDueClass = (days) => {
    if (days === null) return "due-neutral";
    if (days < 0) return "due-red";
    if (days <= 5) return "due-yellow";
    return "due-green";
  };

  const clearSearch = () => setSearchTerm('');

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch = !searchTerm.trim() ||
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const daysLeft = getDaysRemaining(customer);

      if (dueDaysFilter === 'all') return matchesSearch;

      if (dueDaysFilter === 'no-pending') {
        return matchesSearch && daysLeft === null;
      }
      if (dueDaysFilter === 'overdue') {
        return matchesSearch && daysLeft !== null && daysLeft < 0;
      }
      if (dueDaysFilter === '1-5') {
        return matchesSearch && daysLeft !== null && daysLeft >= 0 && daysLeft <= 5;
      }
      if (dueDaysFilter === '6-15') {
        return matchesSearch && daysLeft !== null && daysLeft > 5 && daysLeft <= 15;
      }
      if (dueDaysFilter === '16+') {
        return matchesSearch && daysLeft !== null && daysLeft > 15;
      }

      return matchesSearch;
    });
  }, [customers, searchTerm, dueDaysFilter]);

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

              <div className="customer-list-controls-group">
                {/* Search */}
                <div className="customer-list-search-container">
                  <input
                    type="text"
                    className="customer-list-search-input"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button className="customer-list-search-clear" onClick={clearSearch}>
                      ×
                    </button>
                  )}
                </div>

                {/* Due Days Filter */}
                <div className="customer-list-filter-group">
                  <label htmlFor="dueDaysFilter" className="customer-list-filter-label">
                    Due Days:
                  </label>
                  <select
                    id="dueDaysFilter"
                    value={dueDaysFilter}
                    onChange={(e) => setDueDaysFilter(e.target.value)}
                    className="customer-list-filter-select"
                  >
                    <option value="all">All</option>
                    <option value="no-pending">No Pending Bill</option>
                    <option value="overdue">Overdue</option>
                    <option value="1-5">1-5 Days Left</option>
                    <option value="6-15">6-15 Days Left</option>
                    <option value="16+">16+ Days Left</option>
                  </select>
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
                {dueDaysFilter !== 'all' ? ` with due filter` : ''}
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
                      <th scope="col">Statement Type</th>
                      <th scope="col">Due Days</th>
                      <th scope="col">Current Bill Due</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer, index) => {
                      const daysLeft = getDaysRemaining(customer);
                      const dueStatusText = getDueStatusText(daysLeft);
                      const dueClass = getDueClass(daysLeft);

                      return (
                        <tr key={customer._id}>
                          <td>{index + 1}</td>
                          <td>{customer.name}</td>
                          <td>{customer.email}</td>
                          <td>{customer.phoneNumber}</td>
                          <td>{customer.address}</td>
                          <td>{customer.pincode}</td>
                          <td>AED{customer.creditLimit?.toFixed(2) || '0.00'}</td>
                          <td>AED{customer.balanceCreditLimit?.toFixed(2) || '0.00'}</td>
                          <td>{customer.billingType}</td>
                          <td>
                            {customer.statementType
                              ? customer.statementType.charAt(0).toUpperCase() + customer.statementType.slice(1)
                              : 'N/A'}
                          </td>
                          <td>{customer.dueDays || 'N/A'}</td>
                          <td className={dueClass}>
                            {dueStatusText}
                          </td>
                          <td>
                            <Link
                              to={`/customer/create?edit=${customer._id}`}
                              className="customer-list-icon-button customer-list-edit-button"
                            >
                              ✎
                            </Link>
                          </td>
                          <td>
                            <button
                              className="customer-list-icon-button customer-list-delete-button"
                              onClick={() => handleDelete(customer._id, customer.name)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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