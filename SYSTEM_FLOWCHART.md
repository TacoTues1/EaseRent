```text
EaseRent Step-by-Step Flow
--------------------------
1. **Visitor arrives** on the marketing page via browser or mobile (Next.js + Tailwind CSS). Landing page shows CTA and sign-in/up buttons.
2. **Authentication funnel**: opens `pages/auth/index.js`, enters email + password (optionally MFA). The form calls Supabase Auth which returns a JWT + session, then loads the profile row.
3. **Role decision**: profile row includes `role` (tenant/landlord). App redirects to `pages/dashboard.js` and renders either tenant or landlord layout with role-aware nav links.

Tenant sequence:
4. **Property discovery**: Tenant dashboard calls Supabase RPC/query on `properties` table with city filters. Results populate the property grid.
5. **Property detail**: click opens `pages/properties/[id].js`, showing images, availability, landlord info, and action buttons (`Apply`, `Message`).
6. **Apply + chat kickoff**: submitting the application writes to `applications`, triggers the messaging feed, and fires a notification (insert into `notifications`). Tenant can optionally open `pages/messages.js` to start a conversation tied to that property/conversation.
7. **Schedule viewing**: after application approval, tenant opens `pages/applications.js` > Schedule modal, selects a time slot from landlord-managed `available_time_slots`, and inserts a `bookings` row with `status=pending_approval`. Supabase Realtime pushes the new booking to the landlord.
8. **Maintenance and payments**: Tenant can raise issues through `pages/maintenance.js` (records in `maintenance_requests`) and view bills in `pages/payments.js` (`payment_requests`). Supabase Realtime keeps notification badges up-to-date.

Landlord sequence:
9. **Property management**: Landlord uses `pages/properties/new.js` or dashboard controls to insert/patch `properties` rows. Changes are automatically visible to tenants because the client re-queries `properties` with Supabase Realtime.
10. **Application review**: Landlord opens `pages/applications.js`, reads pending entries from `applications`, reviews tenant messages, and can approve or reject.
11. **Booking approval**: When a booking request arrives, the landlord reviews the modal listing `bookings` + linked `available_time_slots`. Accepting updates `bookings.status` to `approved` and notifies the tenant (insert triggered on `notifications`). Rejecting releases the slot.
12. **Billing**: Landlord creates payment requests via `pages/payments.js`, which inserts into `payment_requests` (with breakdown of rent/utilities). Supabase Realtime notifies the tenant and the tenant mark-as-paid updates `payments`.
13. **Maintenance & support**: Landlord triages `maintenance_requests`, sets status fields, and comments via `pages/maintenance.js`. Each update writes to the table and triggers realtime notifications.
14. **Chat & notifications**: `messages` and `conversations` tables keep the chat history. Supabase Realtime channels broadcast new messages and notification records cause badge updates on the Navbar component.

Shared infrastructure:
- **Supabase Auth**: issues JWTs, enforces RLS on `profiles`, `properties`, `applications`, `payments`, `maintenance_requests`, `bookings`, `notifications`, `messages`.
- **Realtime**: listens to inserts/updates on key tables (applications, bookings, notifications, messages) and streams them over WebSocket to the Next.js client.
- **Postgres tables**: source of truth for every feature; API calls mostly go through the custom hooks in `lib/supabaseClient.js` and helper modules under `lib/`.

Flow summary:
- Visitor → Auth → Dashboard.
- Tenant: browse → apply → message → schedule → track payments/maintenance.
- Landlord: manage properties → review applications → approve bookings/send bills → update maintenance.
- Supabase tables + realtime streams keep both sides synchronized.

Visual diagram (Mermaid):
```mermaid
flowchart TD
     Visitor[Visitor lands on marketing page] --> Auth[Sign in/up via Supabase Auth]
     Auth --> |JWT + session| Role{Role detected}
     Role --> TenantDash[Tenant dashboard]
     Role --> LandlordDash[Landlord dashboard]

     TenantDash --> PropList[Browse properties]
     PropList --> PropDetail[Property details]
     PropDetail --> Apply[Submit application]
     Apply --> NotifyLandlord[Insert notification]
     NotifyLandlord --> ApplicationReview[Landlord reviews applications]

     ApplicationReview --> BookRequest[Schedule viewing]
     BookRequest --> BookingTable[Insert booking (pending approval)]
     BookingTable --> Approve[Landlord approves/rejects]
     Approve --> TenantStatus[Update tenant status & notify]

     TenantDash --> Maintenance[Tenant maintenance request]
     Maintenance --> MaintenanceTable[Insert maintenance_requests]
     LandlordDash --> MaintenanceTable

     LandlordDash --> PropertyMgmt[Add/Edit properties]
     PropertyMgmt --> PropertiesTable[properties table]
     TenantDash --> PropertiesTable

     LandlordDash --> Billing[Create payment request]
     Billing --> PaymentTables[payment_requests/payments]
     PaymentTables --> TenantDash

     TenantDash --> Chat[Open chat]
     LandlordDash --> Chat
     Chat --> MessagesTable[messages/conversations]

     MessagesTable --> Realtime[Supabase Realtime]
     PropertiesTable --> Realtime
     ApplicationReview --> Realtime
     MaintenanceTable --> Realtime
     PaymentTables --> Realtime

     Realtime --> TenantDash
     Realtime --> LandlordDash
```
```
``````text
                                        +-----------------------------+
                                        | Browser / Mobile (Next.js)  |
                                        +-------------+---------------+
                                                      |
                                                      v
                                   +------------------+------------------+
                                   | Landing Page / Sign in (Supabase) |
                                   +----------+------------------------+
                                              |
                                              v
                          +-------------------+--------------------+
                          | Auth flow: email/password, MFA?    |
                          | Supabase Auth issues JWT + Session |
                          +-------------------+----------------+
                                              |
                                              v
                        +---------------------+---------------------+
                        | Role resolved (tenant or landlord)    |
                        +---------------------+---------------------+
                             |                               |
                             v                               v
              +--------------+---------------+    +----------+-------------+
              | Tenant dashboard / flows     |    | Landlord dashboard / flows |
              +--------------+---------------+    +---------------------------+
                             |                                   |
        +--------------------+----------------------+    +--------+----------------------------+
        | Tenant actions (browse/filter properties)    |    | Landlord actions (Add/edit listings) |
        | interacts with `properties` table via API    |    | interacts with `properties` table    |
        +--------------+-------------------------------+    +-------------------+----------------+
                       |                                                      |
                       v                                                      v
          +------------+-------------+                            +------------+-------------+
          | Property detail page      |                            | Notifications / analytics |
          | shows availability, owner |                            | aggregations (payments,    |
          +------------+-------------+                            | applications)              |
                       |                                          +------------+-------------+
                       v                                                        |
          +------------+-------------+                                          v
          | Tenant submits application |                            +-------------+-------------+
          | -> `applications` table     |<---------------------------|  Supabase realtime +    |
          | triggers notification to landlord |                       |  Postgres tables        |
          +------------+-------------+                            +------------------------+
                       |                                                |
                       v                                                v
         +-------------+-------------+                     +------------+------------+
         | Tenant scheduling viewings |<--------------------| Landlord sets available  |
         | selects time slot (bookings|                     | `available_time_slots`   |
         | table) and adds notes       |                     | and approvals control    |
         +-------------+-------------+                     +------------+------------+
                       |                                                |
                       v                                                v
            +----------+----------+                     +------------------+------------------+
            | Booking request saved |<------------------| Landlord reviews pending bookings    |
            | (status: pending_approval)|                 | via Applications page modal        |
            +-----------------------+                     +------------------+------------------+
                       |                                                  |
                       v                                                  v
       +---------------+---------------+             +---------------------+---------------------+
       | Notifications table -> tenant  |             | Landlord approves -> set booking status|
       | receives update via realtime    |             | to approved or rejected in `bookings`   |
       +---------------+---------------+             +---------------------+---------------------+
                       |                                                  |
                       v                                                  v
     +-----------------+------------+                       +-------------+------------------+
     | Tenant sees status / messages |                       | Payment request or record       |
     | Landlord chat -> `messages`   |<----------------------+ (bills/payments table)         |
     | & notifications               |                       +-------------------------------+
     +-------------------------------+
                       |
                       v
     +-----------------+-----------------------+
     | Tenant maintenance request page         |
     | submits issue -> `maintenance_requests` | <--> Landlord handles status + replies
     +-----------------+-----------------------+

Database persistence & real-time connectors:
 - `profiles`: stores tenants/landlords info, role-based policies
 - `properties`: linked to landlords, refreshed via API
 - `applications`: inbound tenant interest, triggers notifications
 - `bookings` / `available_time_slots`: syncing viewing approvals
 - `payments` / `payment_requests`: record payments and bills statuses
 - `maintenance_requests`: tenant issue tracking + landlord updates
 - `notifications`: Realtime hub for alerts (new applications, payments, maintenance)
 - `messages` & `conversations`: real-time chat between participants

Supabase services:
 - Auth service issues JWTs, enforces RLS policies (profile-role gating)
 - Realtime service pushes updates to dashboards (notifications, chat, property status)
 - Postgres tables persist state across features (properties, bookings, etc.)

``` ```text
															+--------------------------+
															|  Visitor lands on site   |
															+------------+-------------+
																					 |
																					 v
														 +-------------+-------------+
														 | Sign up / Sign in (Auth)  |
														 | Supabase handles tokens   |
														 +-------------+-------------+
																					 |
																					 v
									+------------------------+------------------------+
									|                     Role?                    |
									+-------+----------------------------+----------+
													|                            |
													v                            v
				+----------------------+            +-------------------------+
				| Tenant Dashboard     |            | Landlord Dashboard      |
				+-----------+----------+            +-----------+-------------+
										|                                   |
	 +----------------+----------------+        +----------+-------------------+
	 |                                 |        |                              |
	 v                                 v        v                              v
 Browse properties           Maintenance req.    Manage properties         Notifications
	 |                                 |            |                              |
	 v                                 v            v                              v
 View details -> Apply           Submit request  Add/edit property      View analytics + alerts
	 |                 |               |                |                    |
	 v                 v               v                v                    v
 Create application -> Schedule viewing -> Real-time notifications -> Payments client -> Messages
																	|                                        |            
																	v                                        v
												Realtime updates & supabase tables         Conversations/messages sync
												(applications, bookings, payments, maintenance, notifications)
 ```
