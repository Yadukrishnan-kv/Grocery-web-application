// src/pages/Users/UserTable.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './UserTable.css';
import axios from 'axios';

const UserTable = () => {
  const [users, setUsers] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Users');
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  // Fetch current logged-in user (for header)
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const res = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setCurrentUser(res.data.user || res.data);
      } catch (err) {
        console.error("Failed to load current user", err);
        localStorage.removeItem('token');
        navigate('/login');
      } finally {
        setUserLoading(false);
      }
    };

    fetchCurrentUser();
  }, [navigate, backendUrl]);

  // Fetch all users for table
  useEffect(() => {
  const fetchUsers = async () => {
    try {
      setTableLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Filter out Admin and superadmin users
      const filteredUsers = res.data.filter(
        user => user.role !== 'Admin' && user.role !== 'superadmin'
      );

      console.log("Fetched & filtered users:", filteredUsers);
      setUsers(filteredUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again.");
    } finally {
      setTableLoading(false);
    }
  };

  fetchUsers();
}, [backendUrl]);

  const handleDelete = async (id, username, role) => {
    if (isProtectedRole(role)) {
      alert(`Cannot delete protected role: ${role}`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/users/deleteUser/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Refresh table after delete
        setUsers((prev) => prev.filter((u) => u._id !== id));
      } catch (err) {
        console.error("Delete error:", err);
        alert("Failed to delete user. Please try again.");
      }
    }
  };

  const isProtectedRole = (role) => {
    return role === 'Admin' || role === 'superadmin';
  };

  if (userLoading) {
    return <div className="loading">Loading user information...</div>;
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
              <Link to="/user/create" className="user-table-create-button">
                Create User
              </Link>
            </div>

            {error && <div className="user-table-error-message">{error}</div>}

            {tableLoading ? (
              <div className="user-table-loading">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="user-table-no-data">No users found</div>
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
                    {users.map((user, index) => (
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
                              isProtectedRole(user.role) ? 'disabled' : ''
                            }`}
                            onClick={() => handleDelete(user._id, user.username, user.role)}
                            disabled={isProtectedRole(user.role)}
                            aria-label={
                              isProtectedRole(user.role)
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