# Changelog

All notable updates are listed below.

## 2026-04-29

### Added
- Help Center page with ticket submission, FAQs, attachments, and My Tickets history with comments.
- Admin dashboard Pending Tickets tab with badge count, claim controls, status updates, and comment replies.
- Admin slot management for tenant family slots and landlord property slots (add/remove with admin payment records).
- "See more properties" actions on Home recommendations and Tenant dashboard.
- Bug report categories and Help Center link in the footer.

### Changed
- Support ticket APIs now send detailed admin email notifications with attachment links.
- Bug report emails are sent to all active admins and reports are persisted in `bug_reports`.
- Subscription slot calculations reconcile paid and used slots for tenant and landlord plans to keep availability accurate.
- PayMongo webhook logic now reconciles slot totals with usage and sends slot purchase receipts.
- Auth modal accepts a redirect target; Help Center is included in the public allowlist and navbar hide list.

### Fixed
- Property creation form now pre-fills owner email and phone from the logged-in profile.

## 2026-04-10

### Added
- Property forms now include country and state/province fields with dynamic suggestions:
  - Country suggestions while typing.
  - Philippine province-aware behavior plus fallback suggestions for other countries.
- Discovery sections now include Nearby Properties for visitor and tenant (no-active-property) views when location is available.
- All Properties filter UX enhancements:
  - Rating stars now show hover preview (e.g., hovering star 3 highlights stars 1-3).
  - Amenities filter now shows first 10 entries by default with See More / See Less toggle.

### Changed
- All Properties map behavior:
  - Opens from a default zoomed-out view, then auto-focuses to user location when available.
  - Nearby coverage is centered on a 1km radius.
  - Property marker visibility is zoom-aware: nearby-only at focused zoom, and all markers become visible when zooming out.
  - Initial auto-focus animation was slowed and configured to run only once per page lifecycle to avoid repeated loops when toggling Grid/Map.
- Navigation and public access:
  - Visitor-friendly navigation links were expanded for Properties, Landlord List, and Compare.
  - Public route allowlist now includes compare and landlord listing/profile paths.

### Fixed
- TypeScript deprecation warning for jsconfig baseUrl is now silenced by adding compiler option ignoreDeprecations: "6.0".

## 2026-04-01

### Added
- Tenant dashboard utility row now shows Internet due date when internet is available and not marked as free.
- Landlord maintenance actions:
  - Added Rejected button for pending requests.
  - Added Cancel button beside Edit Details for scheduled requests.
- Tenant maintenance flow:
  - Added custom Mark as Done confirmation modal (in-app), replacing browser native confirm dialog.
- Messaging permissions in chat:
  - Tenant can message only landlord(s) they are under.
  - Landlord can message only tenants under their occupancies.
  - Landlord can also message other landlords.
- Runtime permission checks now run before starting a new conversation and before sending messages.

### Changed
- Global route access behavior for unauthenticated users:
  - Protected routes now redirect to / instead of /auth.
  - Added app-level auth check to block direct URL access to protected pages when logged out.
- Updated redirect targets in protected pages to use / for logged-out users.

### Fixed
- Maintenance: Log Maintenance Cost button visibility now handles both complete and completed status values robustly.
- Maintenance: Family-member maintenance requests can now resolve parent occupancy properly for security deposit deduction.
- Maintenance billing: Improved occupancy and tenant resolution so payment bills are created for the correct tenant.
- Bookings UI:
  - Removed PAST badge on cancelled/rejected/completed booking states.
  - Prevented Book Again/Schedule Viewing actions when tenant already has active occupancy.

### Removed
- Removed unstable middleware auth interception path that caused login/refresh regressions.

### Optimized
- Messaging contact loading now uses relationship-based filtering (occupancies + family-member fallback) instead of broad role-only listing.
- Conversation list is filtered to show only allowed contacts based on role and relationship constraints.

## 2026-04-17

### Changed
- Updated changelog with the latest project update entry.
