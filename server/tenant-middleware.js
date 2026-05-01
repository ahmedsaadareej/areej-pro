/**
 * Tenant Middleware
 * Reads X-Tenant-Slug header (set by Caddy from subdomain)
 * OR slug query param (for dev/fallback)
 * Sets req.tenantSlug + req.tenantOwner on every request
 */
const master = require('./db-master');

function tenantMiddleware(req, res, next) {
  // Get slug from Caddy header or query param
  const slug = req.headers['x-tenant-slug'] || req.query._slug || null;

  if (!slug || slug === 'pro') {
    // Main domain — no tenant context
    req.tenantSlug = null;
    req.tenantOwner = null;
    return next();
  }

  // Look up owner by slug
  const owner = master.prepare('SELECT * FROM users WHERE slug=?').get(slug.toLowerCase().trim());

  if (!owner) {
    // Unknown subdomain — for API calls return 404, for HTML serve tenant-not-found
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ ok: false, error: 'شركة غير موجودة — تحقق من الرابط' });
    }
    req.tenantSlug = slug;
    req.tenantOwner = null;
    return next();
  }

  req.tenantSlug = slug;
  req.tenantOwner = owner;
  next();
}

module.exports = tenantMiddleware;
