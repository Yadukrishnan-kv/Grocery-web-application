import React, { useState, useEffect } from "react";
import SearchableSelect from "./SearchableSelect";

/**
 * Delivery partner cell shared across storekeeper pages: shows the assigned
 * partner's name once assigned, auto-reopens the assign dropdown only when
 * there's genuinely nobody to fall back to (nothing assigned yet, or the
 * assigned partner rejected). For a partially delivered order coming back
 * for its remaining pack, the previous delivery partner stays the default —
 * their name is shown, clickable to swap before they've (re)accepted, same
 * as an order that's simply "assigned" and awaiting first acceptance.
 */
const DeliveryPartnerAssignCell = ({ order, deliveryPartners, onAssign }) => {
  const [manualEdit, setManualEdit] = useState(false);

  const autoReassign =
    order.assignmentStatus === "pending_assignment" ||
    order.assignmentStatus === "rejected";

  const canManualReassign =
    order.assignmentStatus === "assigned" || order.status === "partial_delivered";

  // Drop any stale manual-edit flag once the order moves past the state
  // this override exists for.
  useEffect(() => {
    if (!canManualReassign && manualEdit) setManualEdit(false);
  }, [canManualReassign, manualEdit]);

  const showDropdown = autoReassign || (canManualReassign && manualEdit);

  if (showDropdown) {
    return (
      <>
        <SearchableSelect
          className="order-list-delivery-partner-select"
          options={deliveryPartners.map((partner) => ({
            value: partner._id,
            label: partner.username,
          }))}
          value=""
          onChange={(selectedId) => {
            if (selectedId) {
              setManualEdit(false);
              onAssign(order._id, selectedId);
            }
          }}
          placeholder={
            order.assignmentStatus === "rejected" || manualEdit
              ? "Reassign Partner"
              : "Assign Delivery Partner"
          }
        />
        {!autoReassign && manualEdit && (
          <button
            type="button"
            className="order-list-partner-cancel-btn"
            onClick={() => setManualEdit(false)}
          >
            Cancel
          </button>
        )}
      </>
    );
  }

  if (canManualReassign && order.assignedTo) {
    return (
      <button
        type="button"
        className="order-list-assigned-partner order-list-assigned-partner-btn"
        onClick={() => setManualEdit(true)}
        title="Click to change delivery partner before they accept"
      >
        {order.assignedTo.username}
      </button>
    );
  }

  return order.assignedTo ? (
    <span className="order-list-assigned-partner">
      {order.assignedTo.username || "Assigned"}
    </span>
  ) : (
    <span className="order-list-not-assigned">Not Assigned</span>
  );
};

export default DeliveryPartnerAssignCell;
