# Edge Cases — F001_PublicLanding

| Scenario | What Happens | User-Facing Message |
|----------|-------------|---------------------|
| Contact form submitted with one or more required fields empty | Validation fails; form returns 400 with inline error messages | "Please fill in all required fields." |
| Contact form submitted successfully | Message is persisted via POST /api/v1/contact; success confirmation shown | "Your message has been sent. We'll get back to you soon." |
| User visits /terms, /privacy, /cookies, or /security | Static page content is rendered | None — static content only |
| Static page URL does not exist | HTTP 404 is returned; platform renders a 404 page | "Page not found." |
| User with an active session visits the home page | Home page renders normally; auth state has no effect on public content visibility | None |
