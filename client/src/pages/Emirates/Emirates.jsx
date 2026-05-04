// src/pages/Emirates/Emirates.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './Emirates.css';
import axios from 'axios';
import toast from 'react-hot-toast';

const Emirates = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [emiratesList, setEmiratesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Create form state
  const [formData, setFormData] = useState({ emiratesName: '', emiratesCode: '' });
  const [formErrors, setFormErrors] = useState({});

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmirates, setEditingEmirates] = useState(null);
  const [editFormData, setEditFormData] = useState({ emiratesName: '', emiratesCode: '' });
  const [editErrors, setEditErrors] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error('Failed to load user', error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  // Fetch all emirates
  const fetchEmirates = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/emirates/getAll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmiratesList(response.data);
    } catch (error) {
      console.error('Failed to fetch emirates:', error);
      toast.error('Failed to load emirates list');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchEmirates();
  }, [fetchCurrentUser, fetchEmirates]);

  // Validate form
  const validate = (data) => {
    const errors = {};
    if (!data.emiratesName.trim()) errors.emiratesName = 'Emirates name is required';
    if (!data.emiratesCode.trim()) errors.emiratesCode = 'Emirates code is required';
    return errors;
  };

  // Handle create form change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // Handle create submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/emirates/create`,
        { emiratesName: formData.emiratesName.trim(), emiratesCode: formData.emiratesCode.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Emirates created successfully!');
      setFormData({ emiratesName: '', emiratesCode: '' });
      fetchEmirates();
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to create Emirates';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/emirates/delete/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`"${name}" deleted successfully`);
      fetchEmirates();
    } catch (error) {
      toast.error('Failed to delete Emirates');
    }
  };

  // Open edit modal
  const handleEditClick = (emirates) => {
    setEditingEmirates(emirates);
    setEditFormData({ emiratesName: emirates.emiratesName, emiratesCode: emirates.emiratesCode });
    setEditErrors({});
    setShowEditModal(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
    if (editErrors[name]) setEditErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleEditSave = async () => {
    const errors = validate(editFormData);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setEditSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${backendUrl}/api/emirates/update/${editingEmirates._id}`,
        { emiratesName: editFormData.emiratesName.trim(), emiratesCode: editFormData.emiratesCode.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Emirates updated successfully!');
      setShowEditModal(false);
      setEditingEmirates(null);
      fetchEmirates();
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to update Emirates';
      toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  };

  if (!user) return <div className="emirates-loading">Loading...</div>;

  return (
    <div className="emirates-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Emirates"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`emirates-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="emirates-page-wrapper">

          {/* ── Create Form ── */}
          <div className="emirates-form-card">
            <div className="emirates-form-header">
              <h2>Add Emirates</h2>
            </div>
            <div className="emirates-form-body">
              <form onSubmit={handleSubmit} noValidate>
                <div className="emirates-form-row">
                  <div className="emirates-form-group">
                    <label htmlFor="emiratesName">Emirates Name</label>
                    <input
                      id="emiratesName"
                      name="emiratesName"
                      type="text"
                      placeholder="e.g. Dubai"
                      value={formData.emiratesName}
                      onChange={handleChange}
                      className={formErrors.emiratesName ? 'input-error' : ''}
                    />
                    {formErrors.emiratesName && (
                      <span className="emirates-error-text">{formErrors.emiratesName}</span>
                    )}
                  </div>

                  <div className="emirates-form-group">
                    <label htmlFor="emiratesCode">Emirates Code</label>
                    <input
                      id="emiratesCode"
                      name="emiratesCode"
                      type="text"
                      placeholder="e.g. DXB"
                      value={formData.emiratesCode}
                      onChange={handleChange}
                      className={formErrors.emiratesCode ? 'input-error' : ''}
                    />
                    {formErrors.emiratesCode && (
                      <span className="emirates-error-text">{formErrors.emiratesCode}</span>
                    )}
                  </div>

                  <div className="emirates-form-actions">
                    <button type="submit" className="emirates-submit-btn" disabled={submitting}>
                      {submitting ? 'Saving...' : 'Add Emirates'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* ── List Table ── */}
          <div className="emirates-list-card">
            <div className="emirates-list-header">
              <h2>Emirates List</h2>
            </div>

            {loading ? (
              <div className="emirates-loading">Loading emirates...</div>
            ) : emiratesList.length === 0 ? (
              <div className="emirates-no-data">No emirates found. Add one above.</div>
            ) : (
              <div className="emirates-table-wrapper">
                <table className="emirates-data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Emirates Name</th>
                      <th>Emirates Code</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emiratesList.map((em, index) => (
                      <tr key={em._id}>
                        <td>{index + 1}</td>
                        <td className="emirates-name-cell">{em.emiratesName}</td>
                        <td>
                          <span className="emirates-code-badge">{em.emiratesCode}</span>
                        </td>
                        <td>
                          <div className="emirates-actions-cell">
                            <button
                              className="emirates-edit-btn"
                              onClick={() => handleEditClick(em)}
                            >
                              Edit
                            </button>
                            <button
                              className="emirates-delete-btn"
                              onClick={() => handleDelete(em._id, em.emiratesName)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Edit Modal ── */}
      {showEditModal && (
        <div className="emirates-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="emirates-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Emirates</h3>

            <div className="emirates-form-group">
              <label htmlFor="edit-emiratesName">Emirates Name</label>
              <input
                id="edit-emiratesName"
                name="emiratesName"
                type="text"
                value={editFormData.emiratesName}
                onChange={handleEditChange}
                className={editErrors.emiratesName ? 'input-error' : ''}
              />
              {editErrors.emiratesName && (
                <span className="emirates-error-text">{editErrors.emiratesName}</span>
              )}
            </div>

            <div className="emirates-form-group">
              <label htmlFor="edit-emiratesCode">Emirates Code</label>
              <input
                id="edit-emiratesCode"
                name="emiratesCode"
                type="text"
                value={editFormData.emiratesCode}
                onChange={handleEditChange}
                className={editErrors.emiratesCode ? 'input-error' : ''}
              />
              {editErrors.emiratesCode && (
                <span className="emirates-error-text">{editErrors.emiratesCode}</span>
              )}
            </div>

            <div className="emirates-modal-actions">
              <button
                className="emirates-cancel-btn"
                onClick={() => setShowEditModal(false)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                className="emirates-submit-btn"
                onClick={handleEditSave}
                disabled={editSaving}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Emirates;
