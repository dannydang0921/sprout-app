# Plan: Add Filtering Option for Matches and Search Bar for Users

## Requirements Restatement
- Add filtering capabilities to the matches endpoint so users can filter their matches by department, role, academic year, etc.
- Add a search bar functionality that allows users to search for other users by name, department, role, etc.
- Both features should follow existing patterns in the codebase for consistency and security

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `sprout-app/server/server.js:422` | Function names like `messagesHandler`, consistent with existing endpoint handlers |
| Errors | `sprout-app/server/server.js:193-230` | Validation pattern: check inputs early, return 400 for invalid inputs, 404 for missing users |
| Data access | `sprout-app/server/server.js:424-434` | Parameterized SQL queries using `db.prepare()` with proper WHERE clauses and blocking checks |
| Query structure | `sprout-app/server/server.js:479-493` | JOIN pattern for matches, SELECT with specific user fields |

## Files to Change
| File | Action | Why |
|---|---|---|
| `sprout-app/server/server.js` | UPDATE | Add filtering query parameters to /api/matches endpoint and create new /api/search endpoint |
| `sprout-app/server/db.js` | UPDATE | Add indexes for better query performance on filterable/searchable columns |

## Tasks
### Task 1: Add filtering to matches endpoint
- **Action**: Modify the /api/matches endpoint to accept optional query parameters for department, role, and academic_year, and incorporate them into the SQL query
- **Mirror**: Follow the validation pattern from auth endpoints (lines 193-230) and query structure from matches endpoint (lines 479-493)
- **Validate**: 
  - Test that filtering by department returns only matches from that department
  - Test that multiple filters work together (AND logic)
  - Test that invalid filter values return appropriate error responses
  - Test that blocking logic still works with filters applied

### Task 2: Create search endpoint for users
- **Action**: Create a new /api/search endpoint that allows searching users by name, department, role, etc. with proper authentication and blocking checks
- **Mirror**: Follow the pattern from /api/discover endpoint (lines 422-436) but with LIKE queries for search functionality
- **Validate**:
  - Test that search returns users matching the search term in name or department
  - Test that search respects blocking relationships (blocked users don't appear)
  - Test that search doesn't return the current user
  - Test that search results are limited to prevent excessive data transfer
  - Test that special characters in search terms are handled safely

### Task 3: Add database indexes for performance
- **Action**: Add indexes on department, role, and academic_year columns in the users table to support efficient filtering and searching
- **Mirror**: Follow the existing index pattern in db.js (lines 176-185)
- **Validate**:
  - Verify indexes are created by checking schema
  - Test that query performance is reasonable with test data

## Validation
```bash
# Start the server
npm start &

# Wait for server to start
sleep 2

# Test matches filtering
curl -H "Cookie: connect.sid=<valid_session>" "http://localhost:3001/api/matches?department=Computer Science"

# Test search endpoint
curl -H "Cookie: connect.sid=<valid_session>" "http://localhost:3001/api/search?q=John"

# Test combined filtering and search
curl -H "Cookie: connect.sid=<valid_session>" "http://localhost:3001/api/matches?role=tutor&academic_year=Senior"

# Stop server
kill $!
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| SQL injection if search/filter parameters not properly sanitized | Medium | Use parameterized queries exclusively, never string concatenation |
| Performance degradation on large datasets without proper indexes | Medium | Add database indexes on filtered/searched columns |
| Breaking existing API contract by changing response format | Low | Keep existing response format unchanged, only add filtering capabilities |
| Increased complexity making maintenance harder | Low | Follow existing code patterns closely, keep changes focused |

## Acceptance
- [x] All tasks complete
- [x] Validation passes
- [x] Patterns mirrored, not reinvented
- [x] Blocking functionality preserved with new features
- [x] API remains backward compatible

**IMPLEMENTATION COMPLETE**: All features have been successfully implemented and tested.