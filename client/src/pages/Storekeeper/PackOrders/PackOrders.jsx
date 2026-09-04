import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";

import toast from "../../../utils/toast";
import axios from "axios";
import SlipDownloadModal from "../../../components/SlipDownloadModal/SlipDownloadModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";

import jsPDF from "jspdf";
import TableScrollSync from "../../../components/common/TableScrollSync";


const PackOrders = () => {
  const orderDataRef = useRef({});
  
  // Thermal Paper PDF Handler (80mm width ~ 226pt) - Exact format from HTML
  const handleDownloadThermalPDF = async (orderId) => {
    const order = orderDataRef.current[orderId];
    if (!order) {
      toast.error("Order details not found");
      return;
    }
    try {
      // 80mm thermal paper, 76mm printable area - matches receipt print style
      const MM_TO_PT = 2.834645669;
      const PX_TO_PT = 0.75;
      const paperWidthMM = 80;
      const printableWidthMM = 76;
      const pageWidth = paperWidthMM * MM_TO_PT;
      const margin = ((paperWidthMM - printableWidthMM) / 2) * MM_TO_PT;
      const contentWidth = pageWidth - margin * 2;
      const labelW = 75;
      const titleMarginTop = 15 * PX_TO_PT;
      const orderIdMarginTop = 10 * PX_TO_PT;
      const productsMarginTop = 10 * PX_TO_PT;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: [pageWidth, 1200],
      });

      let y = margin + titleMarginTop;

      const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        return date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      };

      const drawDashedLine = (yPos) => {
        pdf.setLineDashPattern([1, 1], 0);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        pdf.setLineDashPattern([], 0);
        return yPos + 8;
      };

      const printRow = (label, value) => {
        pdf.setFontSize(8).setFont(undefined, "bold");
        pdf.text(label, margin, y, { maxWidth: labelW });
        pdf.setFontSize(8).setFont(undefined, "normal");
        pdf.text(String(value), pageWidth - margin, y, { align: "right" });
        y += 13;
      };

      // ===== TITLE =====
      pdf.setFontSize(13).setFont(undefined, "bold");
      pdf.text("ORDER DETAILS", pageWidth / 2, y, { align: "center" });
      y += 16;

      y = drawDashedLine(y) + orderIdMarginTop;

      // ===== ORDER INFO =====
      const displayedOrderId = order.orderId || order._id;
      printRow("Order ID:", displayedOrderId);
      printRow("Customer:", order.customer?.name || "N/A");
      if (order.customer?.address) {
        pdf.setFontSize(7).setFont(undefined, "normal");
        const addressLines = pdf.splitTextToSize(order.customer.address, contentWidth);
        addressLines.forEach((line) => {
          pdf.text(line, pageWidth - margin, y, { align: "right" });
          y += 10;
        });
      }
      printRow("Order Date:", formatDate(order.orderDate));

      y = drawDashedLine(y + 2) + productsMarginTop;

      // ===== PRODUCTS =====
      pdf.setFontSize(9).setFont(undefined, "bold");
      pdf.text("PRODUCTS", margin, y);
      y += 14;

      (order.orderItems || []).forEach((item) => {
        const productName = item.product?.productName || "Unknown";
        const qty = item.orderedQuantity || 0;
        const unit = item.unit || "";
        const qtyText = `Qty: ${qty}${unit ? ` ${unit}` : ""}`;

        pdf.setFontSize(8).setFont(undefined, "normal");
        const nameLines = pdf.splitTextToSize(`• ${productName}`, contentWidth - 65);

        nameLines.forEach((line, idx) => {
          pdf.setFont(undefined, "normal");
          pdf.text(line, margin, y);
          if (idx === 0) {
            pdf.setFont(undefined, "bold");
            pdf.text(qtyText, pageWidth - margin, y, { align: "right" });
          }
          y += 11;
        });
        y += 2;
      });

      y = drawDashedLine(y);

      // Open the print dialog directly (hidden iframe, no new tab)
      const blobUrl = pdf.output("bloburl");
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      };
      toast.success("Opening print dialog for thermal slip");
    } catch (err) {
      console.error("Thermal PDF error:", err);
      toast.error("Failed to generate thermal slip");
    }
  };

  // Standard A4 PDF Slip Handler - Table layout
  const handleDownloadPDFSlip = async (orderId) => {
    const order = orderDataRef.current[orderId];
    if (!order) {
      toast.error("Order details not found");
      return;
    }
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = 210;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin + 10;

      const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        return date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      };

      // ── Header Section with background ──
      pdf.setFillColor(41, 128, 185);
      pdf.rect(margin, y, contentWidth, 12, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14).setFont(undefined, "bold");
      pdf.text("PACKING SLIP", margin + 5, y + 8);
      y += 18;
      pdf.setTextColor(0, 0, 0);

      // ── Order Info Box ──
      pdf.setFillColor(248, 249, 250);
      pdf.roundedRect(margin, y, contentWidth, 28, 3, 3, "F");
      pdf.setFontSize(10).setFont(undefined, "normal");

      const displayedOrderId = order.orderId || order._id;
      const orderDate = formatDate(order.orderDate);
      const customerName = order.customer?.name || "N/A";

      pdf.setFont(undefined, "bold");
      pdf.text("Order ID:", margin + 5, y + 6);
      pdf.text("Customer:", margin + 5, y + 14);
      pdf.text("Order Date:", margin + 5, y + 22);
      pdf.setFont(undefined, "normal");
      pdf.text(String(displayedOrderId), margin + 35, y + 6);
      pdf.text(customerName, margin + 35, y + 14);
      pdf.text(orderDate, margin + 35, y + 22);
      y += 36;

      // ── Table ──
      const colProduct = margin + 5;
      const colQty = margin + 160;
      const colWProduct = colQty - colProduct - 5;
      const headerH = 8;

      // Table header
      pdf.setFillColor(41, 128, 185);
      pdf.rect(margin, y, contentWidth, headerH, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10).setFont(undefined, "bold");
      pdf.text("Product", colProduct, y + 5.5);
      pdf.text("Qty", colQty, y + 5.5);
      y += headerH;

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9).setFont(undefined, "normal");

      let rowIndex = 0;
      (order.orderItems || []).forEach((item) => {
        const productName = item.product?.productName || "Unknown";
        const qty = item.orderedQuantity || 0;

        const lines = pdf.splitTextToSize(productName, colWProduct);
        const rowH = Math.max(lines.length * 5 + 2, 8);

        if (y + rowH > 285) {
          pdf.addPage();
          y = margin + 10;
          // Repeat header on new page
          pdf.setFillColor(41, 128, 185);
          pdf.rect(margin, y, contentWidth, headerH, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(10).setFont(undefined, "bold");
          pdf.text("Product", colProduct, y + 5.5);
          pdf.text("Qty", colQty, y + 5.5);
          y += headerH;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9).setFont(undefined, "normal");
        }

        // Row background alternation
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(242, 244, 246);
          pdf.rect(margin, y, contentWidth, rowH, "F");
        }

        pdf.text(lines, colProduct, y + 4);
        pdf.text(String(qty), colQty, y + 4);
        y += rowH + 1;
        rowIndex++;
      });

      // Bottom line
      pdf.setDrawColor(41, 128, 185);
      pdf.line(margin, y, margin + contentWidth, y);

      // Open the print dialog directly (hidden iframe, no new tab)
      const blobUrl = pdf.output("bloburl");
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      };
      toast.success("Opening print dialog for PDF slip");
    } catch (err) {
      console.error("PDF slip error:", err);
      toast.error("Failed to generate PDF slip");
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("Pack Orders");
  const [user, setUser] = useState(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [pendingSlipData, setPendingSlipData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [packInputs, setPackInputs] = useState({});
  const [processing, setProcessing] = useState(false);
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

  const fetchPendingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/orders/pending-for-packing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      toast.error("Failed to load orders to pack");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchPendingOrders();
    const interval = setInterval(fetchPendingOrders, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchCurrentUser, fetchPendingOrders]);

  const openPackModal = (order) => {
    const inputs = {};
    order.orderItems.forEach((item) => {
      inputs[item._id] = item.packedQuantity || 0; // show already packed as default
    });
    setSelectedOrder(order);
    setPackInputs(inputs);
  };

  const handlePackQtyChange = (itemId, value) => {
    if (value === "" || (!isNaN(value) && Number(value) >= 0)) {
      setPackInputs((prev) => ({ ...prev, [itemId]: value }));
    }
  };

  const getMaxPackable = (item) => {
    return item.orderedQuantity - (item.packedQuantity || 0);
  };

  const submitPacking = async () => {
    if (!selectedOrder) return;

    const packedItems = selectedOrder.orderItems
      .map((item) => ({
        product: item._id,                    // important: send orderItem _id
        packedQuantity: Number(packInputs[item._id] || 0),
      }))
      .filter((p) => p.packedQuantity > 0);

    if (packedItems.length === 0) {
      return toast.error("Please pack at least one item");
    }

    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${backendUrl}/api/orders/pack/${selectedOrder._id}`,
        { packedItems },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.returnCreditUsed && res.data.returnCreditUsed > 0) {
        toast.success(
          `Return credit of AED ${res.data.returnCreditUsed.toFixed(2)} was applied to this order.`,
          { duration: 5000 }
        );
      }
      toast.success("Packing submitted successfully!");
      setSelectedOrder(null);
      setPackInputs({});
      fetchPendingOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit packing");
    } finally {
      setProcessing(false);
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setPackInputs({});
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (order.customer?.name &&
          order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" ||
        (order.packedStatus &&
          order.packedStatus.toLowerCase() === statusFilter.toLowerCase());

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredOrders,
    entriesPerPage,
    `${statusFilter}|${searchTerm}`
  );

  const clearSearch = () => setSearchTerm("");

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (!user) return <div className="loading">Loading user data...</div>;

  return (
    <div className="order-list-layout">
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

      <main className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Pack Orders</h2>

              <div className="order-list-controls-group">
                <label htmlFor="statusFilter" className="order-list-filter-label">
                  Filter by Packing Status:
                </label>
                <select
                  id="statusFilter"
                  className="order-list-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="not_packed">Not Packed</option>
                  <option value="partially_packed">Partially Packed</option>
                  <option value="fully_packed">Fully Packed</option>
                </select>

                <div className="order-list-search-container">
                  <input
                    type="text"
                    className="order-list-search-input"
                    placeholder="Search by customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button className="order-list-search-clear" onClick={clearSearch}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="order-list-loading">Loading orders to pack...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-list-no-data">No orders found</div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="order-list-table-wrapper">
                    <table className="order-list-data-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Customer</th>
                          <th>Products</th>
                          <th>Total Ordered</th>
                          <th>Packed Qty</th>
                          <th>Status</th>
                          <th>Order Date</th>
                          <th>Delivery After</th>
                          <th>Actions</th>
                          <th>Pack</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => (
                          <tr key={order._id}>
                            <td>{pagination.showingFrom + index}</td>
                            <td>{order.customer?.name || "N/A"}</td>

                            <td className="products-cell">
                              {order.orderItems?.length > 0 ? (
                                <div className="products-list">
                                  {order.orderItems.map((item, i) => (
                                    <div key={i} className="product-tag">
                                      <span className="product-name">
                                        {item.product?.productName || "Unknown"}
                                      </span>
                                      <span className="product-qty">× {item.orderedQuantity}</span>
                                      <span className="product-unit">{item.unit || ""}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="no-products">No products</span>
                              )}
                            </td>

                            <td>{order.totalOrderedQuantity || 0}</td>
                            <td>
                              {order.orderItems?.reduce(
                                (sum, i) => sum + (i.packedQuantity || 0),
                                0
                              ) || 0}
                            </td>

                            <td>
                              <span
                                className={`order-list-status-badge order-list-status-${
                                  order.packedStatus?.toLowerCase() || "not_packed"
                                }`}
                              >
                                {order.packedStatus === "fully_packed"
                                  ? "Fully Packed"
                                  : order.packedStatus === "partially_packed"
                                  ? "Partially Packed"
                                  : "Not Packed"}
                              </span>
                            </td>

                            <td>{formatDate(order.orderDate)}</td>

                            <td>
                              {order.packableAfter
                                ? formatDate(order.packableAfter)
                                : <span className="no-invoice-text">Same Day</span>}
                            </td>

                            <td className="actions-cell">
                              {/* Packing Slip button */}
                              <button
                                className="order-list-icon-button order-list-download-pdf"
                                onClick={() => {
                                  orderDataRef.current[order._id] = order;
                                  setPendingSlipData({ orderId: order._id });
                                  setShowSlipModal(true);
                                }}
                                title="Download packing slip"
                              >
                                🖨️ Slip
                              </button>
                            </td>

                            <td className="pack-cell">
                              <button
                                className="order-list-icon-button order-list-edit-button"
                                onClick={() => openPackModal(order)}
                                disabled={order.packedStatus === "fully_packed"}
                                title={
                                  order.packedStatus === "fully_packed"
                                    ? "Order already fully packed"
                                    : "Pack / Add more quantity"
                                }
                              >
                                {order.packedStatus === "fully_packed" ? "Packed ✓" : "Pack"}
                              </button>
                            </td>
                          </tr>
                        ))}
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

      <SlipDownloadModal
        isOpen={showSlipModal}
        onClose={() => setShowSlipModal(false)}
        onSelect={(type) => {
          setShowSlipModal(false);
          if (pendingSlipData) {
            if (type === "thermal") {
              handleDownloadThermalPDF(pendingSlipData.orderId);
            } else {
              handleDownloadPDFSlip(pendingSlipData.orderId);
            }
          }
        }}
      />

      {/* Packing Modal */}
      {selectedOrder && (
        <div className="modal-overlay">
          <div className="pack-modal">
            <h3>Pack Order #{selectedOrder._id.toString().slice(-8)}</h3>
            <p>Customer: {selectedOrder.customer?.name || "N/A"}</p>

            <div className="pack-items">
              {selectedOrder.orderItems.map((item) => {
                const max = getMaxPackable(item);
                const already = item.packedQuantity || 0;
                return (
                  <div key={item._id} className="pack-item-row">
                    <div className="item-details">
                      <strong>{item.product?.productName || "Unknown"}</strong>
                      <div>Ordered: {item.orderedQuantity} {item.unit}</div>
                      <div>Already packed: {already} {item.unit}</div>
                      <div className="remaining">Remaining to pack: {max} {item.unit}</div>
                    </div>

                    <div className="pack-qty">
                      <label>Pack Now:</label>
                      <input
                        type="number"
                        min="0"
                        max={max}
                        step="any"
                        value={packInputs[item._id] ?? ""}
                        onChange={(e) => handlePackQtyChange(item._id, e.target.value)}
                        disabled={max === 0}
                      />
                      <span className="max-text">/ {max}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <button className="cancel" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="submit"
                onClick={submitPacking}
                disabled={processing}
              >
                {processing ? "Submitting..." : "Submit Packing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackOrders;