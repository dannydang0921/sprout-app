# Plan: Rollback Blocking and Reporting Features

**Source PRD**: User request to rollback blocking and reporting features
**Selected Milestone**: Rollback of blocking and reporting functionality
**Complexity**: Medium

## Summary
This plan outlines the steps to remove the blocking and reporting features that were previously added to the Sprout app. This includes removing database tables, API endpoints, and all references to blocking functionality throughout the codebase.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | server/db.js:line 71 | Table names use snake_case (reports, blocks) |
| Errors | server/server.js:line 1177 | Error handling uses try/catch with console.error and 500 status |
| Tests | No existing tests found | Will need to verify functionality manually after changes |

## Files to Change
| File | Action | Why |
|---|---|---|
| server/db.js | UPDATE | Remove reports and blocks tables |
| server/server.js | UPDATE | Remove reporting/blocking endpoints and all blocking references |

## Tasks
### Task 1: Remove database tables
- **Action**: Delete the CREATE TABLE statements for reports and blocks from server/db.js
- **Mirror**: Follow existing table definition pattern in the same file
- **Validate**: Start the server and verify it starts without errors

### Task 2: Remove reporting endpoint
- **Action**: Delete the POST /api/report route handler from server/server.js (lines 1150-1180)
- **Mirror**: Follow existing endpoint pattern in the same file
- **Validate**: Verify endpoint no longer exists by attempting to call it

### Task 3: Remove blocking endpoints
- **Action**: Delete the POST /api/block and DELETE /api/unblock/:userId route handlers from server/server.js (lines 1182-1241)
- **Mirror**: Follow existing endpoint pattern in the same file
- **Validate**: Verify endpoints no longer exist by attempting to call them

### Task 4: Remove blocking references from discover endpoint
- **Action**: Remove the NOT EXISTS blocks subquery from /api/discover endpoint (lines 429-433)
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Verify discover endpoint still works without blocking checks

### Task 5: Remove blocking references from swipe endpoint
- **Action**: Remove block checking code from /api/swipe endpoint (lines 445-453)
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Verify swipe endpoint still works without blocking checks

### Task 6: Remove blocking references from matches endpoint
- **Action**: Remove NOT EXISTS blocks conditions from /api/matches endpoint (lines 511-512)
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Verify matches endpoint still works without blocking checks

### Task 7: Remove blocking references from search endpoint
- **Action**: Remove NOT EXISTS blocks conditions from /api/search endpoint (lines 605-610)
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Verify search endpoint still works without blocking checks

### Task 8: Remove blocking references from group chat members endpoint
- **Action**: Remove all blocking-related code from /api/groupchats/:groupId/members endpoint (lines 777-798)
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Verify group chat members endpoint still works without blocking checks

### Task 9: Remove blocking references from group chat messages endpoint
- **Action**: Remove all blocking-related code from /api/groupchats/:groupId/messages endpoint (lines 943-966)
- **Mirror**: Follow existing validation pattern in the same endpoint
- **Validate**: Verify group chat messages endpoint still works without blocking checks

### Task 10: Remove blocking references from messages endpoints
- **Action**: Remove block checking code from both /api/messages/:otherId and /api/messages endpoints (lines 1043-1051 and 1069-1077)
- **Mirror**: Follow existing validation pattern in the same endpoints
- **Validate**: Verify messages endpoints still work without blocking checks

### Task 11: Remove blocking references from notifications endpoint
- **Action**: Remove NOT EXISTS blocks condition from /api/notifications endpoint (line 1089)
- **Mirror**: Follow existing query pattern in the same endpoint
- **Validate**: Verify notifications endpoint still works without blocking checks

## Validation
```bash
# Start the server
npm start

# Verify server starts without errors
# Test that core functionality still works:
# - User registration and login
# - Profile viewing and editing
# - Discover, swipe, matches
# - Group chat creation and messaging
# - Posts functionality
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaking core functionality by removing too much | Medium | Make incremental changes and test frequently |
| Forgetting to remove all blocking references | Medium | Carefully review all endpoints for blocking logic |
| Introducing syntax errors | Low | Use proper JavaScript syntax and validate with linter |
| Database migration issues | Low | Since we're removing tables, existing data in those tables will be lost (acceptable for rollback) |

## Acceptance
- [ ] All blocking and reporting database tables removed
- [ ] All blocking and reporting API endpoints removed
- [ ] All blocking logic removed from other endpoints
- [ ] Server starts without errors
- [ ] Core functionality (auth, profiles, discover, swipe, matches, group chats, posts) still works