// src/pages/Users/UserTable.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './UserTable.css';
import axios from 'axios';

const UserTable = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]); // ← NEW: dynamic roles from API
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Users');
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCurrentUser(res.data.user || res.data);
    } catch (err) {
      console.error("Failed to load current user", err);
      localStorage.removeItem('token');
      window.location.href = '/login';
    } finally {
      setUserLoading(false);
    }
  }, [backendUrl]);

  const fetchUsers = useCallback(async () => {
    try {
      setTableLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Filter out Admin and superadmin (as in original)
      const filteredUsers = res.data.filter(
        user => user.role !== 'Admin' && user.role !== 'superadmin'
      );

      // Extract unique roles dynamically
      const uniqueRoles = [...new Set(
        filteredUsers.map(user => user.role).filter(role => role)
      )].sort();

      setRoles(uniqueRoles);
      setUsers(filteredUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again.");
    } finally {
      setTableLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, [fetchCurrentUser, fetchUsers]);

  // Filter users based on search term and role
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = !searchTerm.trim() || 
        (user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         user.email?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesRole = roleFilter === 'all' || 
        (user.role && user.role.toLowerCase() === roleFilter.toLowerCase());
      
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  const handleDelete = async (id, username, role) => {
    if (role === 'Admin' || role === 'superadmin') {
      alert(`Cannot delete protected role: ${role}`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/users/deleteUser/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Refresh table
        fetchUsers();
      } catch (err) {
        console.error("Delete error:", err);
        alert("Failed to delete user. Please try again.");
      }
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  if (userLoading) {
    return <div className="user-table-loading">Loading user information...</div>;
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="user-table-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={currentUser}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={currentUser}
      />
      <main className={`user-table-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="user-table-container-wrapper">
          <div className="user-table-container">
            <div className="user-table-header-section">
              <h2 className="user-table-page-title">User Management</h2>

              {/* Exact same controls group as OrderList */}
              <div className="user-table-controls-group">
                {/* Filter first */}
                <div className="user-table-filter-group">
                  <label htmlFor="roleFilter" className="user-table-filter-label">
                    Filter by Role:
                  </label>
                  <select
                    id="roleFilter"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="user-table-role-filter"
                  >
                    <option value="all">All Roles</option>
                    {roles.map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search bar (second) */}
                <div className="user-table-search-container">
                  <input
                    type="text"
                    className="user-table-search-input"
                    placeholder="Search by username or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search users by username or email"
                  />
                  {searchTerm && (
                    <button
                      className="user-table-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Create Button (last) */}
                <Link to="/user/create" className="user-table-create-button">
                  Create User
                </Link>
              </div>
            </div>

            {error && <div className="user-table-error-message">{error}</div>}

            {tableLoading ? (
              <div className="user-table-loading">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="user-table-no-data">
                No users found
                {roleFilter !== 'all' ? ` with role "${roleFilter}"` : ''}
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ''}
              </div>
            ) : (
              <div className="user-table-wrapper">
                <table className="user-table-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Edit</th>
                      <th>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user, index) => (
                      <tr key={user._id}>
                        <td>{index + 1}</td>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`user-table-role-badge user-table-role-${user.role.toLowerCase().replace(/\s+/g, '-')}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/user/create?edit=${user._id}`}
                            className="user-table-icon-button user-table-edit-button"
                            aria-label={`Edit user ${user.username}`}
                          >
                            ✎
                          </Link>
                        </td>
                        <td>
                          <button
                            className={`user-table-icon-button user-table-delete-button ${
                              user.role === 'Admin' || user.role === 'superadmin' ? 'disabled' : ''
                            }`}
                            onClick={() => handleDelete(user._id, user.username, user.role)}
                            disabled={user.role === 'Admin' || user.role === 'superadmin'}
                            aria-label={
                              user.role === 'Admin' || user.role === 'superadmin'
                                ? `Cannot delete protected user ${user.username}`
                                : `Delete user ${user.username}`
                            }
                          >
                            🗑️
                          </button>
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
    </div>
  );
};

export default UserTable;