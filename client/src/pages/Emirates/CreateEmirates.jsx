// src/pages/Emirates/CreateEmirates.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './CreateEmirates.css';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CreateEmirates = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({ emiratesName: '', emiratesCode: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { window.location.href = '/login'; return; }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.emiratesName.trim()) errors.emiratesName = 'Emirates name is required';
    if (!formData.emiratesCode.trim()) errors.emiratesCode = 'Emirates code is required';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/emirates/create`,
        { emiratesName: formData.emiratesName.trim(), emiratesCode: formData.emiratesCode.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Emirates created successfully!');
      navigate('/emirates');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create Emirates');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return <div className="ce-loading">Loading...</div>;

  return (
    <div className="ce-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Emirates"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`ce-main ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="ce-page-wrapper">

          {/* Page Header */}
          <div className="ce-page-header">
            <div>
              <button className="ce-back-btn" onClick={() => navigate('/emirates')}>
                ← Back
              </button>
              <h1 className="ce-page-title">Add Emirates</h1>
              <p className="ce-page-sub">Create a new emirates region</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="ce-card">
            <div className="ce-card-header">
              <h2>Emirates Details</h2>
            </div>
            <div className="ce-card-body">
              <form onSubmit={handleSubmit} noValidate>
                <div className="ce-form-grid">

                  <div className="ce-form-group">
                    <label htmlFor="emiratesName">Emirates Name <span className="ce-required">*</span></label>
                    <input
                      id="emiratesName"
                      name="emiratesName"
                      type="text"
                      placeholder="e.g. Dubai"
                      value={formData.emiratesName}
                      onChange={handleChange}
                      className={formErrors.emiratesName ? 'ce-input ce-input-error' : 'ce-input'}
                    />
                    {formErrors.emiratesName && (
                      <span className="ce-error-text">{formErrors.emiratesName}</span>
                    )}
                  </div>

                  <div className="ce-form-group">
                    <label htmlFor="emiratesCode">Emirates Code <span className="ce-required">*</span></label>
                    <input
                      id="emiratesCode"
                      name="emiratesCode"
                      type="text"
                      placeholder="e.g. DXB"
                      value={formData.emiratesCode}
                      onChange={handleChange}
                      className={formErrors.emiratesCode ? 'ce-input ce-input-error' : 'ce-input'}
                    />
                    {formErrors.emiratesCode && (
                      <span className="ce-error-text">{formErrors.emiratesCode}</span>
                    )}
                  </div>

                </div>

                <div className="ce-form-actions">
                  <button
                    type="button"
                    className="ce-btn-cancel"
                    onClick={() => navigate('/emirates')}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ce-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : 'Save Emirates'}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default CreateEmirates;
