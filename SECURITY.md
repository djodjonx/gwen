# Security Policy

## Supported Versions

Currently supported versions and their security status:

| Version | Status | Support Until |
|---------|--------|---|
| 0.1.x | ✅ Active | 2027-03-03 |
| 0.0.x | ⛔ EOL | 2025-12-31 |

**Version 0.1.x** receives security updates immediately.
**Older versions** receive critical security patches only.

## Reporting a Vulnerability

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email security concerns to:

```
security@gwen-engine.dev
```

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if applicable)

**Timeline:**
- We aim to acknowledge reports within 48 hours
- We'll provide status updates every 7 days
- Critical vulnerabilities will be patched ASAP
- Non-critical issues patched in next release

## Security Best Practices

### For Application Developers

1. **Keep GWEN Updated**
   ```bash
   npm update@djodjonx/gwen-engine-core
   ```

2. **Use HTTPS in Production**
   - Serve WASM modules over HTTPS only
   - Browser security policies require it

3. **Validate User Input**
   ```typescript
   // Always validate data from users/network
   const x = parseFloat(userInput);
   if (isNaN(x)) throw new Error('Invalid input');
   ```

4. **Don't Expose Sensitive Data**
   - Avoid putting secrets in client-side code
   - Use environment variables for API keys
   - Keep authentication on backend

5. **Keep Dependencies Updated**
   ```bash
   pnpm audit
   pnpm update
   ```

### For Contributors

1. **Dependency Scanning**
   - We use `npm audit` and `cargo audit`
   - Check for vulnerabilities before committing
   ```bash
   npm audit
   cargo audit
   ```

2. **Code Review**
   - All PRs require security review
   - Never approve PRs that bypass security checks

3. **No Secrets in Code**
   - Never commit API keys, tokens, or passwords
   - Use `.env` files (never commit `.env`)

4. **WASM Safety**
   - WASM is memory-safe by design
   - Still follow security best practices
   - Validate all inputs from JavaScript

## Known Issues & Workarounds

Currently no known security vulnerabilities.

## Security Considerations

### WASM Security

GWEN's core is written in Rust and compiled to WebAssembly. This provides:

- ✅ **Memory Safety** - No buffer overflows, no use-after-free
- ✅ **Type Safety** - No type confusion
- ✅ **Sandboxing** - WASM runs in browser sandbox
- ✅ **No Native Access** - Can't access system resources

### JavaScript Interop

The TypeScript API is a thin wrapper around WASM:

- ✅ **Input Validation** - All WASM calls validate data
- ✅ **Error Handling** - Errors don't crash the engine
- ✅ **No Unsafe** - No `unsafe` Rust code in core

### Recommendations

1. **Always validate user input**
   ```typescript
   // ✓ Good
   const position = Math.max(0, userInput);

   // ✗ Bad
   engine.addComponent(entity, Position, userInput);
   ```

2. **Use HTTPS in production**
   - Browser policy requires it for WASM
   - Protects WASM modules from tampering

3. **Keep dependencies updated**
   - Regular updates fix security issues
   - Use `dependabot` for automatic updates

4. **Monitor for CVEs**
   - Subscribe to security mailing list
   - Check GitHub security advisories

## Vulnerability Disclosure Policy

### Coordinated Disclosure

We practice responsible disclosure:

1. Report vulnerability privately (see above)
2. We acknowledge receipt within 48 hours
3. We provide ETA for patch
4. We release patch and credit reporter
5. Reporter can request embargo period (max 90 days)

### Public Disclosure

After coordinated disclosure:

- We publish security advisory
- We release patched version
- We credit the security researcher (with permission)
- We list in CHANGELOG

## Security Roadmap

- 🔄 Automated dependency scanning (CI)
- 🔄 Annual security audit (professional)
- 🔄 SBOM (Software Bill of Materials)
- 🔄 Security badge on README

## Contact

**Security Team:** security@gwen-engine.dev

**Maintainers:**
- Jonathan Moutier - [@djodjonx](https://github.com/djodjonx)

---

**Last Updated:** March 3, 2026


