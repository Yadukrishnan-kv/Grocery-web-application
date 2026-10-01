import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "../../../utils/toast";
import axios from "axios";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./RemainingPackOrders.css";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";
import SlipDownloadModal from "../../../components/SlipDownloadModal/SlipDownloadModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";
import { downloadThermalSlip, downloadPDFSlip } from "../../../utils/packingSlip";
import OrderProductsModal from "../../../components/common/OrderProductsModal";
import DeliveryPartnerAssignCell from "../../../components/common/DeliveryPartnerAssignCell";

// The slip for this page should reflect what's actually left to pack, not
// the full ordered quantity — same rendering as the Pack Orders slip, just
// fed the remaining quantity and skipping items that have nothing left.
const remainingQty = (item) => item.orderedQuantity - (item.packedQuantity || 0);
const hasRemaining = (item) => remainingQty(item) > 0;

const RemainingPackOrders = () => {
  const orderDataRef = useRef({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("Remaining Pack Orders");
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [pendingSlipData, setPendingSlipData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [packInputs, setPackInputs] = useState({});
  const [processing, setProcessing] = useState(false);
  const [viewProductsOrder, setViewProductsOrder] = useState(null);
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const handleDownloadThermalPDF = (orderId) => {
    downloadThermalSlip(orderDataRef.current[orderId], { getQty: remainingQty, filterItem: hasRemaining });
  };

  const handleDownloadPDFSlip = (orderId) => {
    downloadPDFSlip(orderDataRef.current[orderId], { getQty: remainingQty, filterItem: hasRemaining });
  };

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

  const fetchRemainingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/orders/remaining-for-packing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching remaining orders:", error);
      toast.error("Failed to load remaining orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partners = response.data.filter((u) => u.role === "Delivery Man");
      setDeliveryPartners(partners);
    } catch (error) {
      console.error("Error fetching delivery partners:", error);
    }
  }, [backendUrl]);

  const handleAssignDeliveryPartner = async (orderId, deliveryManId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/assign/${orderId}`,
        { deliveryManId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Delivery partner assigned successfully!");
      fetchRemainingOrders();
    } catch (error) {
      console.error("Error assigning delivery partner:", error);
      toast.error(error.response?.data?.message || "Failed to assign delivery partner. Please try again.");
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchRemainingOrders();
    fetchDeliveryPartners();
    const interval = setInterval(fetchRemainingOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchCurrentUser, fetchRemainingOrders, fetchDeliveryPartners]);

  const openPackModal = (order) => {
    const inputs = {};
    order.orderItems.forEach((item) => {
      inputs[item._id] = 0;
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
        product: item._id,
        packedQuantity: Number(packInputs[item._id] || 0),
      }))
      .filter((p) => p.packedQuantity > 0);

    if (packedItems.length === 0) {
      return toast.error("Please pack at least one item");
    }

    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/pack/${selectedOrder._id}`,
        { packedItems },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Remaining packing submitted successfully!");
      setSelectedOrder(null);
      setPackInputs({});
      fetchRemainingOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit packing");
    } finally {
      setProcessing(false);
    }
  };

  const downloadUnifiedInvoice = async (orderId, invoiceNumber, type = "normal") => {
    if (!invoiceNumber) {
      toast.error("No invoice number available for this order yet");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/unified-invoice/${orderId}?invoiceNumber=${invoiceNumber}&type=${type}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );
      // Open the print dialog instead of downloading
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      };

      toast.success(`Opening print dialog for invoice ${invoiceNumber}`);
    } catch (err) {
      console.error("Invoice download failed:", err);
      toast.error("Failed to download invoice");
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
      return matchesSearch;
    });
  }, [orders, searchTerm]);

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(filteredOrders, entriesPerPage, `${searchTerm}`);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Only show items that still have quantity left to pack in the Pack Remaining modal
  const packModalItems = selectedOrder
    ? selectedOrder.orderItems.filter(hasRemaining)
    : [];

  if (!user) return <div className="loading">Loading user data...</div>;

  return (
    <div className="remaining-pack-layout">
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

      <main className={`remaining-pack-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="remaining-pack-container-wrapper">
          <div className="remaining-pack-container">
            <div className="remaining-pack-header-section">
              <h2 className="remaining-pack-page-title">Remaining Pack Orders</h2>

              <div className="remaining-pack-search-container">
                <input
                  type="text"
                  className="remaining-pack-search-input"
                  placeholder="Search by customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="remaining-pack-loading">Loading remaining orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="remaining-pack-no-data">No remaining orders to pack</div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="remaining-pack-table-wrapper">
                    <table className="remaining-pack-data-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Total Ordered</th>
                          <th>Packed Qty</th>
                          <th>Remaining Qty</th>
                          <th>Status</th>
                          <th>Order Date</th>
                          <th>Delivery After</th>
                          <th>Delivery Partner</th>
                          <th>Actions</th>
                          <th>Slip</th>
                          <th>Remaining Pack</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => {
                          const totalPacked = order.orderItems?.reduce(
                            (sum, i) => sum + (i.packedQuantity || 0),
                            0
                          ) || 0;
                          const totalOrdered = order.totalOrderedQuantity || 0;
                          const totalRemaining = totalOrdered - totalPacked;

                          return (
                            <tr key={order._id}>
                              <td>{pagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="order-list-orderid-link"
                                   onClick={() => setViewProductsOrder(order)}
                                   title="View remaining products to pack"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>
                              <td>{order.customer?.name || "N/A"}</td>

                              <td>{totalOrdered}</td>
                              <td>{totalPacked}</td>
                              <td className="remaining-qty-cell">
                                <span className="remaining-badge">{totalRemaining}</span>
                              </td>

                              <td>
                                <span className="order-list-status-badge order-list-status-partially_packed">
                                  Partially Packed
                                </span>
                              </td>

                              <td>{formatDate(order.orderDate)}</td>

                              <td>
                                {order.packableAfter
                                  ? formatDate(order.packableAfter)
                                  : <span className="no-invoice-text">Same Day</span>}
                              </td>

                              <td>
                                <DeliveryPartnerAssignCell
                                  order={order}
                                  deliveryPartners={deliveryPartners}
                                  onAssign={handleAssignDeliveryPartner}
                                />
                              </td>

                              <td className="actions-cell">
                                {order.invoiceHistory && order.invoiceHistory.length > 0 ? (
                                  <div className="invoice-buttons-group">
                                    {order.invoiceHistory.map((inv, i) => (
                                      <button
                                        key={i}
                                        className="order-list-icon-button order-list-view-button invoice-btn"
                                        onClick={() => {
                                          setPendingInvoiceData({ orderId: order._id, invoiceNumber: inv.invoiceNumber });
                                          setShowInvoiceModal(true);
                                        }}
                                        title={`Download ${inv.invoiceNumber}`}
                                      >
                                        📄 {inv.invoiceNumber}
                                      </button>
                                    ))}
                                  </div>
                                ) : order.invoiceNumber ? (
                                  <button
                                    className="order-list-icon-button order-list-view-button"
                                    onClick={() => {
                                      setPendingInvoiceData({ orderId: order._id, invoiceNumber: order.invoiceNumber });
                                      setShowInvoiceModal(true);
                                    }}
                                    title={`Download Invoice ${order.invoiceNumber}`}
                                  >
                                    📄 Invoice ({order.invoiceNumber})
                                  </button>
                                ) : null}
                              </td>

                              <td className="actions-cell">
                                <button
                                  className="order-list-icon-button order-list-download-pdf"
                                  onClick={() => {
                                    orderDataRef.current[order._id] = order;
                                    setPendingSlipData({ orderId: order._id });
                                    setShowSlipModal(true);
                                  }}
                                  title="Download packing slip for remaining quantity"
                                >
                                  🖨️ Slip
                                </button>
                              </td>

                              <td className="pack-cell">
                                <button
                                  className="order-list-icon-button order-list-edit-button"
                                  onClick={() => openPackModal(order)}
                                  title="Pack remaining quantity"
                                >
                                  Pack Remaining
                                </button>
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
            downloadUnifiedInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
          }
        }}
      />

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

      {/* Pack Remaining Modal */}
      {selectedOrder && (() => {
        const totalRemainingAcrossItems = packModalItems.reduce(
          (sum, item) => sum + getMaxPackable(item),
          0
        );
        const totalToPackNow = packModalItems.reduce(
          (sum, item) => sum + (Number(packInputs[item._id]) || 0),
          0
        );

        return (
          <div
            className="remaining-pack-modal-overlay"
            onClick={closeModal}
          >
            <div
              className="remaining-pack-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="remaining-pack-modal-header">
                <div>
                  <h3 className="remaining-pack-modal-title">Pack Remaining Quantity</h3>
                  <p className="remaining-pack-modal-subtitle">
                    Order #{selectedOrder.orderId || selectedOrder._id.toString().slice(-8)}
                    {selectedOrder.customer?.name ? ` · ${selectedOrder.customer.name}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="remaining-pack-modal-close"
                  onClick={closeModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {packModalItems.length > 0 && (
                <div className="remaining-pack-modal-summary">
                  <div className="remaining-pack-modal-summary-item">
                    <span className="remaining-pack-modal-summary-value">{packModalItems.length}</span>
                    <span className="remaining-pack-modal-summary-label">Items left</span>
                  </div>
                  <div className="remaining-pack-modal-summary-item">
                    <span className="remaining-pack-modal-summary-value">{totalRemainingAcrossItems}</span>
                    <span className="remaining-pack-modal-summary-label">Remaining qty</span>
                  </div>
                  <div className="remaining-pack-modal-summary-item remaining-pack-modal-summary-highlight">
                    <span className="remaining-pack-modal-summary-value">{totalToPackNow}</span>
                    <span className="remaining-pack-modal-summary-label">Packing now</span>
                  </div>
                </div>
              )}

              <div className="remaining-pack-modal-items">
                {packModalItems.length === 0 ? (
                  <p className="remaining-pack-modal-empty">No remaining products to pack</p>
                ) : (
                  packModalItems.map((item) => {
                    const max = getMaxPackable(item);
                    const already = item.packedQuantity || 0;
                    const currentValue = packInputs[item._id] ?? "";
                    const isFull = max > 0 && Number(currentValue) === max;

                    return (
                      <div
                        key={item._id}
                        className={`remaining-pack-modal-item${isFull ? " is-full" : ""}`}
                      >
                        <div className="remaining-pack-modal-item-details">
                          <strong className="remaining-pack-modal-item-name">
                            {item.product?.productName || "Unknown"}
                          </strong>
                          <div className="remaining-pack-modal-item-meta">
                            <span className="remaining-pack-modal-pill">
                              Ordered {item.orderedQuantity} {item.unit}
                            </span>
                            <span className="remaining-pack-modal-pill">
                              Packed {already} {item.unit}
                            </span>
                            <span className="remaining-pack-modal-pill remaining-pack-modal-pill-highlight">
                              Remaining {max} {item.unit}
                            </span>
                          </div>
                        </div>

                        <div className="remaining-pack-modal-qty">
                          <label className="remaining-pack-modal-qty-label">Pack now</label>
                          <div className="remaining-pack-modal-qty-controls">
                            <input
                              type="number"
                              min="0"
                              max={max}
                              step="any"
                              value={currentValue}
                              onChange={(e) => handlePackQtyChange(item._id, e.target.value)}
                              disabled={max === 0}
                            />
                            <span className="remaining-pack-modal-qty-max">/ {max} {item.unit}</span>
                            <button
                              type="button"
                              className="remaining-pack-modal-qty-max-btn"
                              onClick={() => handlePackQtyChange(item._id, String(max))}
                              disabled={max === 0}
                            >
                              Max
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="remaining-pack-modal-footer">
                <button className="remaining-pack-modal-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  className="remaining-pack-modal-submit-btn"
                  onClick={submitPacking}
                  disabled={processing || totalToPackNow === 0}
                >
                  {processing
                    ? "Submitting..."
                    : totalToPackNow > 0
                    ? `Submit Packing (${totalToPackNow})`
                    : "Submit Packing"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
          filterItem={hasRemaining}
          getQty={remainingQty}
          emptyText="No remaining products to pack"
        />
      )}
    </div>
  );
};

export default RemainingPackOrders;
