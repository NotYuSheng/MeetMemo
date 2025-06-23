### Summary

<!-- Provide a concise summary of the changes introduced in this PR. Link to relevant issue(s) if applicable. -->

Fixes #<issue_number>

---

### Changes Made

<!-- List out major changes in this PR. Be brief but specific. -->

- 
- 
- 

---

### Context / Rationale

<!-- Why are these changes being made? Is it a bug fix, feature, refactor, etc.? Provide context to help reviewers understand your thought process. -->

---

### Related Docs or References

<!-- Include any design docs, spec references, screenshots, or relevant PRs -->

---

### FastAPI Application Checklist (**Delete if PR is not relevant**)

- [ ] API follows RESTful principles (nouns in routes, proper use of verbs)
- [ ] All endpoints are async and use non-blocking I/O
- [ ] `/health` endpoint is implemented and returns 200 OK
- [ ] Long-running operations support both job polling (e.g., via /status/{job_id} or /progress/{job_id}) and optional webhooks (if a callback_url is provided).
  - [ ] If callback_url is present in the request payload, the service will POST job results to the specified URL upon completion.
  - [ ] If callback_url is not provided, the client can retrieve status and results via polling endpoints.
- [ ] Job results are persisted or recoverable if needed
- [ ] API schema (OpenAPI) is exposed and browsable at `/docs` or `/redoc`
- [ ] Branch name follows conventions (e.g., `feature/*`, `bugfix/*`) — do **not** use `dev` directly

---

### General Checklist

- [ ] I have tested these changes locally
- [ ] I have updated relevant documentation or added comments where needed
- [ ] I have linked relevant issues and tagged reviewers
- [ ] I have followed coding conventions and naming standards
