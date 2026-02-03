// CreateCustomer.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateCustomer.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const CreateCustomer = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    pincode: '',
    creditLimit: '',
    billingType: 'Credit limit'
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [customerId, setCustomerId] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Customer name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please provide a valid email';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }

    if (!formData.pincode.trim()) {
      newErrors.pincode = 'Pincode is required';
    }

    if (!formData.creditLimit || isNaN(formData.creditLimit) || parseFloat(formData.creditLimit) < 0) {
      newErrors.creditLimit = 'Valid credit limit is required';
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

      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        pincode: formData.pincode.trim(),
        creditLimit: parseFloat(formData.creditLimit),
        billingType: formData.billingType
      };

      let response;

      if (isEdit) {
        response = await axios.put(
          `${backendUrl}/api/customers/updatecustomer/${customerId}`,
          submitData,
          config
        );
      } else {
        response = await axios.post(
          `${backendUrl}/api/customers/createcustomer`,
          submitData,
          config
        );
      }

      setIsSuccess(true);

      // Show helpful message about login credentials (only on create)
      if (!isEdit) {
        const { defaultLoginInfo } = response.data;
        if (defaultLoginInfo) {
          alert(
            `Customer created!\n\n` +
            `Login credentials created automatically:\n` +
            `Email: ${defaultLoginInfo.email}\n` +
            `Temporary Password: ${defaultLoginInfo.temporaryPassword}\n\n` +
            `${defaultLoginInfo.note}\n\n` +
            `Redirecting to customer list...`
          );
        }
      }

      setTimeout(() => {
        navigate('/customer/list');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomerData = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/customers/getcustomerbyid/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const customer = response.data;
      setFormData({
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        pincode: customer.pincode,
        creditLimit: customer.creditLimit.toString(),
        billingType: customer.billingType
      });
      setIsEdit(true);
      setCustomerId(id);
    } catch (error) {
      console.error("Failed to fetch customer data", error);
      navigate('/customer/list');
    }
  }, [backendUrl, navigate]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate, backendUrl]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');

    if (editId) {
      fetchCustomerData(editId);
    }
  }, [location.search, fetchCustomerData]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (loading) {
    return <div className="customer-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="customer-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Customers"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`customer-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-form-card">
          <h1>{isEdit ? 'Edit Customer' : 'Create New Customer'}</h1>
          {isSuccess && (
            <div className="customer-success-message" role="alert">
              {isEdit ? 'Customer updated successfully!' : 'Customer created successfully!'}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="name">Customer Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  className="customer-input"
                />
                {errors.name && (
                  <p id="name-error" className="customer-error-text" role="alert">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className="customer-input"
                />
                {errors.email && (
                  <p id="email-error" className="customer-error-text" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="text"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  aria-invalid={!!errors.phoneNumber}
                  aria-describedby={errors.phoneNumber ? "phonenumber-error" : undefined}
                  className="customer-input"
                />
                {errors.phoneNumber && (
                  <p id="phonenumber-error" className="customer-error-text" role="alert">
                    {errors.phoneNumber}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="pincode">Pincode</label>
                <input
                  id="pincode"
                  name="pincode"
                  type="text"
                  value={formData.pincode}
                  onChange={handleChange}
                  aria-invalid={!!errors.pincode}
                  aria-describedby={errors.pincode ? "pincode-error" : undefined}
                  className="customer-input"
                />
                {errors.pincode && (
                  <p id="pincode-error" className="customer-error-text" role="alert">
                    {errors.pincode}
                  </p>
                )}
              </div>
            </div>

            <div className="customer-form-group">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows="3"
                aria-invalid={!!errors.address}
                aria-describedby={errors.address ? "address-error" : undefined}
                className="customer-textarea"
              />
              {errors.address && (
                <p id="address-error" className="customer-error-text" role="alert">
                  {errors.address}
                </p>
              )}
            </div>

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="creditLimit">Credit Limit ($)</label>
                <input
                  id="creditLimit"
                  name="creditLimit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.creditLimit}
                  onChange={handleChange}
                  aria-invalid={!!errors.creditLimit}
                  aria-describedby={errors.creditLimit ? "creditlimit-error" : undefined}
                  className="customer-input"
                />
                {errors.creditLimit && (
                  <p id="creditlimit-error" className="customer-error-text" role="alert">
                    {errors.creditLimit}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
  <label htmlFor="billingType">Billing Type</label>
  <select
    id="billingType"
    name="billingType"
    value={formData.billingType}
    onChange={handleChange}
    className="customer-select"
  >
    <option value="Credit limit">Credit Limit</option>
    <option value="Cash">Cash</option>
  </select>
</div>
            </div>

            {errors.submit && (
              <div className="customer-error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="customer-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Customer' : 'Create Customer')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCustomer;