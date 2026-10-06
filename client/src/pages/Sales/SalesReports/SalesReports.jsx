// src/pages/Sales/SalesReports/SalesReports.jsx
// Invoice-level sales report: same data source as OrderReports, but each
// packing invoice (order.invoiceHistory entry) is its own row instead of
// each row being a whole order — an order with 2 invoices shows as 2 rows.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./SalesReports.css";
import axios from "axios";
import toast from "../../../utils/toast";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";
import OrderProductsModal from "../../../components/common/OrderProductsModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";
import { exportToExcel, formatDateForExcel } from "../../../utils/exportToExcel";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partial_delivered", label: "Partial Delivered" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

// Delivery invoice numbers look like "DDFT/<sequence>/<yearSuffix>" — the
// sequence increments globally, so sorting on it (not the raw string)
// restores chronological/ascending order even across a year rollover.
const parseInvoiceSortKey = (invoiceNumber) => {
  const match = /^DDFT\/(\d+)\/(\d+)$/.exec(invoiceNumber || "");
  if (!match) return { year: 0, sequence: 0, raw: invoiceNumber || "" };
  return { year: parseInt(match[2], 10), sequence: parseInt(match[1], 10), raw: invoiceNumber || "" };
};

const compareInvoiceNumbers = (a, b) => {
  const keyA = parseInvoiceSortKey(a);
  const keyB = parseInvoiceSortKey(b);
  if (keyA.year !== keyB.year) return keyA.year - keyB.year;
  if (keyA.sequence !== keyB.sequence) return keyA.sequence - keyB.sequence;
  return keyA.raw.localeCompare(keyB.raw);
};

const SalesReports = () => {
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Sales Reports");
  const [user, setUser] = useState(null);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [viewProductsRow, setViewProductsRow] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  // ───────────────────────── Build one row per invoice ─────────────────────────
  const invoiceRows = useMemo(() => {
    const rows = [];
    allOrders.forEach((order) => {
      if (!order.invoiceHistory || order.invoiceHistory.length === 0) return;

      // Map productId -> populated product doc, sourced from the order's own
      // items (invoiceHistory.items only stores the raw product ObjectId).
      const productMap = {};
      (order.orderItems || []).forEach((oi) => {
        const pid = String(oi.product?._id || oi.product || "");
        if (pid) productMap[pid] = oi.product;
      });

      order.invoiceHistory.forEach((hist) => {
        const items = (hist.items || []).map((it) => ({
          ...it,
          productDetails: productMap[String(it.product?._id || it.product)] || null,
        }));
        const totalOrderedQty = items.reduce((s, it) => s + (it.quantity || 0), 0);
        const totalDeliveredQty = items.reduce((s, it) => s + (it.deliveredQuantity || 0), 0);

        // Whoever personally delivered THIS invoice, sourced from
        // deliveredInvoiceHistory (matched by invoiceNumber) — not the
        // order's current assignedTo, which may have moved on to a
        // different partner for a later packing round.
        const deliveryEntries = (order.deliveredInvoiceHistory || []).filter(
          (d) => d.invoiceNumber === hist.invoiceNumber
        );
        const deliveryManName = deliveryEntries.length > 0
          ? [...new Set(deliveryEntries.map((d) => d.deliveredBy?.username || "Unknown"))].join(", ")
          : null;
        const deliveredAt = deliveryEntries.length > 0 ? deliveryEntries[0].createdAt : null;

        rows.push({
          key: `${order._id}-${hist.invoiceNumber}`,
          order,
          invoiceNumber: hist.invoiceNumber,
          createdAt: hist.createdAt,
          items,
          totalOrderedQty,
          totalDeliveredQty,
          deliveryManName,
          deliveredAt,
          grandTotal: hist.amount || 0,
        });
      });
    });
    return rows;
  }, [allOrders]);

  const itemMatchesSearch = useCallback(
    (item, term) =>
      item.productDetails?.productName?.toLowerCase().includes(term) ||
      item.productDetails?.CategoryName?.toLowerCase().includes(term) ||
      item.productDetails?.subCategoryName?.toLowerCase().includes(term),
    []
  );

  const rowMatchesFilters = useCallback(
    (row) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        row.invoiceNumber?.toLowerCase().includes(term) ||
        row.order.customer?.name?.toLowerCase().includes(term) ||
        row.items.some((item) => itemMatchesSearch(item, term));

      let matchesDate = true;
      const invoiceDate = new Date(row.createdAt);
      invoiceDate.setHours(0, 0, 0, 0);

      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && invoiceDate >= start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && invoiceDate <= end;
      }

      const matchesSalesman =
        salesmanFilter === "all" ||
        row.order.customer?.salesman?._id === salesmanFilter ||
        row.order.customer?.salesman === salesmanFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (row.order.status &&
          row.order.status.toLowerCase() === statusFilter.toLowerCase());

      return matchesSearch && matchesDate && matchesSalesman && matchesStatus;
    },
    [searchTerm, fromDate, toDate, salesmanFilter, statusFilter, itemMatchesSearch]
  );

  const filteredRows = useMemo(
    () =>
      invoiceRows
        .filter(rowMatchesFilters)
        .sort((a, b) => compareInvoiceNumbers(a.invoiceNumber, b.invoiceNumber)),
    [invoiceRows, rowMatchesFilters]
  );

  const filteredQtyTotal = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase().trim();
    let sum = 0;
    filteredRows.forEach((row) => {
      row.items.forEach((item) => {
        if (itemMatchesSearch(item, term)) sum += item.deliveredQuantity || 0;
      });
    });
    return sum;
  }, [filteredRows, searchTerm, itemMatchesSearch]);

  const resetFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
    setStatusFilter("all");
    setSalesmanFilter("all");
  };

  const downloadInvoice = async (orderId, invoiceNumber, type = "normal") => {
    const key = `${orderId}-${invoiceNumber}`;
    setDownloadingKey(key);
    try {
      const token = localStorage.getItem("token");
      const url = `${backendUrl}/api/orders/unified-invoice/${orderId}?invoiceNumber=${encodeURIComponent(invoiceNumber)}&type=${type}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      const suffix = type === "preprinted" ? "-preprinted" : "";
      link.setAttribute("download", `invoice-${invoiceNumber}${suffix}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`Invoice ${invoiceNumber} downloaded`);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast.error("Failed to download invoice");
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleExportToExcel = () => {
    const exportData = filteredRows.map((row, index) => ({
      "No": index + 1,
      "Invoice Number": row.invoiceNumber,
      "Customer": row.order.customer?.name || "N/A",
      "Total Ordered Qty": row.totalOrderedQty,
      "Total Delivered Qty": row.totalDeliveredQty,
      "Grand Total (AED)": row.grandTotal.toFixed(2),
      "Delivery Man": row.deliveryManName || "Not delivered yet",
      "Delivered At": row.deliveredAt ? formatDateTime(row.deliveredAt) : "N/A",
      "Invoice Date": formatDateForExcel(row.createdAt),
    }));
    exportToExcel(exportData, "SalesReports", "Sales Reports");
    toast.success("Excel file exported successfully");
  };

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredRows,
    entriesPerPage,
    `${searchTerm}|${fromDate}|${toDate}|${statusFilter}|${salesmanFilter}`
  );

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${day}/${month}/${year} ${time}`;
  };

  if (!user) {
    return <div className="sales-reports-loading">Loading...</div>;
  }

  const hasActiveFilters =
    fromDate || toDate || searchTerm || statusFilter !== "all" || salesmanFilter !== "all";

  return (
    <div className="sales-reports-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`sales-reports-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sales-reports-container-wrapper">
          <div className="sales-reports-container">
            <div className="sales-reports-header-section">
              <h2 className="sales-reports-page-title">Sales Reports</h2>

              <div className="sales-reports-controls-group">
                <div className="sales-reports-date-group">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="sales-reports-date-input"
                  />
                </div>

                <div className="sales-reports-date-group">
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="sales-reports-date-input"
                  />
                </div>

                <label htmlFor="salesReportsStatusFilter" className="sales-reports-filter-label">
                  Filter by Order Status:
                </label>
                <select
                  id="salesReportsStatusFilter"
                  className="sales-reports-salesman-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter orders by status"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>

                {user?.role !== "Sales man" && (
                  <select
                    className="sales-reports-salesman-filter"
                    value={salesmanFilter}
                    onChange={(e) => setSalesmanFilter(e.target.value)}
                    aria-label="Filter orders by salesman"
                  >
                    <option value="all">All Salesmen</option>
                    {salesmen.map((s) => (
                      <option key={s._id} value={s._id}>{s.username}</option>
                    ))}
                  </select>
                )}

                <div className="sales-reports-search-container">
                  <input
                    type="text"
                    className="sales-reports-search-input"
                    placeholder="Search by customer, product, category or sub-category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="sales-reports-search-clear"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button className="sales-reports-reset-button" onClick={resetFilters}>
                  Reset Filters
                </button>

                <button
                  className="sales-reports-refresh-button"
                  onClick={handleExportToExcel}
                  disabled={loading || filteredRows.length === 0}
                  title="Export to Excel"
                >
                  Export Excel
                </button>
              </div>
            </div>

            {loading ? (
              <div className="sales-reports-loading">Loading sales reports...</div>
            ) : filteredRows.length === 0 ? (
              <div className="sales-reports-no-data">
                No invoices found{hasActiveFilters ? " matching your filters" : ""}
              </div>
            ) : (
              <>
                {filteredQtyTotal !== null && (
                  <div className="sales-reports-qty-summary">
                    Total Delivered Qty: <strong>{filteredQtyTotal}</strong>
                  </div>
                )}

                <TableScrollSync>
                  <div className="sales-reports-table-wrapper">
                    <table className="sales-reports-data-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Invoice Number</th>
                          <th>Customer</th>
                          <th>Total Ordered Qty</th>
                          <th>Total Delivered Qty</th>
                          <th>Grand Total</th>
                          <th>Delivery Man</th>
                          <th>Time</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((row, index) => {
                          const key = `${row.order._id}-${row.invoiceNumber}`;
                          return (
                            <tr key={row.key}>
                              <td>{pagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="sales-reports-orderid-link"
                                  onClick={() => setViewProductsRow(row)}
                                  title="View invoice items"
                                >
                                  {row.invoiceNumber}
                                </button>
                              </td>
                              <td>{row.order.customer?.name || "N/A"}</td>
                              <td>{row.totalOrderedQty}</td>
                              <td>{row.totalDeliveredQty}</td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <img src={DirhamSymbol} alt="AED" width={15} height={15} />
                                  <span>{row.grandTotal.toFixed(2)}</span>
                                </div>
                              </td>
                              <td>{row.deliveryManName || "Not delivered yet"}</td>
                              <td>{row.deliveredAt ? formatDateTime(row.deliveredAt) : "N/A"}</td>
                              <td>
                                <div className="sales-reports-action-buttons">
                                  <button
                                    className="sales-reports-invoice-button delivered"
                                    onClick={() => {
                                      setPendingInvoiceData({ orderId: row.order._id, invoiceNumber: row.invoiceNumber });
                                      setShowInvoiceModal(true);
                                    }}
                                    disabled={downloadingKey === key}
                                  >
                                    {downloadingKey === key ? "Downloading..." : "🧾 Download"}
                                  </button>
                                </div>
                              </td>
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

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          if (pendingInvoiceData) {
            downloadInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
          }
        }}
      />

      {viewProductsRow && (
        <OrderProductsModal
          order={{
            orderId: viewProductsRow.invoiceNumber,
            orderItems: viewProductsRow.items.map((it) => ({
              product: it.productDetails,
              orderedQuantity: it.quantity,
              unit: it.productDetails?.unit || "",
            })),
          }}
          onClose={() => setViewProductsRow(null)}
        />
      )}
    </div>
  );
};

export default SalesReports;
