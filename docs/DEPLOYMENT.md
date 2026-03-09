# 🚀 Deployment Guide - GWEN Framework

This guide covers deploying GWEN games to production, including WASM-specific requirements.

## ⚠️ Critical: SharedArrayBuffer Requirements

GWEN uses `SharedArrayBuffer` for zero-copy communication between WASM modules. This requires **strict HTTP headers** in production.

### Required HTTP Headers

Your server **MUST** send these headers for WASM plugins to work:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

Without these headers, `SharedArrayBuffer` will be **undefined** and the engine will crash.

---

## 🌐 Platform-Specific Configuration

### Vercel

Create or edit `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        }
      ]
    }
  ]
}
```

### Netlify

Create or edit `netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Opener-Policy = "same-origin"
```

### Cloudflare Pages

Create `_headers` file in your `public/` directory:

```
/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
```

### Nginx

Add to your `nginx.conf`:

```nginx
server {
    # ...
    
    add_header Cross-Origin-Embedder-Policy "require-corp";
    add_header Cross-Origin-Opener-Policy "same-origin";
}
```

### Apache

Add to `.htaccess` or `httpd.conf`:

```apache
<IfModule mod_headers.c>
    Header set Cross-Origin-Embedder-Policy "require-corp"
    Header set Cross-Origin-Opener-Policy "same-origin"
</IfModule>
```

### Local Development (Vite)

Vite automatically handles these headers when serving WASM. If you use a custom server:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

---

## 🔍 Runtime Detection

GWEN automatically detects if `SharedArrayBuffer` is unavailable and throws an error:

```typescript
// This happens automatically in @gwen/engine-core
if (typeof SharedArrayBuffer === 'undefined') {
  throw new Error(
    '[GWEN] SharedArrayBuffer not available.\n' +
    'Required HTTP headers:\n' +
    '  Cross-Origin-Embedder-Policy: require-corp\n' +
    '  Cross-Origin-Opener-Policy: same-origin'
  );
}
```

You can test this manually in your browser console:

```javascript
console.log(typeof SharedArrayBuffer); // Should print "function"
```

---

## 📦 Asset Optimization

### WASM Files

GWEN's WASM files are pre-optimized with:
- `opt-level = "z"` (size optimization)
- `lto = true` (link-time optimization)
- `strip = true` (remove debug symbols)

Typical sizes:
- `gwen_core_bg.wasm`: ~80-150 KB (gzipped: ~40-60 KB)
- `gwen_physics2d_bg.wasm`: ~200-400 KB (gzipped: ~80-150 KB)

### Compression

Enable gzip or brotli compression on your server:

**Nginx:**
```nginx
gzip on;
gzip_types application/wasm application/javascript;
gzip_comp_level 6;
```

**Cloudflare:** Automatic (enable "Auto Minify" for WASM in dashboard)

**Vercel/Netlify:** Automatic

---

## 🚦 CDN & Caching

### Recommended Cache Headers

```
Cache-Control: public, max-age=31536000, immutable
```

Apply to:
- `*.wasm` files
- `*.js` bundles (with hashed filenames)

**Vercel example:**
```json
{
  "headers": [
    {
      "source": "/assets/**/*.wasm",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

---

## 🧪 Testing Production Build

Before deploying, test locally:

```bash
# Build for production
pnpm build

# Preview build
pnpm preview
```

Then open DevTools → Network → check:
1. ✅ `SharedArrayBuffer` is available (console)
2. ✅ `.wasm` files load successfully
3. ✅ Headers are present (`Cross-Origin-Embedder-Policy`, etc.)

---

## ⚡ Performance Checklist

Before going live:

- [ ] WASM files are served with correct MIME type (`application/wasm`)
- [ ] Compression enabled (gzip/brotli)
- [ ] CDN configured with edge caching
- [ ] `Cross-Origin-*` headers present
- [ ] No mixed content warnings (HTTPS everywhere)
- [ ] Asset preloading configured (optional):

```html
<link rel="preload" href="/assets/gwen_core_bg.wasm" as="fetch" crossorigin>
```

---

## 🐛 Common Issues

### Issue: "SharedArrayBuffer is not defined"

**Cause:** Missing HTTP headers

**Fix:** Add `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers (see above)

### Issue: "Failed to load WASM module"

**Cause:** Incorrect MIME type or CORS policy

**Fix:** 
1. Ensure server sends `Content-Type: application/wasm`
2. Check CORS headers allow your origin
3. Verify file is not corrupted (check file size)

### Issue: Game works locally but not in production

**Cause:** Local dev server (Vite) auto-configures headers, production doesn't

**Fix:** Explicitly configure production server headers (see platform configs above)

---

## 📊 Monitoring

### Browser Support

GWEN requires:
- `SharedArrayBuffer` (Chrome 68+, Firefox 79+, Safari 15.2+)
- `WebAssembly` (all modern browsers)
- `BigInt` (Chrome 67+, Firefox 68+, Safari 14+)

Detect and warn users:

```typescript
if (typeof SharedArrayBuffer === 'undefined' || 
    typeof WebAssembly === 'undefined' || 
    typeof BigInt === 'undefined') {
  alert('Your browser is not supported. Please update to a modern browser.');
}
```

### Analytics

Track WASM load performance:

```typescript
performance.measure('wasm-load-time', 'wasm-start', 'wasm-end');
const measure = performance.getEntriesByName('wasm-load-time')[0];
console.log(`WASM loaded in ${measure.duration}ms`);
```

---

## 🔒 Security Notes

### Content Security Policy (CSP)

If you use CSP headers, add:

```
Content-Security-Policy: 
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
```

`wasm-unsafe-eval` is required for WebAssembly instantiation.

---

## 📚 Additional Resources

- [MDN: SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Chrome: Enabling SharedArrayBuffer](https://developer.chrome.com/blog/enabling-shared-array-buffer/)
- [WebAssembly Security](https://webassembly.org/docs/security/)

---

**Ready to deploy?** Follow the platform-specific configs above and test thoroughly! 🚀

