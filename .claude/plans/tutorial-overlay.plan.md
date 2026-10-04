# Plan: Add Tutorial Walkthrough Overlay to public/app.js

**Source PRD**: Conversational request
**Selected Milestone**: Tutorial overlay implementation
**Complexity**: Medium

## Summary
Add a tutorial walkthrough overlay to public/app.js that shows once per user, based on the has_seen_tutorial flag. The overlay will be modeled after the existing showMatchModal() function and will include a temporary "Replay tutorial" button for testing.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | public/app.js:345-363 | showMatchModal() function structure |
| Overlay styling | public/app.js:345-363 | .overlay, .matchcard, .btnrow classes |
| Function placement | public/app.js:363 | Near showMatchModal/closeOverlay functions |
| HTML structure | public/app.js:485-556 | loadProfile() function format |

## Files to Change
| File | Action | Why |
|---|---|---|
| public/app.js | UPDATE | Add tutorialSteps array, tutorial functions, and integration points |

## Tasks
### Task 1: Add tutorialSteps data array
- **Action**: Add the tutorialSteps array after other top-level constants
- **Mirror**: Existing constant definitions (lines 1-16)
- **Validate**: Check that array is properly formatted and placed

### Task 2: Add tutorial functions
- **Action**: Add showTutorial(), renderTutorialStep(), nextTutorialStep(), finishTutorial() functions
- **Mirror**: showMatchModal() and closeOverlay() functions (lines 345-363)
- **Validate**: Functions follow same patterns and use existing .overlay/.matchcard/.btnrow classes

### Task 3: Integrate with loadForCurrentUser()
- **Action**: Add tutorial show condition after render() call
- **Mirror**: Existing render() call pattern in loadForCurrentUser() (line 114)
- **Validate**: Tutorial shows only when !currentUser.has_seen_tutorial

### Task 4: Add temporary replay button
- **Action**: Add "Replay tutorial" button to loadProfile() HTML output
- **Mirror**: Existing button patterns in loadProfile() (lines 529, 534)
- **Validate**: Button includes testing comment and calls showTutorial()

## Validation
```bash
# Check tutorialSteps array exists
grep "const tutorialSteps" public/app.js

# Check tutorial functions exist
grep "function showTutorial" public/app.js
grep "function renderTutorialStep" public/app.js
grep "function nextTutorialStep" public/app.js
grep "async function finishTutorial" public/app.js

# Check integration in loadForCurrentUser
grep -A 3 "render();" public/app.js | grep "showTutorial"

# Check replay button in loadProfile
grep "Replay tutorial" public/app.js
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Naming conflicts | Low | Using unique function/variable names |
| DOM manipulation errors | Low | Following existing overlay patterns |
| API endpoint mismatch | Low | Using same api() function as other endpoints |
| CSS class issues | Low | Reusing existing .overlay/.matchcard/.btnrow classes |

## Acceptance
- [ ] tutorialSteps array added after top-level constants
- [ ] tutorial functions added near showMatchModal/closeOverlay
- [ ] loadForCurrentUser() shows tutorial when !currentUser.has_seen_tutorial
- [ ] loadProfile() includes temporary replay button with comment
- [ ] All changes follow existing code patterns
- [ ] Validation passes: all required elements present