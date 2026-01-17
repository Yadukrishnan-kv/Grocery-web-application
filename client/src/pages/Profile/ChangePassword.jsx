// src/pages/ChangePassword/ChangePassword.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import axios from 'axios';
import { useEffect } from 'react';
import './ChangePassword.css';

const ChangePassword = () => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem] = useState('Change Password');
  const [user, setUser] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'New password must be at least 6 characters';
    }

    if (formData.newPassword !== formData.confirmNewPassword) {
      newErrors.confirmNewPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${backendUrl}/api/users/change-password`,
        {
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess(true);
      setTimeout(() => {
        navigate('/profile');
      }, 2000);
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to change password';
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  };

  // Fetch current user for header (optional - can reuse from context later)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data.user || res.data);
      } catch (err) {
        navigate('/login');
      }
    };
    fetchUser();
  }, [backendUrl, navigate]);

  return (
    <div className="change-password-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="change-password-container">
          <h1>Change Password</h1>

          {success ? (
            <div className="success-message">
              Password changed successfully! Redirecting to profile...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="change-password-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  aria-invalid={!!errors.currentPassword}
                />
                {errors.currentPassword && (
                  <p className="error-text">{errors.currentPassword}</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  aria-invalid={!!errors.newPassword}
                />
                {errors.newPassword && (
                  <p className="error-text">{errors.newPassword}</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="confirmNewPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmNewPassword"
                  name="confirmNewPassword"
                  value={formData.confirmNewPassword}
                  onChange={handleChange}
                  aria-invalid={!!errors.confirmNewPassword}
                />
                {errors.confirmNewPassword && (
                  <p className="error-text">{errors.confirmNewPassword}</p>
                )}
              </div>

              {errors.submit && <div className="error-banner">{errors.submit}</div>}

              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ChangePassword;