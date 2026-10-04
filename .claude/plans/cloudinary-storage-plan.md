# Plan: Migrate Photo Uploads from Local Storage to Cloudinary

**Source PRD**: User request
**Selected Milestone**: Move photo uploads to Cloudinary
**Complexity**: Medium

## Summary
Migrate the Sprout app's photo upload system from local disk storage to Cloudinary to persist uploads across Railway deploys. This involves implementing the Cloudinary storage adapter in the existing storage service abstraction, updating environment variables, and ensuring the upload flow works correctly with Cloudinary's API.

## Patterns to Mirror
| Category | Source | Pattern |
|----------|--------|---------|
| Naming | `storageService.js:108` | `getStorageAdapter()` function with switch statement for storage types |
| Errors | `storageService.js:113-119` | Throwing descriptive errors for unimplemented adapters |
| Tests | `test/tutorial.test.js` | Using async/await with try/catch for async operations |

## Files to Change
| File | Action | Why |
|------|--------|-----|
| `server/services/storageService.js` | UPDATE | Implement Cloudinary storage adapter |
| `.env.example` | CREATE | Document required Cloudinary environment variables |
| `server/server.js` | UPDATE | Remove local-specific cleanup logic that checks for '/uploads/' prefix |

## Tasks
### Task 1: Implement Cloudinary Storage Adapter
- **Action**: Add CloudinaryStorageAdapter class to storageService.js with methods for generating filenames, saving files (uploading to Cloudinary), deleting files, and getting file URLs
- **Mirror**: Follow the pattern of LocalStorageAdapter class in the same file
- **Validate**: Run the app and verify storageAdapter works when STORAGE_TYPE=cloudinary

### Task 2: Add Environment Variable Documentation
- **Action**: Create .env.example file with required Cloudinary variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
- **Mirror**: Follow common .env.example patterns from other projects
- **Validate**: Check that .env.example contains clear documentation for each variable

### Task 3: Update Account Deletion Logic
- **Action**: Modify the account deletion cleanup in server.js to work with Cloudinary URLs instead of checking for '/uploads/' prefix
- **Mirror**: Use the storageAdapter.deleteFile() method already being used elsewhere
- **Validate**: Verify that avatar files are properly deleted from Cloudinary when accounts are removed

### Task 4: Test Integration
- **Action**: Test the complete upload flow with Cloudinary storage
- **Mirror**: Use the existing multer configuration and upload route patterns
- **Validate**: Confirm photos upload successfully to Cloudinary and URLs are stored in database

## Validation
```bash
# Set environment variables for Cloudinary (would need actual values in real scenario)
export STORAGE_TYPE=cloudinary
export CLOUDINARY_CLOUD_NAME=test
export CLOUDINARY_API_KEY=test
export CLOUDINARY_API_SECRET=test

# Start the server and test upload endpoint
node server/server.js

# Test with curl or Postman to /api/profile/:userId/photo endpoint
# Verify image uploads to Cloudinary and returns URL
```

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cloudinary API rate limits | Medium | Implement retry logic and check Cloudinary response headers |
| Missing environment variables | Low | Add validation in getStorageAdapter() to check required vars |
| Broken backward compatibility | Low | Keep local storage as default and test both modes |
| File type validation issues | Low | Reuse existing multer fileFilter configuration |
| Costs from Cloudinary usage | Low | Monitor usage and set up alerts if needed |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] Uploads work with both local and Cloudinary storage (configurable via STORAGE_TYPE)
- [ ] Existing functionality preserved (profile updates, account deletion, etc.)