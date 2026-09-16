As an authenticated user, I want to mark that I've seen the tutorial so that it doesn't show up again on future logins.

Acceptance Criteria:
- Given I am authenticated, when I POST to /api/tutorial/seen, then my has_seen_tutorial field is set to 1 in the database
- Given I am authenticated, when I POST to /api/tutorial/seen, then the response body is { ok: true }
- Given I am not authenticated, when I POST to /api/tutorial/seen, then the response status is 401