# Plan: Fix CORS Origin Allowlist to Match Server Port

**Source PRD**: Conversational request
**Selected Milestone**: CORS port synchronization fix
**Complexity**: Small

## Summary
Fix the CORS origin allowlist in server/server.js so it dynamically uses the actual server port instead of hardcoded port 3000. This prevents CORS blocking when the server runs on a different port (like 3001) due to PORT environment variable.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | server/server.js:110 | `const PORT = process.env.PORT || 3001;` |
| Environment variables | server/server.js:16-27 | Conditional CORS configuration based on NODE_ENV |
| Template literals | Modern JS pattern | Using backticks for string interpolation |

## Files to Change
| File | Action | Why |
|---|---|---|
| server/server.js | UPDATE | Move PORT declaration before CORS config and use it in allowedOrigins fallback |

## Tasks
### Task 1: Fix CORS Origin Allowlist
- **Action**: Move PORT declaration before CORS configuration and update development fallback to use template literals
- **Mirror**: Existing PORT declaration pattern (line 110) and environment-based configuration (lines 16-27)
- **Validate**: 
  - Check that PORT is used in allowedOrigins when CORS_ORIGINS is not set
  - Verify production path (CORS_ORIGINS env var) remains unchanged
  - Confirm server still starts and accepts requests from correct origin

## Validation
```bash
# Start server and test CORS behavior
node server/server.js &
SERVER_PID=$!
sleep 2

# Test request from correct origin should succeed
curl -H "Origin: http://localhost:3001" -I http://localhost:3001/api/auth/me 2>/dev/null | head -1

# Test request from wrong origin should fail  
curl -H "Origin: http://localhost:3000" -I http://localhost:3001/api/auth/me 2>/dev/null | head -1

kill $SERVER_PID
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Moving PORT declaration breaks other code that uses it | Low | PORT is only used after line 110 currently, and we're moving it earlier but still before first use |
| Template literal syntax error | Low | Simple string interpolation, easy to verify |
| Production CORS behavior changes | Low | Only modifying development fallback path |

## Acceptance
- [ ] PORT declaration moved before CORS configuration
- [ ] Development allowedOrigins uses template literals with PORT variable
- [ ] Production CORS path (CORS_ORIGINS env var) unchanged
- [ ] Validation passes: server accepts requests from actual running port