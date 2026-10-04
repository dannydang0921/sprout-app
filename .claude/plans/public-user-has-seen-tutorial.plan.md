# Plan: Add has_seen_tutorial to publicUser() SELECT statement

**Source PRD**: Conversational request
**Selected Milestone**: publicUser function fix
**Complexity**: Small

## Summary
Fix the publicUser() function in server/server.js to include the has_seen_tutorial column in its SELECT statement so the frontend can access this field for tutorial visibility logic.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | server/server.js:130-136 | Function naming and structure |
| SQL queries | server/server.js:131-134 | Existing SELECT statement format |
| Comma-separated lists | server/server.js:132-134 | Current column listing style |

## Files to Change
| File | Action | Why |
|---|---|---|
| server/server.js | UPDATE | Add has_seen_tutorial to publicUser() SELECT statement |

## Tasks
### Task 1: Update publicUser() SELECT statement
- **Action**: Add has_seen_tutorial to the column list in the SELECT statement
- **Mirror**: Existing column listing pattern (lines 132-134)
- **Validate**: 
  - Check that has_seen_tutorial appears in the SELECT clause
  - Verify comma-separated formatting is consistent
  - Confirm no other changes to query or function

## Validation
```bash
# Check that the column is included
grep -A 5 "function publicUser" server/server.js

# Verify the SELECT statement has the right columns
grep -A 4 "SELECT id, name, role" server/server.js | grep has_seen_tutorial
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaking the SQL syntax | Low | Simple addition to existing list |
| Inconsistent formatting | Low | Following existing pattern exactly |
| Affecting other functionality | Low | Function only used for user data retrieval |

## Acceptance
- [ ] has_seen_tutorial added to SELECT statement in publicUser()
- [ ] Column follows same comma-separated pattern as existing columns
- [ ] No other changes to query or function
- [ ] Validation passes: SELECT statement includes the new column