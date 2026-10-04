# Plan: Re-add Blocking and Reporting Features Incrementally

**Source PRD**: User request to learn from mistakes and re-add features one by one with commits
**Selected Milestone**: Incremental re-addition of blocking and reporting functionality
**Complexity**: Medium

## Summary
This plan outlines the steps to re-add the blocking and reporting features that were previously rolled back, adding them back one by one with GitHub commits after each successful addition. This approach allows for learning from previous implementation and ensuring each feature works correctly before moving to the next.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | server/db.js:line 71 | Table names use snake_case (reports, blocks) |
| Errors | server/server.js:line 1177 | Error handling uses try/catch with console.error and 500 status |
| Validation | server/server.js:line 193 | Input validation follows consistent patterns |
| Database | server/db.js:line 6 | Database initialization pattern |

## Files to Change
| File | Action | Why |
|---|---|---|
| server/db.js | UPDATE | Add reports and blocks tables |
| server/server.js | UPDATE | Add API endpoints and blocking logic incrementally |

## Incremental Implementation Plan

### Phase 1: Database Foundation
**Task 1.1: Add reports and blocks tables**
- **Action**: Add CREATE TABLE statements for reports and blocks to server/db.js
- **Mirror**: Follow existing table definition pattern in the same file
- **Validate**: Start the server and verify it starts without errors
- **Commit**: "Add reports and blocks database tables"

### Phase 2: Core API Endpoints
**Task 2.1: Add POST /api/report endpoint**
- **Action**: Implement the reporting endpoint handler in server/server.js
- **Mirror**: Follow existing endpoint pattern (validation, try/catch, error handling)
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add POST /api/report endpoint"

**Task 2.2: Add POST /api/block endpoint**
- **Action**: Implement the blocking endpoint handler in server/server.js
- **Mirror**: Follow existing endpoint pattern
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add POST /api/block endpoint"

**Task 2.3: Add DELETE /api/unblock/:userId endpoint**
- **Action**: Implement the unblocking endpoint handler in server/server.js
- **Mirror**: Follow existing endpoint pattern
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add DELETE /api/unblock/:userId endpoint"

### Phase 3: Blocking Logic Restoration
**Task 3.1: Add blocking logic to /api/discover**
- **Action**: Add NOT EXISTS blocks subquery to /api/discover endpoint
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/discover endpoint"

**Task 3.2: Add blocking logic to /api/swipe**
- **Action**: Add block checking code to /api/swipe endpoint
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/swipe endpoint"

**Task 3.3: Add blocking logic to /api/matches**
- **Action**: Add NOT EXISTS blocks conditions to /api/matches endpoint
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/matches endpoint"

**Task 3.4: Add blocking logic to /api/search**
- **Action**: Add NOT EXISTS blocks conditions to /api/search endpoint
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/search endpoint"

**Task 3.5: Add blocking logic to /api/groupchats/:groupId/members**
- **Action**: Add all blocking-related validation to /api/groupchats/:groupId/members endpoint
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/groupchats/:groupId/members endpoint"

**Task 3.6: Add blocking logic to /api/groupchats/:groupId/messages**
- **Action**: Add all blocking-related validation to /api/groupchats/:groupId/messages endpoint
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/groupchats/:groupId/messages endpoint"

**Task 3.7: Add blocking logic to /api/messages/:otherId**
- **Action**: Add block checking code to /api/messages/:otherId endpoint
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/messages/:otherId endpoint"

**Task 3.8: Add blocking logic to /api/messages**
- **Action**: Add block checking code to /api/messages endpoint
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/messages endpoint"

**Task 3.9: Add blocking logic to /api/notifications**
- **Action**: Add NOT EXISTS blocks condition to /api/notifications endpoint
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Start server and verify endpoint responds correctly
- **Commit**: "Add blocking logic to /api/notifications endpoint"

## Validation After Each Step
```bash
# Start the server
npm start

# Verify server starts without errors
# For API endpoints, could test with curl or similar:
# curl -X POST http://localhost:3001/api/report -H "Content-Type: application/json" -d '{"reportedId":2,"reason":"test"}'

# Stop server after verification
# (In practice, would use proper testing framework)
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Introducing syntax errors | Low | Make small, focused changes and validate frequently |
| Breaking existing functionality | Medium | Test server startup after each change |
| Forgetting to remove test data/commit prematurely | Low | Follow strict commit-after-validation process |
| Database migration issues | Very Low | Tables are new, no existing data to migrate |

## Acceptance Criteria Per Step
- [ ] Server starts without errors after changes
- [ ] New functionality works as expected (manual verification)
- [ ] Changes committed to GitHub with descriptive message
- [ ] Ready to proceed to next incremental step

## Overall Acceptance
- [ ] All 13 incremental tasks completed
- [ ] Each step committed to GitHub individually
- [ ] Server starts and runs correctly with all features restored
- [ ] Blocking and reporting functionality fully restored