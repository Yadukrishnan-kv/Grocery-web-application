// src/pages/Profile/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import axios from 'axios';
import './Profile.css';

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem] = useState('Profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', email: '' });

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  // Fetch full profile
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
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        `${backendUrl}/api/users/my-profile`,
        editForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setProfile(res.data.user);
      setIsEditing(false);
      alert("Profile updated successfully!");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update profile");
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
                <p className="role-badge">{profile.role}</p>
              </div>
              {!isEditing && (
                <button className="edit-btn" onClick={() => setIsEditing(true)}>
                  Edit Profile ✎
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="edit-form">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    name="username"
                    value={editForm.username}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={editForm.email}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-details">
                <div className="detail-row">
                  <span className="label">Email:</span>
                  <span>{profile.email}</span>
                </div>

                {profile.customerDetails && (
                  <>
                    <h3>Customer Details</h3>
                    <div className="detail-row">
                      <span className="label">Phone Number:</span>
                      <span>{profile.customerDetails.phoneNumber || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Address:</span>
                      <span>{profile.customerDetails.address || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Pincode:</span>
                      <span>{profile.customerDetails.pincode || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Total Credit Limit:</span>
                      <span>₹{profile.customerDetails.creditLimit?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Available Credit:</span>
                      <span>₹{profile.customerDetails.balanceCreditLimit?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Billing Type:</span>
                      <span>
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

          <div className="action-buttons">
            <button
              className="change-password-btn"
              onClick={() => navigate('/change-password')}
            >
              Change Password
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;