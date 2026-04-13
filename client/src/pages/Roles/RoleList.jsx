// src/pages/Roles/RoleList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './RoleList.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const RoleList = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [saving, setSaving] = useState(false);
  
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user for header
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

  const fetchRoles = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/roles/getAllRoles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      alert('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchRoles();
  }, [fetchCurrentUser, fetchRoles]);

  const handleDelete = async (id, roleName) => {
    if (window.confirm(`Delete role "${roleName}"? This cannot be undone.`)) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/roles/deleteRole/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchRoles();
      } catch (error) {
        alert('Failed to delete role');
      }
    }
  };

  const handleEditClick = (role) => {
    setEditingRole(role);
    setEditRoleName(role.name);
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editRoleName.trim()) {
      toast.error('Role name is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${backendUrl}/api/roles/updateRole/${editingRole._id}`,
        { name: editRoleName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Role updated successfully');
      setShowEditModal(false);
      setEditingRole(null);
      setEditRoleName('');
      fetchRoles();
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to update role';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="roles-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user} // Pass user to header
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem="RolePermission" 
        onSetActiveItem={() => {}} 
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
   
<main className={`roles-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
  <div className="roles-container-wrapper">
    <div className="roles-container">
      <div className="roles-table-header">
        <h2>Role Management</h2>
        <Link to="/roles/create" className="roles-create-button">
          Create Role
        </Link>
      </div>

      {loading ? (
        <div className="roles-loading">Loading roles...</div>
      ) : (
        <div className="roles-table">
          <div className="roles-table-header-row">
            <div>Role Name</div>
            <div>Permissions</div>
            <div>Actions</div>
          </div>
          
          {roles.map(role => (
            <div key={role._id} className="roles-table-row">
              <div className="roles-role-name">{role.name}</div>
              <div className="roles-permissions-cell">
                <span className="roles-permission-count">
                  {role.permissions?.length || 0} permissions
                </span>
              </div>
              <div className="roles-actions-cell">
                <button
                  onClick={() => handleEditClick(role)}
                  className="roles-rename-button"
                  disabled={role.name === 'Admin' || role.name === 'superadmin'}
                >
                  Edit
                </button>
                <Link 
                  to={`/roles/edit/${role._id}`} 
                  className="roles-edit-button"
                >
                  Edit Permissions
                </Link>
                <button 
                  onClick={() => handleDelete(role._id, role.name)}
                  className="roles-delete-button"
                  disabled={role.name === 'Admin' || role.name === 'superadmin'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
</main>

      {showEditModal && (
        <div className="roles-modal-overlay">
          <div className="roles-modal">
            <h3 className="roles-modal-title">Edit Role</h3>
            <div className="roles-modal-field">
              <label htmlFor="editRoleName">Role Name</label>
              <input
                id="editRoleName"
                type="text"
                value={editRoleName}
                onChange={(e) => setEditRoleName(e.target.value)}
                className="roles-modal-input"
                autoFocus
              />
            </div>
            <div className="roles-modal-actions">
              <button
                className="roles-modal-cancel"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRole(null);
                  setEditRoleName('');
                }}
              >
                Cancel
              </button>
              <button
                className="roles-modal-save"
                onClick={handleEditSave}
                disabled={saving || !editRoleName.trim()}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleList;