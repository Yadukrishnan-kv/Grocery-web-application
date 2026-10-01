// src/pages/Sales/CancelOrderReports/CancelOrderReports.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./CancelOrderReports.css";
import axios from "axios";
import toast from "../../../utils/toast";
import OrderProductsModal from "../../../components/common/OrderProductsModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";
import { exportToExcel, formatDateForExcel } from "../../../utils/exportToExcel";

const CancelOrderReports = () => {
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Cancel Order Reports");
  const [user, setUser] = useState(null);
  const [viewProductsOrder, setViewProductsOrder] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [salesmanFilter, setSalesmanFilter] = useState("all");
  const [salesmen, setSalesmen] = useState([]);

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

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const endpoint =
        user?.role === "Sales man"
          ? `${backendUrl}/api/orders/salesman-orders`
          : `${backendUrl}/api/orders/getallorders`;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAllOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user]);

  const fetchSalesmen = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSalesmen(response.data.filter((u) => u.role === "Sales man"));
    } catch (error) {
      console.error("Error fetching salesmen:", error);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user) {
      fetchOrders();
      if (user.role !== "Sales man") {
        fetchSalesmen();
      }
    }
  }, [user, fetchOrders, fetchSalesmen]);

  // Only cancelled orders belong on this report.
  const cancelledOrders = useMemo(
    () => allOrders.filter((order) => order.status === "cancelled"),
    [allOrders]
  );

  const filteredOrders = useMemo(() => {
    return cancelledOrders.filter((order) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        order.customer?.name?.toLowerCase().includes(term) ||
        (order.orderId || order._id)?.toLowerCase().includes(term) ||
        order.orderItems?.some((item) =>
          item.product?.productName?.toLowerCase().includes(term)
        );

      // The date the order was actually cancelled is what this report is
      // about — fall back to orderDate for any orders cancelled before
      // cancelledAt existed.
      const referenceDate = new Date(order.cancelledAt || order.orderDate);
      referenceDate.setHours(0, 0, 0, 0);

      let matchesDate = true;
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && referenceDate >= start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && referenceDate <= end;
      }

      const matchesSalesman =
        salesmanFilter === "all" ||
        order.customer?.salesman?._id === salesmanFilter ||
        order.customer?.salesman === salesmanFilter;

      return matchesSearch && matchesDate && matchesSalesman;
    });
  }, [cancelledOrders, searchTerm, fromDate, toDate, salesmanFilter]);

  const resetFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
    setSalesmanFilter("all");
  };

  // What the order was worth at the time it was cancelled — cancellation is
  // only allowed before packing starts, so this is always the raw
  // order-time total (no invoice has been generated yet).
  const getOrderValue = (order) =>
    order.orderItems?.reduce((sum, item) => sum + (item.totalAmount || 0), 0) || 0;

  const handleExportToExcel = () => {
    const exportData = filteredOrders.map((order, index) => {
      const totalOrdered =
        order.orderItems?.reduce((sum, item) => sum + item.orderedQuantity, 0) || 0;

      return {
        "No": index + 1,
        "Order ID": order.orderId || order._id,
        "Customer": order.customer?.name || "N/A",
        "Ordered Qty": totalOrdered,
        "Order Value (AED)": getOrderValue(order).toFixed(2),
        "Payment": order.payment === "credit" ? "Credit" : "Cash",
        "Cancelled By": order.cancelledBy?.username || "N/A",
        "Cancelled On": order.cancelledAt ? formatDateForExcel(order.cancelledAt) : "N/A",
        "Order Date": formatDateForExcel(order.orderDate),
      };
    });

    exportToExcel(exportData, "CancelOrderReports", "Cancel Order Reports");
    toast.success("Excel file exported successfully");
  };

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredOrders,
    entriesPerPage,
    `${searchTerm}|${fromDate}|${toDate}|${salesmanFilter}`
  );

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) {
    return <div className="cancel-order-reports-loading">Loading...</div>;
  }

  return (
    <div className="cancel-order-reports-layout">
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
        className={`cancel-order-reports-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="cancel-order-reports-container-wrapper">
          <div className="cancel-order-reports-container">
            <div className="cancel-order-reports-header-section">
              <h2 className="cancel-order-reports-page-title">Cancel Order Reports</h2>

              <div className="cancel-order-reports-controls-group">
                <div className="cancel-order-reports-date-group">
                  <input
                    type="date"
                    id="fromDate"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="cancel-order-reports-date-input"
                  />
                </div>

                <div className="cancel-order-reports-date-group">
                  <input
                    type="date"
                    id="toDate"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="cancel-order-reports-date-input"
                  />
                </div>

                {user?.role !== "Sales man" && (
                  <select
                    className="cancel-order-reports-salesman-filter"
                    value={salesmanFilter}
                    onChange={(e) => setSalesmanFilter(e.target.value)}
                    aria-label="Filter orders by salesman"
                  >
                    <option value="all">All Salesmen</option>
                    {salesmen.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.username}
                      </option>
                    ))}
                  </select>
                )}

                <div className="cancel-order-reports-search-container">
                  <input
                    type="text"
                    className="cancel-order-reports-search-input"
                    placeholder="Search by customer, order ID or product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="cancel-order-reports-search-clear"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  className="cancel-order-reports-reset-button"
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>

                <button
                  className="cancel-order-reports-refresh-button"
                  onClick={fetchOrders}
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh Data"}
                </button>

                <button
                  className="cancel-order-reports-refresh-button"
                  onClick={handleExportToExcel}
                  disabled={loading || filteredOrders.length === 0}
                  title="Export to Excel"
                >
                  Export Excel
                </button>
              </div>
            </div>

            {loading ? (
              <div className="cancel-order-reports-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="cancel-order-reports-no-data">
                No cancelled orders found
                {fromDate || toDate || searchTerm || salesmanFilter !== "all"
                  ? " matching your filters"
                  : ""}
              </div>
            ) : (
              <>
                <div className="cancel-order-reports-count-summary">
                  Total Cancelled: <strong>{filteredOrders.length}</strong>
                </div>

                <TableScrollSync>
                  <div className="cancel-order-reports-table-wrapper">
                    <table className="cancel-order-reports-data-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Ordered Qty</th>
                          <th>Order Value</th>
                          <th>Payment</th>
                          <th>Cancelled By</th>
                          <th>Cancelled On</th>
                          <th>Order Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => {
                          const totalOrdered =
                            order.orderItems?.reduce(
                              (sum, item) => sum + item.orderedQuantity,
                              0
                            ) || 0;
                          const orderValue = getOrderValue(order).toFixed(2);

                          return (
                            <tr key={order._id}>
                              <td>{pagination.showingFrom + index}</td>

                              <td>
                                <button
                                  type="button"
                                  className="cancel-order-reports-orderid-link"
                                  onClick={() => setViewProductsOrder(order)}
                                  title="View ordered products"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>

                              <td>{order.customer?.name || "N/A"}</td>
                              <td>{totalOrdered}</td>

                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <img
                                    src={DirhamSymbol}
                                    alt="AED"
                                    width={15}
                                    height={15}
                                  />
                                  <span>{orderValue}</span>
                                </div>
                              </td>

                              <td>
                                <span
                                  className={`cancel-order-reports-payment-badge cancel-order-reports-payment-${order.payment || "cash"}`}
                                >
                                  {order.payment === "credit" ? "Credit" : "Cash"}
                                </span>
                              </td>

                              <td>{order.cancelledBy?.username || "N/A"}</td>
                              <td>
                                {order.cancelledAt
                                  ? formatDate(order.cancelledAt)
                                  : "N/A"}
                              </td>
                              <td>{formatDate(order.orderDate)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TableScrollSync>

                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.totalRecords}
                  showingFrom={pagination.showingFrom}
                  showingTo={pagination.showingTo}
                  canPrev={pagination.canPrev}
                  canNext={pagination.canNext}
                  onPrev={pagination.goPrev}
                  onNext={pagination.goNext}
                />
              </>
            )}
          </div>
        </div>
      </main>

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
        />
      )}
    </div>
  );
};

export default CancelOrderReports;
