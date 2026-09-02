// src/pages/Admin/CustomerList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./CustomerList.css";
import axios from "axios";
import toast from "../../../utils/toast";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";

const CustomerList = () => {
  // Full list — only fetched/used when a search or due-days filter is active,
  // so client-side filtering can search the whole dataset (not just one page).
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Customers");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dueDaysFilter, setDueDaysFilter] = useState("all");

  const { entriesPerPage } = useAppSettings();
  const isFiltering = dueDaysFilter !== "all" || searchTerm.trim() !== "";

  // Server-side pagination state (used when no filter/search is active)
  const [pageCustomers, setPageCustomers] = useState([]);
  const [serverPage, setServerPage] = useState(1);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [serverTotalRecords, setServerTotalRecords] = useState(0);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

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

  const fetchAllCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/getallcustomerswithdue`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setCustomers(response.data);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchCustomersPage = useCallback(
    async (page) => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${backendUrl}/api/customers/getallcustomerswithdue`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { page, limit: entriesPerPage },
          },
        );
        setPageCustomers(response.data.data);
        setServerTotalPages(response.data.totalPages);
        setServerTotalRecords(response.data.totalRecords);
      } catch (error) {
        console.error("Error fetching customers:", error);
        toast.error("Failed to load customers");
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, entriesPerPage],
  );

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (isFiltering) {
      fetchAllCustomers();
    } else {
      fetchCustomersPage(serverPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiltering, serverPage, entriesPerPage]);

  useEffect(() => {
    if (!isFiltering) setServerPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiltering]);

  const handleDeleteClick = (id, customerName) => {
    setCustomerToDelete({ id, customerName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${backendUrl}/api/customers/deletecustomer/${customerToDelete.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      toast.success(
        `Customer "${customerToDelete.customerName}" deleted successfully!`,
      );
      refetchCurrent();
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("Failed to delete customer. Please try again.");
    } finally {
      setCustomerToDelete(null);
    }
  };

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

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch =
        !searchTerm.trim() ||
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const daysLeft = getDaysRemaining(customer);

      if (dueDaysFilter === "all") return matchesSearch;

      if (dueDaysFilter === "no-pending") {
        return matchesSearch && daysLeft === null;
      }
      if (dueDaysFilter === "overdue") {
        return matchesSearch && daysLeft !== null && daysLeft < 0;
      }
      if (dueDaysFilter === "1-5") {
        return (
          matchesSearch && daysLeft !== null && daysLeft >= 0 && daysLeft <= 5
        );
      }
      if (dueDaysFilter === "6-15") {
        return (
          matchesSearch && daysLeft !== null && daysLeft > 5 && daysLeft <= 15
        );
      }
      if (dueDaysFilter === "16+") {
        return matchesSearch && daysLeft !== null && daysLeft > 15;
      }

      return matchesSearch;
    });
  }, [customers, searchTerm, dueDaysFilter]);

  const clientPagination = usePaginatedData(
    filteredCustomers,
    entriesPerPage,
    `${dueDaysFilter}|${searchTerm}`
  );
  const serverPagination = {
    page: serverPage,
    totalPages: serverTotalPages,
    totalRecords: serverTotalRecords,
    showingFrom: serverTotalRecords === 0 ? 0 : (serverPage - 1) * entriesPerPage + 1,
    showingTo: Math.min(serverPage * entriesPerPage, serverTotalRecords),
    canPrev: serverPage > 1,
    canNext: serverPage < serverTotalPages,
    goPrev: () => setServerPage((p) => Math.max(1, p - 1)),
    goNext: () => setServerPage((p) => Math.min(serverTotalPages, p + 1)),
  };
  const visibleCustomers = isFiltering ? clientPagination.pageData : pageCustomers;
  const activePagination = isFiltering ? clientPagination : serverPagination;
  const refetchCurrent = () =>
    isFiltering ? fetchAllCustomers() : fetchCustomersPage(serverPage);

  const hasContactData = useMemo(
    () => visibleCustomers.some(c => c.contactPersonName || c.contactPersonPhone || c.contactPersonAddress),
    [visibleCustomers]
  );

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
            <div className="customer-list-header-section">
              <h2 className="customer-list-page-title">Customer Management</h2>

              <div className="customer-list-controls-group">
                <div className="customer-list-search-container">
                  <input
                    type="text"
                    className="customer-list-search-input"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="customer-list-search-clear"
                      onClick={clearSearch}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="customer-list-filter-group">
                  <label
                    htmlFor="dueDaysFilter"
                    className="customer-list-filter-label"
                  >
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

                <Link
                  to="/customer/create"
                  className="customer-list-create-button"
                >
                  Create Customer
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="customer-list-loading">Loading customers...</div>
            ) : visibleCustomers.length === 0 ? (
              <div className="customer-list-no-data">
                No customers found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
                {dueDaysFilter !== "all" ? ` with due filter` : ""}
              </div>
            ) : (
              <div className="customer-list-table-wrapper">
                <table className="customer-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Phone</th>
                      {hasContactData && <th scope="col">Contact Person</th>}
                      {hasContactData && <th scope="col">Contact Phone</th>}
                      {hasContactData && <th scope="col">Contact Address</th>}
                      <th scope="col">Address</th>
                      <th scope="col">TRN</th>
                      <th scope="col">Emirates</th>
                      <th scope="col">Emirates Code</th>
                      <th scope="col">Latitude</th>
                      <th scope="col">Longitude</th>
                      <th scope="col">Credit Limit</th>
                      <th scope="col">Balance</th>
                      <th scope="col">Return Balance</th>
                      <th scope="col">Opening Balance</th>
                      <th scope="col">Opening Due Days</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Statement Type</th>
                      <th scope="col">Salesman</th>
                      <th scope="col">Due Days</th>
                      <th scope="col">Current Bill Due</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCustomers.map((customer, index) => {
                      const daysLeft = getDaysRemaining(customer);
                      const dueStatusText = getDueStatusText(daysLeft);
                      const dueClass = getDueClass(daysLeft);

                      // NEW: Show "-" when no opening balance/due days
                      const openingBalanceDisplay =
                        customer.openingBalance > 0
                          ? customer.openingBalance.toFixed(2)
                          : "-";
                      const openingDueDaysDisplay =
                        customer.openingBalanceDueDays
                          ? `${customer.openingBalanceDueDays} days`
                          : "-";

                      return (
                        <tr key={customer._id}>
                          <td>{activePagination.showingFrom + index}</td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontWeight: 600, letterSpacing: "1px" }}>
                              {customer.customerId || "-"}
                            </span>
                          </td>
                          <td>{customer.name || "-"}</td>
                          <td>{customer.email || "-"}</td>
                          <td>{customer.phoneNumber || "-"}</td>
                          {hasContactData && <td>{customer.contactPersonName || "-"}</td>}
                          {hasContactData && <td>{customer.contactPersonPhone || "-"}</td>}
                          {hasContactData && <td>{customer.contactPersonAddress || "-"}</td>}
                          <td>{customer.address || "-"}</td>
                          <td>{customer.pincode || "-"}</td>
                          <td>{customer.emiratesName || "-"}</td>
                          <td>{customer.emiratesCode || "-"}</td>
                          <td>{customer.latitude != null ? customer.latitude : "-"}</td>
                          <td>{customer.longitude != null ? customer.longitude : "-"}</td>

                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="AED"
                                width={15}
                                height={15}
                                style={{ paddingTop: "3px" }}
                              />
                              <span>
                                {customer.creditLimit?.toFixed(2) || "0.00"}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="AED"
                                width={15}
                                height={15}
                                style={{ paddingTop: "3px" }}
                              />
                              <span>
                                {customer.balanceCreditLimit?.toFixed(2) ||
                                  "0.00"}
                              </span>
                            </div>
                          </td>

                          {/* Return Balance */}
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="AED"
                                width={15}
                                height={15}
                                style={{ paddingTop: "3px" }}
                              />
                              <span>
                                {(customer.returnCreditBalance || 0).toFixed(2)}
                              </span>
                            </div>
                          </td>

                          {/* NEW COLUMNS */}
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="AED"
                                width={15}
                                height={15}
                                style={{ paddingTop: "3px" }}
                              />
                              <span>{openingBalanceDisplay}</span>
                            </div>
                          </td>

                          <td>{openingDueDaysDisplay}</td>

                          <td>{customer.billingType || "-"}</td>
                          <td>
                            {customer.statementType
                              ? customer.statementType.charAt(0).toUpperCase() +
                                customer.statementType.slice(1)
                              : "-"}
                          </td>
                          <td>{customer.salesman?.username || "-"}</td>
                          <td>{customer.dueDays || "-"}</td>

                          <td className={dueClass}>{dueStatusText}</td>

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
                              onClick={() =>
                                handleDeleteClick(customer._id, customer.name)
                              }
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

            <Pagination
              page={activePagination.page}
              totalPages={activePagination.totalPages}
              totalRecords={activePagination.totalRecords}
              showingFrom={activePagination.showingFrom}
              showingTo={activePagination.showingTo}
              canPrev={activePagination.canPrev}
              canNext={activePagination.canNext}
              onPrev={activePagination.goPrev}
              onNext={activePagination.goNext}
            />
          </div>
        </div>
      </main>

      {/* Responsive Delete Confirmation Modal */}
      {showDeleteModal && customerToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Delete Customer</h3>
            <p className="confirm-text">
              Are you sure you want to delete
              <strong> "{customerToDelete.customerName}"</strong>?
            </p>
            <p className="confirm-warning">This action cannot be undone.</p>

            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button className="confirm-delete" onClick={confirmDelete}>
                Delete Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerList;
