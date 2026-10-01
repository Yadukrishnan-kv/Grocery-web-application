import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./PackOrders.css";

import toast from "../../../utils/toast";
import axios from "axios";
import SlipDownloadModal from "../../../components/SlipDownloadModal/SlipDownloadModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";
import { downloadThermalSlip, downloadPDFSlip } from "../../../utils/packingSlip";
import OrderProductsModal from "../../../components/common/OrderProductsModal";
import DeliveryPartnerAssignCell from "../../../components/common/DeliveryPartnerAssignCell";

import TableScrollSync from "../../../components/common/TableScrollSync";


const PackOrders = () => {
  const orderDataRef = useRef({});
  
  // Thermal Paper PDF Handler (80mm width ~ 226pt) — shared with Remaining
  // Pack Orders so both pages render the identical slip.
  const handleDownloadThermalPDF = (orderId) => {
    downloadThermalSlip(orderDataRef.current[orderId]);
  };

  // Standard A4 PDF Slip Handler - Table layout — shared with Remaining
  // Pack Orders so both pages render the identical slip.
  const handleDownloadPDFSlip = (orderId) => {
    downloadPDFSlip(orderDataRef.current[orderId]);
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
  const [viewProductsOrder, setViewProductsOrder] = useState(null);
  const [deliveryPartners, setDeliveryPartners] = useState([]);
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
      fetchPendingOrders();
    } catch (error) {
      console.error("Error assigning delivery partner:", error);
      toast.error(error.response?.data?.message || "Failed to assign delivery partner. Please try again.");
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchPendingOrders();
    fetchDeliveryPartners();
    const interval = setInterval(fetchPendingOrders, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchCurrentUser, fetchPendingOrders, fetchDeliveryPartners]);

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
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Total Ordered</th>
                          <th>Packed Qty</th>
                          <th>Status</th>
                          <th>Order Date</th>
                          <th>Delivery After</th>
                          <th>Delivery Partner</th>
                          <th>Actions</th>
                          <th>Pack</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => (
                          <tr key={order._id}>
                            <td>{pagination.showingFrom + index}</td>
                            <td>
                              <button
                                type="button"
                                className="order-list-orderid-link"
                                onClick={() => setViewProductsOrder(order)}
                                title="View ordered products"
                              >
                                {order.orderId || order._id}
                              </button>
                            </td>
                            <td>{order.customer?.name || "N/A"}</td>

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

                            <td>
                              <DeliveryPartnerAssignCell
                                order={order}
                                deliveryPartners={deliveryPartners}
                                onAssign={handleAssignDeliveryPartner}
                              />
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
        <div className="pack-orders-modal-overlay" onClick={closeModal}>
          <div className="pack-orders-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pack-orders-modal-header">
              <h3 className="pack-orders-modal-title">
                Pack Order #{selectedOrder.orderId || selectedOrder._id.toString().slice(-8)}
              </h3>
              <p className="pack-orders-modal-subtitle">
                Customer: <strong>{selectedOrder.customer?.name || "N/A"}</strong>
              </p>
            </div>

            <div className="pack-orders-modal-items">
              {selectedOrder.orderItems.map((item) => {
                const max = getMaxPackable(item);
                const already = item.packedQuantity || 0;
                const fullyPacked = max === 0;
                return (
                  <div key={item._id} className="pack-orders-modal-item-row">
                    <div className="pack-orders-modal-item-details">
                      <span className="pack-orders-modal-item-name">
                        {item.product?.productName || "Unknown"}
                      </span>
                      <div className="pack-orders-modal-item-meta">
                        <span>Ordered: <strong>{item.orderedQuantity} {item.unit}</strong></span>
                        <span>Already packed: <strong>{already} {item.unit}</strong></span>
                        <span className="pack-orders-modal-item-remaining">
                          Remaining: <strong>{max} {item.unit}</strong>
                        </span>
                      </div>
                    </div>

                    {fullyPacked ? (
                      <span className="pack-orders-modal-fully-packed-badge">Fully Packed ✓</span>
                    ) : (
                      <div className="pack-orders-modal-qty">
                        <label htmlFor={`pack-qty-${item._id}`}>Pack Now</label>
                        <div className="pack-orders-modal-qty-input-wrap">
                          <input
                            id={`pack-qty-${item._id}`}
                            type="number"
                            min="0"
                            max={max}
                            step="any"
                            value={packInputs[item._id] ?? ""}
                            onChange={(e) => handlePackQtyChange(item._id, e.target.value)}
                            className="pack-orders-modal-qty-input"
                          />
                          <span className="pack-orders-modal-qty-max">/ {max}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pack-orders-modal-footer">
              <button className="pack-orders-modal-cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="pack-orders-modal-submit-btn"
                onClick={submitPacking}
                disabled={processing}
              >
                {processing ? "Submitting..." : "Submit Packing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
        />
      )}
    </div>
  );
};

export default PackOrders;