import React from "react";
import "./OrderProductsModal.css";

const OrderProductsModal = ({ order, onClose, filterItem, getQty, emptyText }) => {
  if (!order) return null;
  const allItems = order.orderItems || [];
  const items = filterItem ? allItems.filter(filterItem) : allItems;

  return (
    <div className="order-products-modal-overlay" onClick={onClose}>
      <div
        className="order-products-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="order-products-modal-header">
          <h3>Order #{order.orderId || order._id}</h3>
          <button
            className="order-products-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="order-products-modal-body">
          {items.length > 0 ? (
            <div className="products-list">
              {items.map((item, i) => (
                <div key={i} className="product-tag">
                  <span className="product-name">
                    {item.product?.productName || "Unknown"}
                  </span>
                  <span className="product-qty">
                    × {getQty ? getQty(item) : item.orderedQuantity}
                  </span>
                  <span className="product-unit">{item.unit || ""}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="no-products">{emptyText || "No products"}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderProductsModal;
