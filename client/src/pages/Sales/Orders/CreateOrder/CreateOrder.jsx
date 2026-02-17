// src/pages/Orders/CreateOrder/CreateOrder.jsx (Admin version)
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../../components/layout/Header/Header";
import Sidebar from "../../../../components/layout/Sidebar/Sidebar";
import "./CreateOrder.css";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const CreateOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    customerId: "",
    payment: "credit",
    remarks: "",
    orderItems: [{ productId: "", orderedQuantity: "" }],
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/getallcustomers`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCustomers(response.data);
    } catch (error) {
      toast.error("Failed to load customers");
    }
  }, [backendUrl]);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/products/getallproducts`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setProducts(response.data);
    } catch (error) {
      toast.error("Failed to load products");
    }
  }, [backendUrl]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  useEffect(() => {
    fetchCustomers();
    fetchProducts();
    fetchCurrentUser();
  }, [fetchCustomers, fetchProducts, fetchCurrentUser]);

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      orderItems: [...prev.orderItems, { productId: "", orderedQuantity: "" }],
    }));
  };

  const removeItem = (index) => {
    if (formData.orderItems.length === 1) return;
    setFormData((prev) => ({
      ...prev,
      orderItems: prev.orderItems.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.orderItems];
    newItems[index][field] = value;
    setFormData((prev) => ({ ...prev, orderItems: newItems }));
  };

  const handleCustomerChange = (e) => {
    const selectedCustomerId = e.target.value;
    const selectedCustomer = customers.find(
      (c) => c._id === selectedCustomerId
    );

    const defaultPayment = selectedCustomer?.paymentMethod || 
                          selectedCustomer?.defaultPayment || 
                          "credit";

    setFormData({
      ...formData,
      customerId: selectedCustomerId,
      payment: defaultPayment,
    });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.customerId) newErrors.customerId = "Customer is required";
    if (!formData.payment) newErrors.payment = "Payment method is required";

    formData.orderItems.forEach((item, index) => {
      if (!item.productId) {
        newErrors[`orderItems.${index}.productId`] = "Product is required";
      }
      if (
        !item.orderedQuantity ||
        isNaN(item.orderedQuantity) ||
        parseInt(item.orderedQuantity) < 1
      ) {
        newErrors[`orderItems.${index}.orderedQuantity`] =
          "Valid quantity ≥ 1 required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const submitData = {
        customerId: formData.customerId,
        payment: formData.payment,
        remarks: formData.remarks.trim(),
        orderItems: formData.orderItems.map((item) => ({
          productId: item.productId,
          orderedQuantity: parseInt(item.orderedQuantity),
        })),
      };

      await axios.post(`${backendUrl}/api/orders/createorder`, submitData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("Order created successfully!");
      setTimeout(() => navigate("/order/list"), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create order");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) return <div className="order-loading">Loading...</div>;

  return (
    <div className="order-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Orders"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main
        className={`order-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="order-form-card">
          <h1>Create New Order</h1>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Customer</label>
              <select
                value={formData.customerId}
                onChange={handleCustomerChange}
              >
                <option value="">Select Customer</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="error-text">{errors.customerId}</p>
              )}
            </div>

            <div className="form-group">
              <label>
                Payment Method 
                {formData.customerId && (
                  <span className="auto-fetch-badge"> of Customer</span>
                )}
              </label>
              <select
                value={formData.payment}
                onChange={(e) =>
                  setFormData({ ...formData, payment: e.target.value })
                }
                disabled={!!formData.customerId}
                className={formData.customerId ? "auto-filled" : ""}
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
              {errors.payment && <p className="error-text">{errors.payment}</p>}
            </div>

            <h3>Order Items</h3>
            {formData.orderItems.map((item, index) => (
              <div key={index} className="order-item-row">
                <select
                  value={item.productId}
                  onChange={(e) =>
                    handleItemChange(index, "productId", e.target.value)
                  }
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.productName} - AED {p.price.toFixed(2)} / {p.unit}
                      {/* Removed stock display */}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  placeholder="Quantity"
                  value={item.orderedQuantity}
                  onChange={(e) =>
                    handleItemChange(index, "orderedQuantity", e.target.value)
                  }
                />

                {formData.orderItems.length > 1 && (
                  <button
                    type="button"
                    className="remove-item-btn"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            <button type="button" className="add-item-btn" onClick={addItem}>
              + Add Another Product
            </button>

            <div className="form-group">
              <label>Remarks (Optional)</label>
              <textarea
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                rows="3"
              />
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Order"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateOrder;