// Customer IDs are generated (see customerController.generateCustomerId) as
// [3-char emiratesCode][3-char salesman suffix][4-digit global sequence], e.g.
// "DXBADM1001". The 4-digit sequence is already globally unique on its own,
// so anywhere the ID is shown to a user we display just that trailing number
// (e.g. "1001") instead of the full internal format.
const formatCustomerId = (customerId) => {
  if (!customerId) return customerId;
  const match = String(customerId).match(/(\d{4})$/);
  return match ? match[1] : customerId;
};

module.exports = { formatCustomerId };
