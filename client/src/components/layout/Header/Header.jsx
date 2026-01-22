// Header.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ sidebarOpen, onToggleSidebar, user }) => {
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef(null);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const togglePopup = () => {
    setPopupOpen(!popupOpen);
  };

  const closePopup = () => {
    setPopupOpen(false);
  };

  // Handle clicks outside the popup
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        closePopup();
      }
    };

    if (popupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [popupOpen]);

  // Handle Escape key to close popup
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        closePopup();
      }
    };

    if (popupOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [popupOpen]);

  const handleProfileClick = () => {
    navigate('/profile');
    closePopup();
  };

  

  if (!user) return null;

  const firstLetter = user.username?.charAt(0).toUpperCase() || 'U';

  return (
    <header className="header">
      <div className="header-left">
        <button
          className="menu-toggle"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
          aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <h1 className="app-title">{user.role?.charAt(0).toUpperCase() + user.role?.slice(1)} Dashboard</h1>
      </div>
      <div className="header-right">
        <div 
          className="user-info"
          onClick={togglePopup}
          role="button"
          tabIndex={0}
          aria-haspopup="true"
          aria-expanded={popupOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              togglePopup();
            }
          }}
        >
          <span className="username">{user.username}</span>
          <div className="avatar" aria-label="User avatar">{firstLetter}</div>
        </div>

        {popupOpen && (
          <div 
            ref={popupRef} 
            className="user-popup"
            role="menu"
            aria-label="User management menu"
          >
            <div className="user-popup-header">
              <div className="popup-avatar">{firstLetter}</div>
              <div className="popup-user-info">
                <div className="popup-username">{user.username}</div>
                <div className="popup-role">{user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}</div>
              </div>
            </div>
            <hr className="popup-divider" />
            <div className="popup-menu">
              <button 
                className="popup-menu-item"
                onClick={handleProfileClick}
                role="menuitem"
              >
                Profile
              </button>
             
              <button 
                className="popup-menu-item logout-item"
                onClick={handleLogout}
                role="menuitem"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;