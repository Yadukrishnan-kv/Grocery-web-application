// src/pages/Login/Login.jsx
import React, { useState } from "react";
import toast from "react-hot-toast"; // ← NEW IMPORT
import "./Login.css";

const Login = () => {
  const [formData, setFormData] = useState({
    identifier: "", // username or email
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const validateField = (name, value) => {
    switch (name) {
      case "identifier":
        if (!value.trim()) return "Username or Email is required";
        return "";
      case "password":
        if (!value) return "Password is required";
        if (value.length < 6) return "Password must be at least 6 characters";
        return "";
      default:
        return "";
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    const error = validateField(name, formData[name]);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const newErrors = {};
    let isValid = true;

    Object.keys(formData).forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);

    if (!isValid) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData), // sends { identifier, password }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      localStorage.setItem("token", data.token);

      toast.success("Logged in successfully!", {
        duration: 3000,
      });

      // Small delay to show success toast before redirect
      setTimeout(() => {
        const role = data.user?.role;
        if (role === "superadmin") {
          window.location.href = "/dashboard";
        } else {
          window.location.href = "/dashboard";
        }
      }, 800);
    } catch (err) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="brand-header">
          <div className="logo">🔒</div>
          <h1>Welcome back</h1>
          <p>Sign in to continue your journey</p>
        </div>

        <form onSubmit={handleSubmit} method="POST" noValidate>
          <div className="form-group">
            <label htmlFor="identifier">Username or Email</label>
            <div className="input-wrapper">
              <input
                id="identifier"
                type="text"
                name="identifier"
                value={formData.identifier}
                onChange={handleChange}
                onBlur={handleBlur}
                autoComplete="username email"
                autoFocus
                aria-invalid={!!errors.identifier}
                aria-describedby={
                  errors.identifier ? "identifier-error" : undefined
                }
              />
            </div>
            {errors.identifier && (
              <p id="identifier-error" className="error-text" role="alert">
                {errors.identifier}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="error-text" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          <div className="forgot-password">
            <a href="/forgot-password" tabIndex={0}>
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            className={`login-button ${isLoading ? "loading" : ""}`}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden="true"></span>
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <div className="signup-link">{/* Add signup link if needed */}</div>
      </div>
    </div>
  );
};

export default Login;
