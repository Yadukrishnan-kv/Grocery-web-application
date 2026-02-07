// src/pages/Sales/CreateCustomerRequest.jsx
import React, { useEffect, useState } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import '../../Customer/CreateCustomer/CreateCustomer.css'; // Reuse same CSS
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const CreateCustomerRequest = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    pincode: '',
    creditLimit: '',
    billingType: 'Credit limit',
    statementType: '',
    dueDays: '',
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Customer name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please provide a valid email';
    if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';
    if (!formData.address.trim()) newErrors.address = 'Address is required';
    if (!formData.pincode.trim()) newErrors.pincode = 'Pincode is required';
    if (!formData.creditLimit || isNaN(formData.creditLimit) || parseFloat(formData.creditLimit) < 0) {
      newErrors.creditLimit = 'Valid credit limit is required';
    }

    // NEW: Validate if Credit limit
    if (formData.billingType === "Credit limit") {
      if (!formData.statementType) newErrors.statementType = 'Statement type is required for Credit limit';
      if (!formData.dueDays || isNaN(formData.dueDays) || parseInt(formData.dueDays) < 0) {
        newErrors.dueDays = 'Valid due days is required (non-negative number)';
      }
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
        billingType: formData.billingType,
        statementType: formData.billingType === "Credit limit" ? formData.statementType : null,
        dueDays: formData.billingType === "Credit limit" ? parseInt(formData.dueDays) : null,
      };

      await axios.post(
        `${backendUrl}/api/customers/customer-requests/create`,
        submitData,
        config
      );

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/sales/customer-requests/my');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const res = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setUser(res.data.user || res.data);

        if (res.data.user.role !== "Sales man") {  // fixed typo
          navigate('/dashboard');
        }
      } catch (error) {
        console.error("Failed to load user", error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [backendUrl, navigate]);

  if (loading) return <div className="customer-loading">Loading user information...</div>;

  if (!user) return null;

  return (
    <div className="customer-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Create Customer Request"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`customer-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-form-card">
          <h1>Request New Customer</h1>
          {isSuccess && (
            <div className="customer-success-message" role="alert">
              Request submitted successfully! Admin will review it.
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
                {errors.name && <p id="name-error" className="customer-error-text">{errors.name}</p>}
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
                {errors.email && <p id="email-error" className="customer-error-text">{errors.email}</p>}
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
                {errors.phoneNumber && <p id="phonenumber-error" className="customer-error-text">{errors.phoneNumber}</p>}
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
                {errors.pincode && <p id="pincode-error" className="customer-error-text">{errors.pincode}</p>}
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
              {errors.address && <p id="address-error" className="customer-error-text">{errors.address}</p>}
            </div>

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="creditLimit">Credit Limit (AED)</label>
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
                {errors.creditLimit && <p id="creditlimit-error" className="customer-error-text">{errors.creditLimit}</p>}
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

            {/* NEW: Conditional Billing Configuration */}
            {formData.billingType === "Credit limit" && (
              <div className="customer-form-row">
                <div className="customer-form-group">
                  <label htmlFor="statementType">Statement Type</label>
                  <select
                    id="statementType"
                    name="statementType"
                    value={formData.statementType}
                    onChange={handleChange}
                    className="customer-select"
                  >
                    <option value="">Select statement type</option>
                    <option value="invoice-based">Invoice-based</option>
                    <option value="monthly">Monthly Statement</option>
                  </select>
                  {errors.statementType && <p className="customer-error-text">{errors.statementType}</p>}
                </div>

                <div className="customer-form-group">
                  <label htmlFor="dueDays">Due Days</label>
                  <input
                    id="dueDays"
                    name="dueDays"
                    type="number"
                    min="0"
                    value={formData.dueDays}
                    onChange={handleChange}
                    aria-invalid={!!errors.dueDays}
                    aria-describedby={errors.dueDays ? "dueDays-error" : undefined}
                    className="customer-input"
                  />
                  {errors.dueDays && <p id="dueDays-error" className="customer-error-text">{errors.dueDays}</p>}
                </div>
              </div>
            )}

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
              {isLoading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCustomerRequest;