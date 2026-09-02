// Shared server-side pagination helper.
// Opt-in: callers only paginate when req.query.page is present, so
// existing consumers that don't pass page/limit keep getting the full array.

const ALLOWED_LIMITS = [10, 20, 50, 100];
const DEFAULT_LIMIT = 10;

const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  if (!ALLOWED_LIMITS.includes(limit)) limit = DEFAULT_LIMIT;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const buildPaginatedResponse = (data, totalRecords, page, limit) => ({
  data,
  page,
  limit,
  totalRecords,
  totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
});

module.exports = { getPaginationParams, buildPaginatedResponse };
