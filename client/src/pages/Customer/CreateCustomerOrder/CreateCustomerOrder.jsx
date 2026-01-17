// src/pages/Customer/Orders/CreateCustomerOrder.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateCustomerOrder.css';
import axios from 'axios';

const CreateCustomerOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    orderedQuantity: '',
    payment: 'credit'
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

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

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/products/getallproducts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }, [backendUrl]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.productId) {
      newErrors.productId = 'Product is required';
    }

    if (!formData.orderedQuantity || isNaN(formData.orderedQuantity) || parseInt(formData.orderedQuantity) < 1) {
      newErrors.orderedQuantity = 'Valid ordered quantity is required';
    }

    if (!formData.payment) {
      newErrors.payment = 'Payment method is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSuccess(false);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };

      // Get customer ID from current user (logged-in customer)
      const customerId = user._id;

      await axios.post(`${backendUrl}/api/orders/createorder`, {
        customerId,
        productId: formData.productId,
        orderedQuantity: parseInt(formData.orderedQuantity),
        payment: formData.payment
      }, config);

      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = '/customer/orders';
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  // Combined effect to manage loading state properly
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
          fetchCurrentUser(),
          fetchProducts()
        ]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchCurrentUser, fetchProducts]);

  if (loading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="create-customer-order-layout">
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
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="form-card">
          <h1>Create New Order</h1>
          {isSuccess && (
            <div className="success-message" role="alert">
              Order created successfully!
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="productId">Product</label>
              <select
                id="productId"
                name="productId"
                value={formData.productId}
                onChange={handleChange}
                aria-invalid={!!errors.productId}
                aria-describedby={errors.productId ? "productid-error" : undefined}
              >
                <option value="">Select a product</option>
                {products.map(product => (
                  <option key={product._id} value={product._id}>
                    {product.productName} - ${product.price.toFixed(2)} (Qty: {product.quantity})
                  </option>
                ))}
              </select>
              {errors.productId && (
                <p id="productid-error" className="error-text" role="alert">
                  {errors.productId}
                </p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="orderedQuantity">Ordered Quantity</label>
                <input
                  id="orderedQuantity"
                  name="orderedQuantity"
                  type="number"
                  min="1"
                  value={formData.orderedQuantity}
                  onChange={handleChange}
                  aria-invalid={!!errors.orderedQuantity}
                  aria-describedby={errors.orderedQuantity ? "orderedquantity-error" : undefined}
                />
                {errors.orderedQuantity && (
                  <p id="orderedquantity-error" className="error-text" role="alert">
                    {errors.orderedQuantity}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="payment">Payment Method</label>
                <select
                  id="payment"
                  name="payment"
                  value={formData.payment}
                  onChange={handleChange}
                  aria-invalid={!!errors.payment}
                  aria-describedby={errors.payment ? "payment-error" : undefined}
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
                {errors.payment && (
                  <p id="payment-error" className="error-text" role="alert">
                    {errors.payment}
                  </p>
                )}
              </div>
            </div>

            {errors.submit && (
              <div className="error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Order'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCustomerOrder;