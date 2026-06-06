# Edge Cases — F004_ProfileManagement

| Scenario | What Happens | User-Facing Message |
|----------|-------------|---------------------|
| Profile save with empty username | Unique constraint check fails; validation error returned | "This username is already taken." |
| Profile save with reserved/invalid username | Username format validation fails; 400 returned | "Username may only contain letters, numbers, and underscores." |
| Avatar upload exceeds size limit | File size check fails; upload rejected | "Image must be smaller than 2MB." |
| Avatar upload with invalid file type | MIME type check fails; upload rejected | "Only JPG, PNG, and WebP images are allowed." |
| Banner upload exceeds size limit | File size check fails; upload rejected | "Image must be smaller than 2MB." |
| Change password with wrong current password | Current password check fails; 400 returned | "Current password is incorrect." |
| New password does not meet strength requirements | Validation fails; 400 returned | "Password must be at least 8 characters and include a number." |
| Terminate current session from DeviceList | Delete button is hidden or disabled for the current session | None — button not shown |
| Terminate another user's session | Ownership check fails; 403 returned | "You do not have permission to end this session." |
| No active sessions to display | DeviceList shows an empty state with a message | "You are only logged in on this device." |
