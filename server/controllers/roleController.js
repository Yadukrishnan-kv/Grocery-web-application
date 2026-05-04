const Role = require("../models/Role");

const createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const existing = await Role.findOne({ name });
    if (existing) return res.status(400).json({ message: "Role already exists" });

    const role = await Role.create({ name, permissions: permissions || [] });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateRolePermissions = async (req, res) => {
  try {
    const { permissions } = req.body;

    

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { permissions },
      { new: true, runValidators: true }
    );

    if (!role) return res.status(404).json({ message: "Role not found" });

    res.json(role);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
const deleteRole = async (req, res) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.json({ message: "Role deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateRole = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Role name is required" });
    }

    const existing = await Role.findOne({ name: name.trim(), _id: { $ne: req.params.id } });
    if (existing) {
      return res.status(400).json({ message: "Role name already exists" });
    }

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { name: name.trim() },
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ message: "Role not found" });

    res.json(role);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// controllers/roleController.js
const getPermissions = async (req, res) => {
  try {
    if (!req.user || !req.user.role) {
      return res.json({ permissions: [] });
    }

    // Special handling for Admin role - exclude deliveries
    if (req.user.role === 'Admin') {
      const adminPermissions = [
        "menu.dashboard",
        "menu.users",
        "menu.products", 
        "menu.customers",
        "menu.sales",
        "menu.settings",
        "menu.customer.requests",
        "menu.wallet.money",
        'menu.billWallet',
        'menu.admin.order.requests',
        'menu.emirates',
        'menu.salesReturn',
        
        // Note: menu.deliveries is excluded for Admin
      ];
      return res.json({ permissions: adminPermissions });
    }

    // For other roles, look up in database and expand main menu permissions
    const role = await Role.findOne({ name: req.user.role });
    if (!role) return res.json({ permissions: [] });
    
    // Expand main menu permissions to include all sub-permissions
    const expandedPermissions = [];
    const mainPermissions = role.permissions;
    
    mainPermissions.forEach(permission => {
      expandedPermissions.push(permission);
      
      // Add sub-permissions based on main menu
      if (permission === "menu.users") {
        expandedPermissions.push("menu.users.list", "menu.users.roles");
      } else if (permission === "menu.products") {
        expandedPermissions.push("menu.products.category", "menu.products.subcategory", "menu.products.add");
      } else if (permission === "menu.customers") {
        expandedPermissions.push("menu.customers.list");
      } else if (permission === "menu.sales") {
          expandedPermissions.push("menu.sales.orders", "menu.sales.reports", "menu.createSalesReturn");
      } else if (permission === "menu.deliveries") {
        expandedPermissions.push("menu.deliveries.arrived", "menu.deliveries.accepted", "menu.deliveries.delivered", "menu.deliveries.PendingOrdersForPacking", "menu.deliveries.cancelled", "menu.returnPickups");
      }
      else if (permission === "menu.customer.orders") {
        expandedPermissions.push("menu.customer.orders", "menu.createSalesReturn");
      }
      else if (permission === "menu.customer.order.status") {
        expandedPermissions.push("menu.customer.order.status");
      }
      else if (permission === "menu.customer.order.reports") {
        expandedPermissions.push("menu.customer.order.reports");
      }
      else if (permission === "menu.customer.bill.statement") {
        expandedPermissions.push("menu.customer.bill.statement");
      }
      else if (permission === "menu.customer.credit.limit") {
        expandedPermissions.push("menu.customer.credit.limit");
      }
      else if (permission === "menu.customer.requests") {
        expandedPermissions.push("menu.customer.requests.create", "menu.customer.requests.my", "menu.customers.salesman");
      }
      else if (permission === "menu.CashWallet") {
        expandedPermissions.push("menu.CashWallet");
      } else if (permission === "menu.ChequeWallet") {
        expandedPermissions.push("menu.ChequeWallet");
      } else if (permission === "menu.wallet.money") {
        expandedPermissions.push("menu.wallet.money");
      }
       else if (permission === "menu.storekeeper.packed.orders") {
        expandedPermissions.push("menu.storekeeper.packed.orders");
      }
       else if (permission === "menu.PendingOrders") { 
        expandedPermissions.push("menu.PendingOrders");
      }
        else if (permission === "menu.OutstandingReport") {
        expandedPermissions.push("menu.OutstandingReport");
      }
        else if (permission === "menu.ReceiptReport") {
        expandedPermissions.push("menu.ReceiptReport");
      }
      else if (permission === "menu.storekeeper.all-orders") {
        expandedPermissions.push("menu.storekeeper.all-orders");
      }
      else if (permission === "menu.returnReceived") {
        expandedPermissions.push("menu.returnReceived");
      }
      else if (permission === "menu.returnPickups") {
        expandedPermissions.push("menu.returnPickups");
      }
      else if (permission === "menu.createSalesReturn") {
        expandedPermissions.push("menu.createSalesReturn");
      }
      else if (permission === "menu.salesReturn") {
        expandedPermissions.push("menu.salesReturn");
      }
      
      
      

      
    });
    
    // Remove duplicates
    const uniquePermissions = [...new Set(expandedPermissions)];
    
    res.json({ permissions: uniquePermissions });
  } catch (error) {
    console.error('Permission fetch error:', error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createRole,
  getAllRoles,
  updateRolePermissions,
  updateRole,
  deleteRole,
  getPermissions,
  getRoleById,
};