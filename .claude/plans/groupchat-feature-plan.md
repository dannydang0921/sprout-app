# Plan: Add Group Chat Functionality

## Requirements Restatement
- Implement group chat functionality allowing users to create group chats with their connections
- Users should be able to create, join, leave group chats
- Users should be able to send and receive messages in group chats
- Group chats should respect existing blocking relationships (blocked users cannot be in same group)
- Should integrate seamlessly with existing authentication, messaging, and blocking systems

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `sprout-app/server/server.js:617` | Function names like `messagesHandler`, consistent with existing endpoint handlers |
| Errors | `sprout-app/server/server.js:644-665` | Validation pattern: check inputs early, return 400 for invalid inputs, 403 for forbidden, 404 for missing resources |
| Data access | `sprout-app/server/server.js:634-640` | Parameterized SQL queries using `db.prepare()` with proper WHERE clauses |
| Response format | `sprout-app/server/server.js:663-664` | Return created resource with `res.json(row)` for POST endpoints |
| Database structure | `sprout-app/server/db.js:49-56` | Simple table structure with AUTOINCREMENT IDs, TEXT fields, DEFAULT values, FOREIGN KEY constraints |

## Files to Change
| File | Action | Why |
|---|---|---|
| `sprout-app/server/db.js` | UPDATE | Add new tables for group chats, group members, and group messages |
| `sprout-app/server/server.js` | UPDATE | Add new API endpoints for group chat functionality |
| `sprout-app/server/server.js` | UPDATE | Add indexes for performance on new tables |

## Tasks
### Task 1: Add database schema for group chats
- **Action**: Create three new tables:
  1. `group_chats`: stores group chat metadata (id, name, created_by, created_at)
  2. `group_members`: stores which users are in which groups (id, group_id, user_id, joined_at, role)
  3. `group_messages`: stores messages in group chats (id, group_id, sender_id, text, created_at, read_by)
- **Mirror**: Follow the pattern from existing table creation in db.js (lines 9-91)
- **Validate**: 
  - Verify tables are created correctly by checking schema
  - Test foreign key constraints work properly
  - Test that indexes can be added successfully

### Task 2: Implement group chat creation endpoint
- **Action**: Create POST `/api/groupchats` endpoint for creating new group chats
- **Mirror**: Follow the pattern from POST `/api/messages` (lines 644-665) for validation and response format
- **Validate**:
  - Test that only authenticated users can create groups
  - Test that group creation fails with invalid inputs (missing name, etc.)
  - Test that created group returns proper JSON response with id and details
  - Test that creator is automatically added as admin member

### Task 3: Implement group member management endpoints
- **Action**: Create endpoints for managing group members:
  - POST `/api/groupchats/:groupId/members` - add user to group
  - DELETE `/api/groupchats/:groupId/members/:userId` - remove user from group
  - GET `/api/groupchats/:groupId/members` - list group members
- **Mirror**: Follow the pattern from existing endpoints for validation, authentication, and error handling
- **Validate**:
  - Test that only group members/admins can manage membership
  - Test that blocked users cannot be added to groups
  - Test that users cannot add themselves multiple times
  - Test that leaving a group works correctly
  - Test that admins can remove members, regular members can only leave

### Task 4: Implement group messaging endpoints
- **Action**: Create endpoints for group messaging:
  - GET `/api/groupchats/:groupId/messages` - get messages for a group
  - POST `/api/groupchats/:groupId/messages` - send a message to group
- **Mirror**: Follow the pattern from existing messages endpoints (lines 617-665)
- **Validate**:
  - Test that only group members can send/receive messages
  - Test that messages are properly stored and retrieved
  - Test that message ordering works correctly (by created_at)
  - Test that pagination works for large message histories
  - Test that read receipts/functionality works appropriately

### Task 5: Implement group listing and discovery endpoints
- **Action**: Create endpoints for discovering and listing group chats:
  - GET `/api/groupchats` - list groups the user is a member of
  - GET `/api/groupchats/:groupId` - get details of a specific group
- **Mirror**: Follow the pattern from existing listing endpoints like `/api/matches` and `/api/search`
- **Validate**:
  - Test that users only see groups they're members of
  - Test that group details include member list and basic info
  - Test that unauthorized access to groups returns appropriate errors
  - Test that group search/filtering works if implemented

### Task 6: Add database indexes for performance
- **Action**: Add indexes on frequently queried columns in new tables:
  - Index on group_members(group_id, user_id) for fast membership lookups
  - Index on group_messages(group_id, created_at) for fast message retrieval
  - Index on group_chats(created_by) for finding user's created groups
- **Mirror**: Follow the existing index pattern in db.js (lines 176-185)
- **Validate**:
  - Verify indexes are created by checking schema
  - Test that query performance is reasonable with test data

## Validation
```bash
# Start the server
npm start &

# Wait for server to start
sleep 3

# Authenticate a test user
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user-7@sprout.local","password":"sprout-dev-7"}' \
  -c cookies.txt

# Test creating a group chat
curl -s -X POST http://localhost:3001/api/groupchats \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Study Group"}' | jq .

# Test getting user's groups
curl -s -X GET http://localhost:3001/api/groupchats \
  -b cookies.txt | jq .

# Test adding a member to group
# (would need second user authenticated first)

# Test sending a group message
# Test retrieving group messages

# Stop server
kill $!
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Complexity of managing group state and permissions | Medium | Break down into small, testable components; reuse existing patterns |
| Performance degradation with many groups/messages | Medium | Add appropriate indexes; consider message limits/pagination |
| Security vulnerabilities in group access controls | Medium | Reuse existing blocking/authentication patterns; validate access on every endpoint |
| Data inconsistency in group membership | Low | Use transactions for multi-step operations; add foreign key constraints |
| Confusion between direct messages and group messages | Low | Clear naming and separation of concerns in API design |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] Blocking functionality preserved with new features
- [ ] API follows existing conventions
- [ ] Group chats respect existing relationships (blocks, matches, etc.)
- [ ] Proper error handling and validation implemented

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)