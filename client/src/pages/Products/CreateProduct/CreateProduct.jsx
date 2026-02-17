// src/pages/Products/CreateProduct/CreateProduct.jsx
import React, { useEffect, useState, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./CreateProduct.css";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const CreateProduct = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    productName: "",
    CategoryName: "",
    subCategoryName: "",
    unit: "",
    price: "",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [productId, setProductId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.productName.trim()) {
      newErrors.productName = "Product name is required";
    }

    if (!formData.CategoryName) {
      newErrors.CategoryName = "Category is required";
    }

    if (!formData.subCategoryName) {
      newErrors.subCategoryName = "Sub-category is required";
    }

    if (!formData.unit) {
      newErrors.unit = "Unit is required";
    }

    if (
      !formData.price ||
      isNaN(formData.price) ||
      parseFloat(formData.price) <= 0
    ) {
      newErrors.price = "Valid price is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      };

      const submitData = {
        productName: formData.productName,
        CategoryName: formData.CategoryName,
        subCategoryName: formData.subCategoryName,
        unit: formData.unit,
        price: parseFloat(formData.price),
        // quantity is NOT sent anymore – backend will default to 0
      };

      if (isEdit) {
        await axios.put(
          `${backendUrl}/api/products/updateproduct/${productId}`,
          submitData,
          config,
        );

        toast.success("Product updated successfully!");
      } else {
        await axios.post(
          `${backendUrl}/api/products/createproduct`,
          submitData,
          config,
        );

        toast.success("Product created successfully!");
      }

      setTimeout(() => {
        navigate("/product/list");
      }, 1500);
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        "Something went wrong. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductData = useCallback(
    async (id) => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${backendUrl}/api/products/getallproducts`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const products = response.data;
        const productToEdit = products.find((p) => p._id === id);

        if (productToEdit) {
          setFormData({
            productName: productToEdit.productName || "",
            CategoryName: productToEdit.CategoryName || "",
            subCategoryName: productToEdit.subCategoryName || "",
            unit: productToEdit.unit || "",
            price: productToEdit.price?.toString() || "",
            // quantity is NOT loaded/used anymore
          });
          setIsEdit(true);
          setProductId(id);
        } else {
          navigate("/product/list");
        }
      } catch (error) {
        console.error("Failed to fetch product data", error);
        toast.error("Failed to load product data");
        navigate("/product/list");
      }
    },
    [backendUrl, navigate],
  );

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/categories/getallcategories`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setCategories(response.data);
    } catch (error) {
      console.error("Failed to fetch categories", error);
      toast.error("Failed to load categories");
    }
  }, [backendUrl]);

  const fetchSubCategoriesByCategory = useCallback(
    async (categoryName) => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${backendUrl}/api/subcategories/getallsubcategories`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const filteredSubCategories = response.data.filter(
          (sc) => sc.CategoryName === categoryName,
        );
        setSubCategories(filteredSubCategories);

        if (
          formData.subCategoryName &&
          !filteredSubCategories.some(
            (sc) => sc.subCategoryName === formData.subCategoryName,
          )
        ) {
          setFormData((prev) => ({ ...prev, subCategoryName: "" }));
        }
      } catch (error) {
        console.error("Failed to fetch sub-categories", error);
        toast.error("Failed to load sub-categories");
      }
    },
    [backendUrl, formData.subCategoryName],
  );

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get("edit");

    if (editId) {
      fetchProductData(editId);
    }
  }, [location.search, fetchProductData]);

  useEffect(() => {
    if (formData.CategoryName) {
      fetchSubCategoriesByCategory(formData.CategoryName);
    } else {
      setSubCategories([]);
      setFormData((prev) => ({ ...prev, subCategoryName: "" }));
    }
  }, [formData.CategoryName, fetchSubCategoriesByCategory]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }

        const response = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setUser(response.data.user || response.data);
      } catch (error) {
        console.error("Failed to load user", error);
        localStorage.removeItem("token");
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, [navigate, backendUrl]);

  if (loading) {
    return <div className="product-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="product-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Products"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main
        className={`product-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="product-form-card">
          <h1>{isEdit ? "Edit Product" : "Create New Product"}</h1>

          <form onSubmit={handleSubmit} noValidate>
            {/* 1. Product Name */}
            <div className="product-form-group">
              <label htmlFor="productName">Product Name</label>
              <input
                id="productName"
                name="productName"
                type="text"
                value={formData.productName}
                onChange={handleChange}
                aria-invalid={!!errors.productName}
                aria-describedby={
                  errors.productName ? "productname-error" : undefined
                }
                className="product-input"
              />
              {errors.productName && (
                <p
                  id="productname-error"
                  className="product-error-text"
                  role="alert"
                >
                  {errors.productName}
                </p>
              )}
            </div>

            {/* 2. Category */}
            <div className="product-form-group">
              <label htmlFor="CategoryName">Category</label>
              <select
                id="CategoryName"
                name="CategoryName"
                value={formData.CategoryName}
                onChange={handleChange}
                aria-invalid={!!errors.CategoryName}
                aria-describedby={
                  errors.CategoryName ? "categoryname-error" : undefined
                }
                className="product-select"
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category._id} value={category.CategoryName}>
                    {category.CategoryName}
                  </option>
                ))}
              </select>
              {errors.CategoryName && (
                <p
                  id="categoryname-error"
                  className="product-error-text"
                  role="alert"
                >
                  {errors.CategoryName}
                </p>
              )}
            </div>

            {/* 3. Sub-Category */}
            <div className="product-form-group">
              <label htmlFor="subCategoryName">Sub-Category</label>
              <select
                id="subCategoryName"
                name="subCategoryName"
                value={formData.subCategoryName}
                onChange={handleChange}
                disabled={!formData.CategoryName}
                aria-invalid={!!errors.subCategoryName}
                aria-describedby={
                  errors.subCategoryName ? "subcategoryname-error" : undefined
                }
                className="product-select"
              >
                <option value="">Select a sub-category</option>
                {subCategories.map((subCategory) => (
                  <option
                    key={subCategory._id}
                    value={subCategory.subCategoryName}
                  >
                    {subCategory.subCategoryName}
                  </option>
                ))}
              </select>
              {errors.subCategoryName && (
                <p
                  id="subcategoryname-error"
                  className="product-error-text"
                  role="alert"
                >
                  {errors.subCategoryName}
                </p>
              )}
            </div>

            {/* 4. Unit */}
            <div className="product-form-group">
              <label htmlFor="unit">Unit</label>
              <select
                id="unit"
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                aria-invalid={!!errors.unit}
                aria-describedby={errors.unit ? "unit-error" : undefined}
                className="product-select"
              >
                <option value="">Select unit</option>
                <option value="kg">kg</option>
                <option value="gram">gram</option>
                <option value="liter">liter</option>
                <option value="ml">ml</option>
                <option value="piece">piece</option>
                <option value="box">box</option>
                <option value="pack">pack</option>
                <option value="bottle">bottle</option>
                <option value="can">can</option>
                <option value="dozen">dozen</option>
                <option value="set">set</option>
                <option value="pair">pair</option>
                <option value="roll">roll</option>
                <option value="bag">bag</option>
                <option value="jar">jar</option>
                <option value="tin">tin</option>
                <option value="carton">carton</option>
                <option value="bundle">bundle</option>
              </select>
              {errors.unit && (
                <p id="unit-error" className="product-error-text" role="alert">
                  {errors.unit}
                </p>
              )}
            </div>

            {/* 5. Price (quantity field removed) */}
            <div className="product-form-group">
              <label htmlFor="price">Price (AED)</label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={handleChange}
                aria-invalid={!!errors.price}
                aria-describedby={errors.price ? "price-error" : undefined}
                className="product-input"
              />
              {errors.price && (
                <p id="price-error" className="product-error-text" role="alert">
                  {errors.price}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="product-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update Product"
                  : "Create Product"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateProduct;
