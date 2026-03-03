// src/pages/salesman/SalesmanCustomers.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./SalesmanCustomers.css";
import axios from "axios";
import toast from "react-hot-toast";

const SalesmanCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("SalesmanCustomers");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  // Fetch salesman's customers
  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/my-customers-with-due`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCustomers(response.data);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCustomers();
  }, [fetchCurrentUser, fetchCustomers]);

  // Due status helpers (kept for display styling)
  const getDaysRemaining = (customer) => {
    return customer.pendingBillDaysLeft !== undefined &&
      customer.pendingBillDaysLeft !== null
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

  const clearSearch = () => setSearchTerm("");

  // Filter customers by search term ONLY
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      return (
        !searchTerm.trim() ||
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phoneNumber?.includes(searchTerm)
      );
    });
  }, [customers, searchTerm]); // ✅ Removed dueDaysFilter dependency

  // Show loading while fetching user
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
      <main
        className={`customer-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="customer-list-container-wrapper">
          <div className="customer-list-container">
            {/* Page Header */}
            <div className="customer-list-header-section">
              <h2 className="customer-list-page-title">My Customers</h2>

              <div className="customer-list-controls-group">
                {/* Search Only */}
                <div className="customer-list-search-container">
                  <input
                    type="text"
                    className="customer-list-search-input"
                    placeholder="Search by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
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
              </div>
            </div>

            {/* Loading State */}
            {loading ? (
              <div className="customer-list-loading">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="customer-list-no-data">
                No customers found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
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
                      <th scope="col">Used Credit</th>
                      <th scope="col">Outstanding</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Due Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer, index) => {
                      const daysLeft = getDaysRemaining(customer);
                      const dueStatusText = getDueStatusText(daysLeft);
                      const dueClass = getDueClass(daysLeft);
                      const usedCredit = (customer.creditLimit || 0) - (customer.balanceCreditLimit || 0);

                      return (
                        <tr key={customer._id}>
                          <td>{index + 1}</td>
                          <td>{customer.name || "-"}</td>
                          <td>{customer.email || "-"}</td>
                          <td>{customer.phoneNumber || "-"}</td>
                          <td>{customer.address || "-"}</td>
                          <td>{customer.pincode || "-"}</td>

                          {/* Credit Limit */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={15} height={15} style={{ paddingTop: "3px" }} />
                              <span>{(customer.creditLimit || 0).toFixed(2)}</span>
                            </div>
                          </td>

                          {/* Balance Credit Limit */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={15} height={15} style={{ paddingTop: "3px" }} />
                              <span>{(customer.balanceCreditLimit || 0).toFixed(2)}</span>
                            </div>
                          </td>

                          {/* Used Credit */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={15} height={15} style={{ paddingTop: "3px" }} />
                              <span>{usedCredit.toFixed(2)}</span>
                            </div>
                          </td>

                          {/* Outstanding Amount */}
                          <td className={customer.totalOutstanding > 0 ? "due-red" : ""}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={15} height={15} style={{ paddingTop: "3px" }} />
                              <span>{(customer.totalOutstanding || 0).toFixed(2)}</span>
                            </div>
                          </td>

                          {/* Billing Type */}
                          <td>
                            <span className={`billing-badge ${customer.billingType === "Cash" ? "cash" : "credit"}`}>
                              {customer.billingType || "-"}
                            </span>
                          </td>

                          {/* Due Status */}
                          <td className={dueClass}>{dueStatusText}</td>
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

export default SalesmanCustomers;