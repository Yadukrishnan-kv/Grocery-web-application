// src/pages/Profile/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import axios from 'axios';
import toast from 'react-hot-toast'; // ← NEW IMPORT
import './Profile.css';

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem] = useState('Profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const res = await axios.get(`${backendUrl}/api/users/my-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setProfile(res.data);
      setEditForm({
        username: res.data.username || '',
        email: res.data.email || '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      });
    } catch (err) {
      console.error("Profile fetch error:", err);
      setError(err.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    // Client-side password validation (only if attempting to change password)
    if (editForm.newPassword || editForm.confirmNewPassword || editForm.currentPassword) {
      if (!editForm.currentPassword) {
        toast.error("Current password is required to change password");
        return;
      }
      if (editForm.newPassword.length < 6) {
        toast.error("New password must be at least 6 characters");
        return;
      }
      if (editForm.newPassword !== editForm.confirmNewPassword) {
        toast.error("New password and confirm password do not match");
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');

      // Prepare payload — send password fields only if user wants to change password
      const payload = {
        username: editForm.username,
        email: editForm.email
      };

      if (editForm.newPassword) {
        payload.currentPassword = editForm.currentPassword;
        payload.newPassword = editForm.newPassword;
      }

      const res = await axios.put(
        `${backendUrl}/api/users/my-profile`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setProfile(res.data.user);
      setIsEditing(false);

      // Reset password fields after success
      setEditForm(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      }));

      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update profile");
    }
  };

  if (loading) return <div className="loading">Loading profile...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!profile) return <div className="error">Profile not found</div>;

  return (
    <div className="profile-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={profile}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={profile}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="profile-container">
          <h1>My Profile</h1>

          <div className="profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {profile.username?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="profile-info">
                <h2>{profile.username}</h2>
                <span className="role-badge">{profile.role}</span>
              </div>
              {!isEditing && (
                <button className="edit-btn" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="edit-form">
                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    type="text"
                    name="username"
                    value={editForm.username}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={editForm.email}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    id="currentPassword"
                    type="password"
                    name="currentPassword"
                    value={editForm.currentPassword}
                    onChange={handleEditChange}
                    placeholder="Required if changing password"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    id="newPassword"
                    type="password"
                    name="newPassword"
                    value={editForm.newPassword}
                    onChange={handleEditChange}
                    placeholder="Minimum 6 characters"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmNewPassword">Confirm New Password</label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    name="confirmNewPassword"
                    value={editForm.confirmNewPassword}
                    onChange={handleEditChange}
                    placeholder="Re-type new password"
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setIsEditing(false);
                      setEditForm(prev => ({
                        ...prev,
                        currentPassword: '',
                        newPassword: '',
                        confirmNewPassword: ''
                      }));
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-details">
                <div className="detail-row">
                  <span className="label">Email</span>
                  <span className="value">{profile.email}</span>
                </div>

                {profile.customerDetails && (
                  <>
                    <h3>Customer Information</h3>
                    <div className="detail-row">
                      <span className="label">Phone Number</span>
                      <span className="value">{profile.customerDetails.phoneNumber || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Address</span>
                      <span className="value">{profile.customerDetails.address || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Pincode</span>
                      <span className="value">{profile.customerDetails.pincode || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Credit Limit</span>
                      <span className="value">₹{profile.customerDetails.creditLimit?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Available Credit</span>
                      <span className="value">₹{profile.customerDetails.balanceCreditLimit?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Billing Type</span>
                      <span className="value">
                        {profile.customerDetails.billingType === 'creditcard'
                          ? 'Credit Card (30-day cycle)'
                          : 'Immediate Payment'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;