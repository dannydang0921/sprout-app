# Plan: Add Reporting and Blocking Features to Sprout App

**Source PRD**: User request
**Selected Milestone**: Implement reporting and blocking system
**Complexity**: Medium

## Summary
Add user reporting and blocking capabilities to the Sprout app. Users can report profiles with reasons/details and block other users independently. Blocks must be filtered bidirectionally across all discovery, matching, and messaging systems. Implementation includes new database tables, API routes, and query modifications to enforce blocking rules.

## Patterns to Mirror
| Category | Source | Pattern |
|----------|--------|---------|
| Naming | `server/db.js:9` | Snake_case table names, id as PRIMARY KEY AUTOINCREMENT |
| Errors | `server/server.js:212` | Returning 409 for conflicts, 400 for validation, 401/403 for auth |
| Tests | `test/cloudinary-storage.test.js:110-130` | Using async/await with request supertest, checking status codes and response bodies |
| Database | `server/db.js:30-39` | Foreign key constraints, UNIQUE indexes for relationship tables |
| Middleware | `server/server.js:133-140` | requireAuth pattern for protecting routes |

## Files to Change
| File | Action | Why |
|------|--------|-----|
| `server/db.js` | UPDATE | Add reports and blocks tables with appropriate indexes and constraints |
| `server/server.js` | UPDATE | Add API routes for reporting/blocking, modify existing queries to filter blocked users |
| `server/services/storageService.js` | UPDATE | (No changes needed - storage layer unaffected) |
| `.env.example` | UPDATE | (No changes needed - already covered by Cloudinary plan) |

## Tasks
### Task 1: Database Schema Updates
- **Action**: Add reports and blocks tables to db.js with proper indexes
- **Mirror**: Follow the pattern of existing tables (swipes, matches, messages)
- **Validate**: Start server and verify tables are created correctly

### Task 2: Implement Reporting API
- **Action**: Create POST /api/reports route to create new reports
- **Mirror**: Follow the pattern of POST /api/auth/register for validation and error handling
- **Validate**: Test creating reports and verify they're stored in database

### Task 3: Implement Blocking API
- **Action**: Create POST /api/blocks and DELETE /api/blocks/:blockedId routes
- **Mirror**: Follow the pattern of POST /api/swipe for relationship management
- **Validate**: Test creating and removing blocks, verify unique constraint

### Task 4: Implement Blocking Filters
- **Action**: Modify /api/discover, /api/matches, /api/messages, /api/swipe to exclude blocked users
- **Mirror**: Use the existing WHERE id != ? AND id NOT IN (SELECT ...) pattern from discover route
- **Validate**: Verify blocked users don't appear in discover/matches and can't message/swipe

### Task 5: Test Integration
- **Action**: Test the complete reporting and blocking flow
- **Mirror**: Use the existing test patterns from test/cloudinary-storage.test.js
- **Validate**: Confirm reports/blocks are stored correctly and filtering works

## Validation
```bash
# Start server
node server/server.js

# Test reporting flow:
# 1. Register two users
# 2. Login as user 1
# 3. POST to /api/reports with reported_id=user2_id, reason, details
# 4. Verify report stored in database

# Test blocking flow:
# 1. Login as user 1
# 2. POST to /api/blocks with blocked_id=user2_id
# 3. Verify block stored and bidirectional filtering works
# 4. DELETE /api/blocks/:user2_id to remove block
# 5. Verify filtering removed

# Test edge cases:
# - Cannot block yourself
# - Duplicate blocks prevented by unique constraint
# - Blocked users don't appear in discover/matches
# - Cannot message or swipe blocked users
```

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Performance impact from additional JOINs | Medium | Add proper indexes on blocker_id/blocked_id columns |
| Forgetting to block in one direction (e.g., only hiding from blocker, not blocked) | High | Create helper function or view for getting visible users |
| Breaking existing functionality during query modifications | Medium | Test each route individually after changes |
| Reports/blocks accumulating over time without cleanup | Low | Not required for MVP - can add later if needed |
| Race conditions in block creation | Low | Database unique constraint prevents duplicates |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] Reporting works: users can report with reason/details
- [ ] Blocking works: users can block/unblock independently
- [ ] Bidirectional filtering: if A blocks B, B disappears from A's feed AND A disappears from B's
- [ ] Existing functionality preserved (auth, profiles, swiping, matches, messages, posts)