import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'



const systemFlows = {
    complete: {
        title: 'Complete System Workflow',
        description: 'End-to-end workflow combining tenant journey, landlord management, payments, booking/reschedule lifecycle, and maintenance lifecycle',
        nodes: [
            // === ROW 0: Entry ===
            { id: 'visitor', label: 'Visitor Arrives\nat Website', type: 'start', x: 560, y: 30, icon: '🌐' },

            // === ROW 1: Authentication ===
            { id: 'has_account', label: 'Has Account?', type: 'decision', x: 560, y: 120, icon: '🔐' },
            { id: 'register', label: 'Register\n(Tenant / Landlord)', type: 'process', x: 340, y: 210, icon: '📝' },
            { id: 'login', label: 'Login\n(Email/Google/FB)', type: 'process', x: 780, y: 210, icon: '🔑' },

            // === ROW 2: Role Split ===
            { id: 'role', label: 'User Role?', type: 'decision', x: 560, y: 310, icon: '👥' },

            // === ADMIN COLUMN (Far Right) ===
            { id: 'ad_dash', label: 'Admin Dashboard', type: 'start', x: 1200, y: 410, icon: '👑' },
            { id: 'ad_users', label: 'User Management\nCRUD + Roles', type: 'process', x: 1200, y: 500, icon: '👥' },
            { id: 'ad_stmts', label: 'Monthly Statements\nPDF via Brevo', type: 'process', x: 1200, y: 590, icon: '📄' },
            { id: 'ad_reminders', label: 'Auto Reminders\nToggle ON/OFF', type: 'end', x: 1200, y: 680, icon: '🔔' },

            // === TENANT COLUMN (Left) ===
            { id: 't_dash', label: 'Tenant Dashboard', type: 'start', x: 200, y: 410, icon: '🏡' },
            { id: 't_browse', label: 'Browse & Search\nProperties', type: 'process', x: 200, y: 500, icon: '🔍' },
            { id: 't_compare', label: 'Compare\nProperties', type: 'process', x: 30, y: 500, icon: '⚖️' },
            { id: 't_favs', label: 'Favorites ❤️', type: 'process', x: 30, y: 590, icon: '❤️' },
            { id: 't_view', label: 'View Property\nDetails & Map', type: 'process', x: 200, y: 590, icon: '🏠' },
            { id: 't_directions', label: 'Get Directions\nDrive/Bike/Walk', type: 'end', x: 30, y: 680, icon: '🧭' },
            { id: 't_book', label: 'Select Slot or\nPreferred Schedule', type: 'process', x: 200, y: 680, icon: '📅' },
            { id: 't_pending', label: 'Booking Pending\nLandlord Review', type: 'process', x: 200, y: 770, icon: '⏳' },
            { id: 't_modify', label: 'Tenant Action?', type: 'decision', x: 30, y: 860, icon: '🔁' },
            { id: 't_rejected', label: 'Rejected', type: 'end', x: 30, y: 770, icon: '❌' },
            { id: 't_reschedule', label: 'Reschedule\nCreate New Request', type: 'process', x: 30, y: 950, icon: '🗓️' },
            { id: 't_cancelled', label: 'Cancelled /\nAuto-Cancelled', type: 'end', x: 30, y: 1040, icon: '🚫' },
            { id: 't_attend', label: 'Attend Viewing', type: 'process', x: 200, y: 860, icon: '🏃' },
            { id: 't_viewing_done', label: 'Landlord Marks\nViewing Success', type: 'process', x: 200, y: 950, icon: '✅' },

            // === LANDLORD COLUMN (Right) ===
            { id: 'l_dash', label: 'Landlord Dashboard', type: 'start', x: 920, y: 410, icon: '🏢' },
            { id: 'l_props', label: 'Manage Properties\nAdd / Edit / Images', type: 'process', x: 920, y: 500, icon: '🏠' },
            { id: 'l_schedule', label: 'Set Schedule\nAvailable Days', type: 'process', x: 1120, y: 500, icon: '📋' },
            { id: 'l_bookings', label: 'Review Booking\nRequests', type: 'process', x: 920, y: 590, icon: '📅' },
            { id: 'l_approve', label: 'Approve or\nReject Booking', type: 'decision', x: 920, y: 680, icon: '✅' },
            { id: 'l_rejected', label: 'Rejected\nNotify Tenant', type: 'end', x: 1120, y: 680, icon: '❌' },
            { id: 'l_assign', label: 'Assign Tenant\n(4-Step Wizard)', type: 'process', x: 920, y: 770, icon: '📋' },
            { id: 'l_bills', label: 'Send Bills\n(Rent + Utilities)', type: 'process', x: 920, y: 860, icon: '📄' },

            // === CENTER: Move-in & Active Tenancy ===
            { id: 'movein', label: 'Move-in Payment\n(Rent + Deposit)', type: 'process', x: 560, y: 910, icon: '💰' },
            { id: 'active', label: '🟢 Active Tenancy', type: 'start', x: 560, y: 1000, icon: '🏡' },

            // === ROW: Active Tenant Actions ===
            { id: 'a_rent', label: 'Monthly Rent\nBills Due', type: 'process', x: 60, y: 1100, icon: '📄' },
            { id: 'a_utils', label: 'Utility Bills\n(Water/Elec/WiFi)', type: 'process', x: 250, y: 1100, icon: '💡' },
            { id: 'a_maint', label: 'Submit\nMaintenance', type: 'process', x: 440, y: 1100, icon: '🔧' },
            { id: 'a_msg', label: 'Inbox\n(DMs & Groups)', type: 'process', x: 630, y: 1100, icon: '💬' },
            { id: 'a_msg_end', label: 'Message Sent\n& Delivered', type: 'end', x: 630, y: 1210, icon: '✅' },
            { id: 'a_end', label: 'Request End\nOccupancy', type: 'process', x: 820, y: 1100, icon: '🚪' },
            { id: 'a_family', label: 'Family\nMembers', type: 'process', x: 1010, y: 1100, icon: '�‍👩‍👧' },
            { id: 'a_settings', label: 'Settings &\nProfile', type: 'process', x: 1200, y: 1100, icon: '⚙️' },

            // === FAMILY FLOW ===
            { id: 'f_add', label: 'Add Family\nMember', type: 'process', x: 1010, y: 1210, icon: '➕' },
            { id: 'f_access', label: 'Family Can\nPay & Request', type: 'end', x: 1010, y: 1310, icon: '✅' },

            // === SETTINGS END ===
            { id: 'a_settings_end', label: 'Profile Updated\nPayment Methods', type: 'end', x: 1200, y: 1210, icon: '✅' },

            // === PAYMENT FLOW ===
            { id: 'pay_method', label: 'Choose Payment\nMethod', type: 'decision', x: 155, y: 1210, icon: '💳' },
            { id: 'pay_cash', label: 'Cash', type: 'process', x: 0, y: 1320, icon: '💵' },
            { id: 'pay_qr', label: 'QR Code', type: 'process', x: 140, y: 1320, icon: '📱' },
            { id: 'pay_pm', label: 'PayMongo\n(GCash/Maya/\nQR PH/Card)', type: 'process', x: 280, y: 1320, icon: '🏦' },
            { id: 'pay_stripe', label: 'Stripe\n(Credit Card)', type: 'process', x: 420, y: 1320, icon: '💳' },
            { id: 'pay_paypal', label: 'PayPal', type: 'process', x: 560, y: 1320, icon: '🅿️' },
            { id: 'pay_manual', label: 'Landlord\nConfirms', type: 'process', x: 70, y: 1440, icon: '👍' },
            { id: 'pay_auto', label: 'Auto-Verified\n(Webhook/API)', type: 'process', x: 420, y: 1440, icon: '⚡' },
            { id: 'pay_done', label: 'Bill Marked\nas Paid', type: 'process', x: 250, y: 1540, icon: '✅' },
            { id: 'pay_payout', label: 'Auto Payout\n100% → Landlord', type: 'process', x: 250, y: 1640, icon: '💸' },
            { id: 'pay_end', label: 'Payment\nComplete', type: 'end', x: 250, y: 1750, icon: '✅' },

            // === MAINTENANCE FLOW ===
            { id: 'm_submit', label: 'Tenant Submits\nRequest + Photos', type: 'process', x: 440, y: 1210, icon: '📸' },
            { id: 'm_landlord', label: 'Landlord Reviews\n& Schedules Work', type: 'process', x: 440, y: 1320, icon: '👁️' },
            { id: 'm_edit', label: 'Edit Schedule\nDetails', type: 'process', x: 620, y: 1320, icon: '📝' },
            { id: 'm_cancel', label: 'Maintenance\nCancelled', type: 'end', x: 620, y: 1440, icon: '❌' },
            { id: 'm_progress', label: 'Auto-Start at\nScheduled Time', type: 'process', x: 440, y: 1440, icon: '⚙️' },
            { id: 'm_complete', label: 'Marked\nCompleted', type: 'process', x: 440, y: 1560, icon: '✅' },
            { id: 'm_cost', label: 'Log Cost\n(Deposit Deduct\nor Bill Tenant)', type: 'process', x: 620, y: 1560, icon: '💸' },
            { id: 'm_status', label: 'Closed / Archived\n+ Tenant Feedback', type: 'end', x: 440, y: 1680, icon: '📦' },

            // === OCCUPANCY END FLOW ===
            { id: 'c_end', label: 'Landlord Reviews\nEnd Request', type: 'process', x: 820, y: 1320, icon: '🧾' },
            { id: 'review', label: 'Move Out\n+ Leave Review ⭐', type: 'end', x: 820, y: 1440, icon: '⭐' },

            // === NOTIFICATION SYSTEM ===
            { id: 'n_hub', label: 'Notification System\n(Auto-Triggered)', type: 'decision', x: 560, y: 1820, icon: '🔔' },
            { id: 'n_rent_r', label: 'Rent Reminder\n(3 days before)', type: 'process', x: 80, y: 1930, icon: '🏠' },
            { id: 'n_util_r', label: 'Utility Reminder\n(Day 1-3)', type: 'process', x: 260, y: 1930, icon: '💡' },
            { id: 'n_booking_r', label: 'Booking Events\n(New/Approved/Rejected)', type: 'process', x: 440, y: 1930, icon: '📅' },
            { id: 'n_reschedule_r', label: 'Reschedule / Cancel\nBooking Updates', type: 'process', x: 620, y: 1930, icon: '🔁' },
            { id: 'n_payment_r', label: 'Payment Events\n(Paid/Late)', type: 'process', x: 800, y: 1930, icon: '💰' },
            { id: 'n_msg_r', label: 'Unread Message\n(6 hrs old)', type: 'process', x: 980, y: 1930, icon: '💬' },
            { id: 'n_movein_r', label: 'Move-in\nWelcome', type: 'process', x: 1140, y: 1930, icon: '🏠' },
            { id: 'n_channels', label: 'Delivery\nChannel?', type: 'decision', x: 560, y: 2050, icon: '�' },
            { id: 'n_inapp', label: 'In-App\nToast + Bell', type: 'end', x: 340, y: 2160, icon: '�' },
            { id: 'n_email', label: 'Email\n(Brevo)', type: 'end', x: 560, y: 2160, icon: '�' },
            { id: 'n_sms', label: 'SMS\n(Gateway)', type: 'end', x: 780, y: 2160, icon: '📱' },
        ],
        edges: [
            // Entry
            { from: 'visitor', to: 'has_account' },
            { from: 'has_account', to: 'register', label: 'No' },
            { from: 'has_account', to: 'login', label: 'Yes' },
            { from: 'register', to: 'role' },
            { from: 'login', to: 'role' },

            // Role split
            { from: 'role', to: 't_dash', label: 'Tenant' },
            { from: 'role', to: 'l_dash', label: 'Landlord' },
            { from: 'role', to: 'ad_dash', label: 'Admin' },

            // Admin flow
            { from: 'ad_dash', to: 'ad_users' },
            { from: 'ad_users', to: 'ad_stmts' },
            { from: 'ad_stmts', to: 'ad_reminders' },

            // Tenant flow
            { from: 't_dash', to: 't_browse' },
            { from: 't_browse', to: 't_compare' },
            { from: 't_browse', to: 't_view' },
            { from: 't_compare', to: 't_favs' },
            { from: 't_view', to: 't_directions' },
            { from: 't_view', to: 't_book' },
            { from: 't_book', to: 't_pending' },
            { from: 't_pending', to: 't_modify', label: 'Reschedule/Cancel?' },
            { from: 't_modify', to: 't_reschedule', label: 'Reschedule' },
            { from: 't_reschedule', to: 't_pending' },
            { from: 't_modify', to: 't_cancelled', label: 'Cancel' },
            { from: 't_pending', to: 'l_bookings', label: 'Submit Request' },

            // Landlord flow
            { from: 'l_dash', to: 'l_props' },
            { from: 'l_props', to: 'l_schedule' },
            { from: 'l_props', to: 'l_bookings' },
            { from: 'l_bookings', to: 'l_approve' },
            { from: 'l_approve', to: 't_attend', label: 'Yes' },
            { from: 'l_approve', to: 'l_rejected', label: 'No' },
            { from: 'l_approve', to: 't_rejected', label: 'No' },
            { from: 't_attend', to: 't_viewing_done' },
            { from: 't_viewing_done', to: 'l_assign' },
            { from: 'l_assign', to: 'l_bills' },
            { from: 'l_bills', to: 'movein' },

            // Move-in to active
            { from: 'movein', to: 'active' },

            // Active tenant actions
            { from: 'active', to: 'a_rent' },
            { from: 'active', to: 'a_utils' },
            { from: 'active', to: 'a_maint' },
            { from: 'active', to: 'a_msg' },
            { from: 'a_msg', to: 'a_msg_end' },
            { from: 'active', to: 'a_end' },
            { from: 'active', to: 'a_family' },
            { from: 'active', to: 'a_settings' },

            // Family flow
            { from: 'a_family', to: 'f_add' },
            { from: 'f_add', to: 'f_access' },

            // Settings
            { from: 'a_settings', to: 'a_settings_end' },

            // Payment flow
            { from: 'a_rent', to: 'pay_method' },
            { from: 'a_utils', to: 'pay_method' },
            { from: 'pay_method', to: 'pay_cash', label: 'Cash' },
            { from: 'pay_method', to: 'pay_qr', label: 'QR' },
            { from: 'pay_method', to: 'pay_pm', label: 'Online' },
            { from: 'pay_method', to: 'pay_stripe', label: 'Card' },
            { from: 'pay_method', to: 'pay_paypal', label: 'PayPal' },
            { from: 'pay_cash', to: 'pay_manual' },
            { from: 'pay_qr', to: 'pay_manual' },
            { from: 'pay_pm', to: 'pay_auto' },
            { from: 'pay_stripe', to: 'pay_auto' },
            { from: 'pay_paypal', to: 'pay_auto' },
            { from: 'pay_manual', to: 'pay_done' },
            { from: 'pay_auto', to: 'pay_done' },
            { from: 'pay_done', to: 'pay_payout' },
            { from: 'pay_payout', to: 'pay_end' },

            // Maintenance flow
            { from: 'a_maint', to: 'm_submit' },
            { from: 'm_submit', to: 'm_landlord' },
            { from: 'm_landlord', to: 'm_edit', label: 'Edit' },
            { from: 'm_edit', to: 'm_landlord' },
            { from: 'm_landlord', to: 'm_progress', label: 'Scheduled' },
            { from: 'm_landlord', to: 'm_cancel', label: 'Cancel' },
            { from: 'm_progress', to: 'm_complete' },
            { from: 'm_complete', to: 'm_cost' },
            { from: 'm_complete', to: 'm_status' },
            { from: 'm_cost', to: 'm_status' },

            // Occupancy end flow
            { from: 'a_end', to: 'c_end' },
            { from: 'c_end', to: 'review' },
            { from: 'c_end', to: 'n_hub' },

            // Notifications
            { from: 'pay_end', to: 'n_hub' },
            { from: 'm_status', to: 'n_hub' },
            { from: 't_pending', to: 'n_hub' },
            { from: 't_reschedule', to: 'n_hub' },
            { from: 't_cancelled', to: 'n_hub' },
            { from: 'n_hub', to: 'n_rent_r' },
            { from: 'n_hub', to: 'n_util_r' },
            { from: 'n_hub', to: 'n_booking_r' },
            { from: 'n_hub', to: 'n_reschedule_r' },
            { from: 'n_hub', to: 'n_payment_r' },
            { from: 'n_hub', to: 'n_msg_r' },
            { from: 'n_hub', to: 'n_movein_r' },
            { from: 'n_rent_r', to: 'n_channels' },
            { from: 'n_util_r', to: 'n_channels' },
            { from: 'n_booking_r', to: 'n_channels' },
            { from: 'n_reschedule_r', to: 'n_channels' },
            { from: 'n_payment_r', to: 'n_channels' },
            { from: 'n_msg_r', to: 'n_channels' },
            { from: 'n_movein_r', to: 'n_channels' },
            { from: 'n_channels', to: 'n_inapp' },
            { from: 'n_channels', to: 'n_email' },
            { from: 'n_channels', to: 'n_sms' },
        ]
    },
    overview: {
        title: 'System Overview',
        description: 'High-level view of Abalay rental management platform',
        nodes: [
            { id: 'visitor', label: 'Visitor', type: 'start', x: 400, y: 40, icon: '👤' },
            { id: 'browse', label: 'Browse Properties', type: 'process', x: 400, y: 130, icon: '🏠' },
            { id: 'decision_login', label: 'Has Account?', type: 'decision', x: 400, y: 230, icon: '🔐' },
            { id: 'register', label: 'Register', type: 'process', x: 200, y: 330, icon: '📝' },
            { id: 'login', label: 'Login', type: 'process', x: 600, y: 330, icon: '🔑' },
            { id: 'role_check', label: 'User Role?', type: 'decision', x: 400, y: 430, icon: '👥' },
            { id: 'tenant_dash', label: 'Tenant Dashboard', type: 'process', x: 150, y: 540, icon: '🏡' },
            { id: 'landlord_dash', label: 'Landlord Dashboard', type: 'process', x: 400, y: 540, icon: '🏢' },
            { id: 'admin_dash', label: 'Admin Dashboard', type: 'process', x: 650, y: 540, icon: '⚙️' },
            { id: 'tenant_actions', label: 'Book • Pay • Message\nMaintenance • Review', type: 'end', x: 150, y: 640, icon: '✅' },
            { id: 'landlord_actions', label: 'Properties • Tenants\nBills • Bookings', type: 'end', x: 400, y: 640, icon: '✅' },
            { id: 'admin_actions', label: 'Users • Properties\nReports • Settings', type: 'end', x: 650, y: 640, icon: '✅' },
        ],
        edges: [
            { from: 'visitor', to: 'browse' },
            { from: 'browse', to: 'decision_login' },
            { from: 'decision_login', to: 'register', label: 'No' },
            { from: 'decision_login', to: 'login', label: 'Yes' },
            { from: 'register', to: 'role_check' },
            { from: 'login', to: 'role_check' },
            { from: 'role_check', to: 'tenant_dash', label: 'Tenant' },
            { from: 'role_check', to: 'landlord_dash', label: 'Landlord' },
            { from: 'role_check', to: 'admin_dash', label: 'Admin' },
            { from: 'tenant_dash', to: 'tenant_actions' },
            { from: 'landlord_dash', to: 'landlord_actions' },
            { from: 'admin_dash', to: 'admin_actions' },
        ]
    },
    tenant: {
        title: 'Tenant Journey',
        description: 'Complete tenant flow from browsing to moving out',
        nodes: [
            { id: 'start', label: 'Tenant Logs In', type: 'start', x: 400, y: 40, icon: '👤' },
            { id: 'browse', label: 'Browse Properties', type: 'process', x: 400, y: 130, icon: '🔍' },
            { id: 'view_prop', label: 'View Property Details', type: 'process', x: 400, y: 220, icon: '🏠' },
            { id: 'book', label: 'Book Viewing', type: 'process', x: 400, y: 310, icon: '📅' },
            { id: 'wait_approval', label: 'Landlord Approves?', type: 'decision', x: 400, y: 400, icon: '⏳' },
            { id: 'rejected', label: 'Booking Rejected', type: 'end', x: 170, y: 490, icon: '❌' },
            { id: 'reschedule', label: 'Reschedule / Cancel\nPending Booking', type: 'process', x: 630, y: 490, icon: '🔁' },
            { id: 'viewing', label: 'Attend Viewing', type: 'process', x: 400, y: 490, icon: '🏃' },
            { id: 'viewing_done', label: 'Viewing Success\nMarked by Landlord', type: 'process', x: 630, y: 580, icon: '✅' },
            { id: 'landlord_assigns', label: 'Landlord Assigns\nTenant to Property', type: 'process', x: 400, y: 580, icon: '📋' },
            { id: 'movein_pay', label: 'Pay Move-in\n(Rent + Deposit)', type: 'process', x: 400, y: 670, icon: '💰' },
            { id: 'active', label: 'Active Tenant', type: 'process', x: 400, y: 760, icon: '🏡' },
            { id: 'monthly', label: 'Monthly Rent Bills\nUtility Bills', type: 'process', x: 170, y: 850, icon: '📄' },
            { id: 'maintenance', label: 'Maintenance\nSubmit Request', type: 'process', x: 400, y: 850, icon: '🔧' },
            { id: 'maint_sched', label: 'Scheduled\n(by Landlord)', type: 'process', x: 400, y: 940, icon: '🗓️' },
            { id: 'maint_progress', label: 'In Progress\n(auto at schedule)', type: 'process', x: 400, y: 1030, icon: '⚙️' },
            { id: 'maint_done', label: 'Completed / Closed\n+ Optional Feedback', type: 'end', x: 400, y: 1120, icon: '✅' },
            { id: 'review', label: 'Move Out\nLeave Review', type: 'end', x: 630, y: 850, icon: '⭐' },
        ],
        edges: [
            { from: 'start', to: 'browse' },
            { from: 'browse', to: 'view_prop' },
            { from: 'view_prop', to: 'book' },
            { from: 'book', to: 'wait_approval' },
            { from: 'wait_approval', to: 'rejected', label: 'No' },
            { from: 'wait_approval', to: 'reschedule', label: 'Need New Schedule' },
            { from: 'reschedule', to: 'book' },
            { from: 'wait_approval', to: 'viewing', label: 'Yes' },
            { from: 'viewing', to: 'viewing_done' },
            { from: 'viewing_done', to: 'landlord_assigns' },
            { from: 'landlord_assigns', to: 'movein_pay' },
            { from: 'movein_pay', to: 'active' },
            { from: 'active', to: 'monthly' },
            { from: 'active', to: 'maintenance' },
            { from: 'maintenance', to: 'maint_sched' },
            { from: 'maint_sched', to: 'maint_progress' },
            { from: 'maint_progress', to: 'maint_done' },
            { from: 'active', to: 'review' },
        ]
    },
    payment: {
        title: 'Payment Flow',
        description: 'All payment methods and processing',
        nodes: [
            { id: 'bill', label: 'Landlord Sends Bill\nor Auto-Generated', type: 'start', x: 400, y: 40, icon: '📄' },
            { id: 'tenant_views', label: 'Tenant Views\nPending Bill', type: 'process', x: 400, y: 130, icon: '👁️' },
            { id: 'method', label: 'Choose Payment\nMethod', type: 'decision', x: 400, y: 230, icon: '💳' },
            { id: 'cash', label: 'Cash Payment', type: 'process', x: 60, y: 340, icon: '💵' },
            { id: 'qr', label: 'QR Code Payment', type: 'process', x: 220, y: 340, icon: '📱' },
            { id: 'paymongo', label: 'PayMongo\n(GCash, Maya, Card,\nQR PH, GrabPay)', type: 'process', x: 400, y: 340, icon: '🏦' },
            { id: 'stripe', label: 'Stripe\n(Credit Card)', type: 'process', x: 590, y: 340, icon: '💳' },
            { id: 'paypal', label: 'PayPal', type: 'process', x: 740, y: 340, icon: '🅿️' },
            { id: 'cash_confirm', label: 'Tenant Confirms\n→ Landlord Verifies', type: 'process', x: 60, y: 460, icon: '✋' },
            { id: 'qr_proof', label: 'Upload Proof\n+ Reference #', type: 'process', x: 220, y: 460, icon: '📸' },
            { id: 'pm_checkout', label: 'PayMongo Checkout\n→ Webhook/Polling', type: 'process', x: 400, y: 460, icon: '🔄' },
            { id: 'stripe_pay', label: 'Stripe Form\n→ Auto-Processes', type: 'process', x: 590, y: 460, icon: '✅' },
            { id: 'paypal_pay', label: 'PayPal Checkout\n→ Capture Order', type: 'process', x: 740, y: 460, icon: '✅' },
            { id: 'landlord_confirm', label: 'Landlord Confirms\nPayment', type: 'process', x: 150, y: 570, icon: '👍' },
            { id: 'auto_confirm', label: 'Auto-Confirmed\nby Gateway', type: 'process', x: 550, y: 570, icon: '⚡' },
            { id: 'paid', label: 'Bill Marked as Paid', type: 'process', x: 350, y: 660, icon: '✅' },
            { id: 'payout', label: 'Auto Payout\n100% → Landlord', type: 'process', x: 350, y: 750, icon: '💸' },
            { id: 'notify', label: 'Email + SMS + In-App\nNotifications Sent', type: 'end', x: 350, y: 840, icon: '🔔' },
        ],
        edges: [
            { from: 'bill', to: 'tenant_views' },
            { from: 'tenant_views', to: 'method' },
            { from: 'method', to: 'cash', label: 'Cash' },
            { from: 'method', to: 'qr', label: 'QR' },
            { from: 'method', to: 'paymongo', label: 'Online' },
            { from: 'method', to: 'stripe', label: 'Card' },
            { from: 'method', to: 'paypal', label: 'PayPal' },
            { from: 'cash', to: 'cash_confirm' },
            { from: 'qr', to: 'qr_proof' },
            { from: 'paymongo', to: 'pm_checkout' },
            { from: 'stripe', to: 'stripe_pay' },
            { from: 'paypal', to: 'paypal_pay' },
            { from: 'cash_confirm', to: 'landlord_confirm' },
            { from: 'qr_proof', to: 'landlord_confirm' },
            { from: 'pm_checkout', to: 'auto_confirm' },
            { from: 'stripe_pay', to: 'auto_confirm' },
            { from: 'paypal_pay', to: 'auto_confirm' },
            { from: 'landlord_confirm', to: 'paid' },
            { from: 'auto_confirm', to: 'paid' },
            { from: 'paid', to: 'payout' },
            { from: 'payout', to: 'notify' },
        ]
    },
    landlord: {
        title: 'Landlord Flow',
        description: 'Property and tenant management',
        nodes: [
            { id: 'start', label: 'Landlord Logs In', type: 'start', x: 400, y: 40, icon: '👤' },
            { id: 'dashboard', label: 'Landlord Dashboard', type: 'process', x: 400, y: 130, icon: '📊' },
            { id: 'actions', label: 'Choose Action', type: 'decision', x: 400, y: 230, icon: '🎯' },
            { id: 'properties', label: 'Manage Properties\nAdd / Edit / Remove', type: 'process', x: 100, y: 350, icon: '🏠' },
            { id: 'bookings', label: 'Review Bookings\nApprove / Reject', type: 'process', x: 300, y: 350, icon: '📅' },
            { id: 'tenants', label: 'Manage Tenants\nAssign / End', type: 'process', x: 500, y: 350, icon: '👥' },
            { id: 'payments', label: 'Send Bills\nConfirm Payments', type: 'process', x: 700, y: 350, icon: '💰' },
            { id: 'maintenance_l', label: 'Maintenance\nSchedule/Edit/Close', type: 'process', x: 100, y: 470, icon: '🔧' },
            { id: 'messages', label: 'Message\nTenants', type: 'process', x: 300, y: 470, icon: '💬' },
            { id: 'booking_resched', label: 'Handle Booking\nReschedule/Cancel', type: 'process', x: 500, y: 470, icon: '🔁' },
            { id: 'reports', label: 'View Payment\nHistory & Reports', type: 'process', x: 700, y: 470, icon: '📈' },
            { id: 'notifications', label: 'Email + SMS + In-App\nNotifications', type: 'end', x: 400, y: 570, icon: '🔔' },
        ],
        edges: [
            { from: 'start', to: 'dashboard' },
            { from: 'dashboard', to: 'actions' },
            { from: 'actions', to: 'properties' },
            { from: 'actions', to: 'bookings' },
            { from: 'actions', to: 'tenants' },
            { from: 'actions', to: 'payments' },
            { from: 'properties', to: 'maintenance_l' },
            { from: 'bookings', to: 'messages' },
            { from: 'bookings', to: 'booking_resched' },
            { from: 'tenants', to: 'booking_resched' },
            { from: 'payments', to: 'reports' },
            { from: 'maintenance_l', to: 'notifications' },
            { from: 'messages', to: 'notifications' },
            { from: 'booking_resched', to: 'notifications' },
            { from: 'reports', to: 'notifications' },
        ]
    },
    notifications: {
        title: 'Notification & Reminder System',
        description: 'Automated reminders and notification channels',
        nodes: [
            { id: 'trigger', label: 'Event Trigger', type: 'start', x: 400, y: 40, icon: '⚡' },
            { id: 'type', label: 'Notification Type?', type: 'decision', x: 400, y: 140, icon: '📋' },
            { id: 'rent', label: 'Rent Bill\n(3 days before)', type: 'process', x: 100, y: 260, icon: '🏠' },
            { id: 'wifi', label: 'WiFi Bill\n(3 days before)', type: 'process', x: 260, y: 260, icon: '📶' },
            { id: 'electric', label: 'Electricity\n(Day 1-3 of month)', type: 'process', x: 420, y: 260, icon: '⚡' },
            { id: 'water', label: 'Water\n(Day 1-3 of month)', type: 'process', x: 580, y: 260, icon: '💧' },
            { id: 'maintenance_n', label: 'Maintenance Status\n(Scheduled/In Progress/Done)', type: 'process', x: 740, y: 260, icon: '🔧' },
            { id: 'booking_r', label: 'Booking Events\n(New/Approved/Rejected)', type: 'process', x: 100, y: 380, icon: '📅' },
            { id: 'reschedule_r', label: 'Reschedule / Cancel\nBooking Updates', type: 'process', x: 300, y: 380, icon: '🔁' },
            { id: 'message_r', label: 'Unread Message\n(DM/Group)', type: 'process', x: 500, y: 380, icon: '💬' },
            { id: 'late', label: 'Late Fee / Auto-Cancel\nMissed Schedules', type: 'process', x: 700, y: 380, icon: '⚠️' },
            { id: 'payment_n', label: 'Payment Events\n(Paid/Confirmed)', type: 'process', x: 900, y: 380, icon: '💰' },
            { id: 'channels', label: 'Delivery Channels', type: 'decision', x: 400, y: 490, icon: '📤' },
            { id: 'inapp', label: 'In-App\nNotification', type: 'end', x: 200, y: 600, icon: '🔔' },
            { id: 'email', label: 'Email\n(Brevo)', type: 'end', x: 400, y: 600, icon: '📧' },
            { id: 'sms', label: 'SMS\n(Gateway)', type: 'end', x: 600, y: 600, icon: '📱' },
        ],
        edges: [
            { from: 'trigger', to: 'type' },
            { from: 'type', to: 'rent' },
            { from: 'type', to: 'wifi' },
            { from: 'type', to: 'electric' },
            { from: 'type', to: 'water' },
            { from: 'type', to: 'maintenance_n' },
            { from: 'type', to: 'booking_r' },
            { from: 'type', to: 'reschedule_r' },
            { from: 'type', to: 'message_r' },
            { from: 'type', to: 'late' },
            { from: 'type', to: 'payment_n' },
            { from: 'rent', to: 'channels' },
            { from: 'wifi', to: 'channels' },
            { from: 'electric', to: 'channels' },
            { from: 'water', to: 'channels' },
            { from: 'maintenance_n', to: 'channels' },
            { from: 'booking_r', to: 'channels' },
            { from: 'reschedule_r', to: 'channels' },
            { from: 'message_r', to: 'channels' },
            { from: 'late', to: 'channels' },
            { from: 'payment_n', to: 'channels' },
            { from: 'channels', to: 'inapp' },
            { from: 'channels', to: 'email' },
            { from: 'channels', to: 'sms' },
        ]
    },
    architecture: {
        title: 'Technical Architecture',
        description: 'Technology stack and integrations',
        nodes: [
            { id: 'client', label: 'Next.js Frontend\n(React + TailwindCSS)', type: 'start', x: 400, y: 40, icon: '🖥️' },
            { id: 'api', label: 'Next.js API Routes\n(/api/* — 35+ endpoints)', type: 'process', x: 400, y: 150, icon: '⚙️' },
            { id: 'services', label: 'External Services', type: 'decision', x: 400, y: 260, icon: '🔌' },
            { id: 'supabase', label: 'Supabase\nDB + Auth + Storage\n+ Realtime + RLS', type: 'process', x: 80, y: 380, icon: '🗄️' },
            { id: 'paymongo', label: 'PayMongo\nGCash, Maya, QR PH\nCards, GrabPay', type: 'process', x: 260, y: 380, icon: '🏦' },
            { id: 'stripe', label: 'Stripe\nCredit Card\nPayments', type: 'process', x: 430, y: 380, icon: '💳' },
            { id: 'paypal', label: 'PayPal\nOnline\nPayments', type: 'process', x: 590, y: 380, icon: '🅿️' },
            { id: 'brevo', label: 'Brevo\nEmail Service\n+ OTP Resets', type: 'process', x: 750, y: 380, icon: '📧' },
            { id: 'sms_gw', label: 'SMS Gateway\n(15+ SMS types)', type: 'process', x: 80, y: 510, icon: '📱' },
            { id: 'leaflet', label: 'Leaflet WebView\nMaps + Navigation', type: 'process', x: 260, y: 510, icon: '�️' },
            { id: 'vercel', label: 'Vercel\nHosting + Serverless\n+ Analytics', type: 'process', x: 430, y: 510, icon: '▲' },
            { id: 'webhooks', label: 'Webhooks\nPayMongo + Stripe\n(Real-time)', type: 'process', x: 590, y: 510, icon: '🔄' },
            { id: 'pdfkit', label: 'PDFKit\nMonthly Statements\n+ Reports', type: 'process', x: 750, y: 510, icon: '�' },
            { id: 'realtime', label: 'Supabase Realtime\nLive Notifications\n+ Chat + Presence', type: 'end', x: 400, y: 620, icon: '⚡' },
        ],
        edges: [
            { from: 'client', to: 'api' },
            { from: 'api', to: 'services' },
            { from: 'services', to: 'supabase' },
            { from: 'services', to: 'paymongo' },
            { from: 'services', to: 'stripe' },
            { from: 'services', to: 'paypal' },
            { id: 'services', to: 'brevo' },
            { from: 'supabase', to: 'sms_gw' },
            { from: 'supabase', to: 'leaflet' },
            { from: 'paymongo', to: 'vercel' },
            { from: 'stripe', to: 'webhooks' },
            { from: 'brevo', to: 'pdfkit' },
            { from: 'sms_gw', to: 'realtime' },
            { from: 'leaflet', to: 'realtime' },
            { from: 'vercel', to: 'realtime' },
            { from: 'webhooks', to: 'realtime' },
            { from: 'pdfkit', to: 'realtime' },
        ]
    },
    admin: {
        title: 'Admin & Family System',
        description: 'Admin management and family member flows',
        nodes: [
            { id: 'admin_login', label: 'Admin Logs In', type: 'start', x: 400, y: 40, icon: '🔐' },
            { id: 'admin_dash', label: 'Admin Dashboard\nOverview + Stats', type: 'process', x: 400, y: 130, icon: '📊' },
            { id: 'admin_action', label: 'Choose Action', type: 'decision', x: 400, y: 230, icon: '🎯' },
            { id: 'user_mgmt', label: 'User Management\nCRUD + Role Change', type: 'process', x: 100, y: 340, icon: '👥' },
            { id: 'prop_mgmt', label: 'Property\nManagement', type: 'process', x: 280, y: 340, icon: '🏠' },
            { id: 'pay_hist', label: 'Payment History\n& Revenue', type: 'process', x: 460, y: 340, icon: '💰' },
            { id: 'bookings_l', label: 'Bookings List\n& Schedules', type: 'process', x: 640, y: 340, icon: '📅' },
            { id: 'auto_procs', label: 'Automated\nProcesses', type: 'decision', x: 250, y: 460, icon: '⚡' },
            { id: 'monthly_stmt', label: 'Monthly Statements\n(PDF via Brevo)', type: 'process', x: 100, y: 560, icon: '📄' },
            { id: 'reminder_toggle', label: 'Payment Reminders\nToggle ON/OFF', type: 'process', x: 400, y: 560, icon: '🔔' },
            { id: 'auto_send', label: 'Auto-Send\n30th of Month', type: 'end', x: 100, y: 660, icon: '✅' },
            // Family Member Flow
            { id: 'family_start', label: 'Primary Tenant\n(Has Occupancy)', type: 'start', x: 700, y: 460, icon: '👤' },
            { id: 'add_family', label: 'Add Family\nMember by Search', type: 'process', x: 700, y: 550, icon: '👨‍👩‍👧' },
            { id: 'family_access', label: 'Family Member\nGets Access', type: 'process', x: 700, y: 640, icon: '🏡' },
            { id: 'family_actions', label: 'View Bills • Pay\nMaintenance Req', type: 'end', x: 700, y: 730, icon: '✅' },
        ],
        edges: [
            { from: 'admin_login', to: 'admin_dash' },
            { from: 'admin_dash', to: 'admin_action' },
            { from: 'admin_action', to: 'user_mgmt' },
            { from: 'admin_action', to: 'prop_mgmt' },
            { from: 'admin_action', to: 'pay_hist' },
            { from: 'admin_action', to: 'bookings_l' },
            { from: 'user_mgmt', to: 'auto_procs' },
            { from: 'prop_mgmt', to: 'auto_procs' },
            { from: 'auto_procs', to: 'monthly_stmt', label: 'Statements' },
            { from: 'auto_procs', to: 'reminder_toggle', label: 'Reminders' },
            { from: 'monthly_stmt', to: 'auto_send' },
            { from: 'family_start', to: 'add_family' },
            { from: 'add_family', to: 'family_access' },
            { from: 'family_access', to: 'family_actions' },
        ]
    },
    discovery: {
        title: 'Property Discovery',
        description: 'Search, compare, favorites, directions, and booking flow',
        nodes: [
            { id: 'visitor', label: 'Visitor / Tenant\nArrives', type: 'start', x: 400, y: 40, icon: '🌐' },
            { id: 'homepage', label: 'Homepage\nFeatured + Top Rated\n+ Most Favorited', type: 'process', x: 400, y: 140, icon: '🏠' },
            { id: 'search', label: 'Prominent Search\n& Filters', type: 'process', x: 400, y: 250, icon: '🔍' },
            { id: 'browse', label: 'Conditional See All\nFiltered Grid View', type: 'process', x: 180, y: 350, icon: '📋' },
            { id: 'compare', label: 'Compare\n(Up to 3)', type: 'process', x: 400, y: 350, icon: '⚖️' },
            { id: 'favorites', label: 'Toggle\nFavorites ❤️', type: 'process', x: 620, y: 350, icon: '❤️' },
            { id: 'detail', label: 'Property Detail\nImages • Reviews\n• Amenities • Map', type: 'process', x: 400, y: 460, icon: '🏡' },
            { id: 'map_action', label: 'Map Action?', type: 'decision', x: 180, y: 570, icon: '🗺️' },
            { id: 'inline_route', label: 'Inline Route\nCalculation', type: 'process', x: 60, y: 670, icon: '📍' },
            { id: 'full_nav', label: 'Full Navigation\nDrive • Bike • Walk', type: 'process', x: 250, y: 670, icon: '🧭' },
            { id: 'book_view', label: 'Book Viewing\nSelect Date + Slot', type: 'process', x: 500, y: 570, icon: '📅' },
            { id: 'needs_login', label: 'Logged In?', type: 'decision', x: 500, y: 670, icon: '🔐' },
            { id: 'auth_modal', label: 'Auth Modal\nSign In / Sign Up', type: 'process', x: 680, y: 670, icon: '🔑' },
            { id: 'booking_sent', label: 'Booking Request\nSent to Landlord', type: 'end', x: 500, y: 770, icon: '✅' },
        ],
        edges: [
            { from: 'visitor', to: 'homepage' },
            { from: 'homepage', to: 'search' },
            { from: 'search', to: 'browse' },
            { from: 'search', to: 'compare' },
            { from: 'search', to: 'favorites' },
            { from: 'browse', to: 'detail' },
            { from: 'compare', to: 'detail' },
            { from: 'favorites', to: 'detail' },
            { from: 'detail', to: 'map_action' },
            { from: 'detail', to: 'book_view' },
            { from: 'map_action', to: 'inline_route', label: 'Inline' },
            { from: 'map_action', to: 'full_nav', label: 'Navigate' },
            { from: 'book_view', to: 'needs_login' },
            { from: 'needs_login', to: 'auth_modal', label: 'No' },
            { from: 'needs_login', to: 'booking_sent', label: 'Yes' },
            { from: 'auth_modal', to: 'booking_sent' },
        ]
    }
}

// ==========================================
// FLOWCHART RENDERER COMPONENT
// ==========================================
function FlowchartCanvas({ flow }) {
    const canvasRef = useRef(null)
    const [hoveredNode, setHoveredNode] = useState(null)
    const [scale, setScale] = useState(1)

    // Calculate canvas dimensions from nodes
    const maxX = Math.max(...flow.nodes.map(n => n.x)) + 200
    const maxY = Math.max(...flow.nodes.map(n => n.y)) + 100

    const nodeW = 160
    const getNodeCenter = (node) => {
        const h = node.type === 'decision' ? 90 : 70
        return { x: node.x + nodeW / 2, y: node.y + h / 2 }
    }

    const getNodeById = (id) => flow.nodes.find(n => n.id === id)

    const nodeColors = {
        start: { bg: 'from-emerald-500 to-green-600', text: 'text-white', shadow: 'shadow-emerald-200' },
        process: { bg: 'from-slate-700 to-slate-900', text: 'text-white', shadow: 'shadow-slate-300' },
        decision: { bg: 'from-amber-400 to-orange-500', text: 'text-white', shadow: 'shadow-amber-200' },
        end: { bg: 'from-blue-500 to-indigo-600', text: 'text-white', shadow: 'shadow-blue-200' },
    }

    // Shape styles per type
    const getShapeStyle = (type) => {
        switch (type) {
            case 'decision': return { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', padding: '28px 10px' }
            case 'start': return { borderRadius: '9999px', padding: '10px 16px' }
            case 'end': return { borderRadius: '9999px', padding: '10px 16px', border: '3px solid rgba(255,255,255,0.4)' }
            default: return { borderRadius: '12px', padding: '10px 12px' }
        }
    }

    return (
        <div className="relative overflow-x-auto overflow-y-auto rounded-2xl bg-white border border-gray-200">
            {/* Zoom Controls */}
            <div className="sticky top-3 right-3 z-20 flex justify-end px-3">
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl shadow-sm px-2 py-1">
                    <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 cursor-pointer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                    </button>
                    <span className="text-xs font-mono text-gray-400 w-10 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(1.5, s + 0.1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 cursor-pointer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button onClick={() => setScale(1)} className="p-1.5 hover:bg-gray-100 rounded-lg text-xs text-gray-400 cursor-pointer">Reset</button>
                </div>
            </div>

            <div
                className="relative p-8 min-w-[860px]"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: maxX + 60, height: maxY + 80 }}
            >
                {/* SVG Arrows */}
                <svg className="absolute inset-0 pointer-events-none" style={{ width: maxX + 60, height: maxY + 80 }}>
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                        </marker>
                    </defs>
                    {flow.edges.map((edge, i) => {
                        const fromNode = getNodeById(edge.from)
                        const toNode = getNodeById(edge.to)
                        if (!fromNode || !toNode) return null
                        const from = getNodeCenter(fromNode)
                        const to = getNodeCenter(toNode)

                        const dx = to.x - from.x
                        const dy = to.y - from.y
                        const dist = Math.sqrt(dx * dx + dy * dy)
                        if (dist === 0) return null
                        const offsetStart = fromNode.type === 'decision' ? 50 : 40
                        const offsetEnd = toNode.type === 'decision' ? 50 : 40
                        const sx = from.x + (dx / dist) * offsetStart
                        const sy = from.y + (dy / dist) * offsetStart
                        const ex = to.x - (dx / dist) * offsetEnd
                        const ey = to.y - (dy / dist) * offsetEnd

                        const mx = (sx + ex) / 2
                        const my = (sy + ey) / 2

                        return (
                            <g key={i}>
                                <line
                                    x1={sx} y1={sy} x2={ex} y2={ey}
                                    stroke="#cbd5e1"
                                    strokeWidth="2"
                                    markerEnd="url(#arrowhead)"
                                    strokeDasharray={edge.label ? "6,3" : "none"}
                                />
                                {edge.label && (
                                    <>
                                        <rect x={mx - 22} y={my - 10} width="44" height="20" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                                        <text x={mx} y={my + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">
                                            {edge.label}
                                        </text>
                                    </>
                                )}
                            </g>
                        )
                    })}
                </svg>

                {/* Nodes */}
                {flow.nodes.map((node) => {
                    const colors = nodeColors[node.type]
                    const isHovered = hoveredNode === node.id
                    const lines = node.label.split('\n')
                    const shapeStyle = getShapeStyle(node.type)

                    return (
                        <div
                            key={node.id}
                            className={`absolute transition-all duration-200 cursor-default select-none ${isHovered ? 'z-10 scale-105' : 'z-0'}`}
                            style={{ left: node.x, top: node.y, width: nodeW }}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                        >
                            <div
                                className={`relative bg-gradient-to-br ${colors.bg} ${colors.text} shadow-lg ${isHovered ? `shadow-xl ${colors.shadow}` : ''} text-center`}
                                style={shapeStyle}
                            >
                                <div className="text-lg mb-0.5">{node.icon}</div>
                                {lines.map((line, i) => (
                                    <div key={i} className="text-[10px] font-semibold leading-tight">{line}</div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ==========================================
// MAIN PAGE
// ==========================================
export default function FlowchartPage() {
    const [activeFlow, setActiveFlow] = useState('complete')
    const [animateIn, setAnimateIn] = useState(false)

    useEffect(() => {
        setAnimateIn(true)
    }, [])

    const handleFlowChange = (flowKey) => {
        setAnimateIn(false)
        setTimeout(() => {
            setActiveFlow(flowKey)
            setAnimateIn(true)
        }, 200)
    }

    const flowKeys = Object.keys(systemFlows)
    const currentFlow = systemFlows[activeFlow]

    const tabIcons = {
        complete: '🗺️',
        overview: '🏗️',
        tenant: '🏡',
        payment: '💰',
        landlord: '🏢',
        notifications: '🔔',
        architecture: '⚙️',
        admin: '👑',
        discovery: '🔍',
    }

    return (
        <>
            <Head>
                <title>System Flowchart — Abalay</title>
                <meta name="description" content="Interactive flowchart showing the complete Abalay rental management system architecture, user journeys, and process flows." />
            </Head>

            <div className="min-h-screen bg-[#F3F4F5]">
                {/* Hero */}
                <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black pt-24 pb-16">
                    {/* Decorative elements */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
                        {/* Grid pattern */}
                        <div className="absolute inset-0" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
                            backgroundSize: '32px 32px'
                        }} />
                    </div>

                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
                        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            Back to Dashboard
                        </Link>

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/10 rounded-full mb-6">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-medium text-gray-300">Live Documentation</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4 tracking-tight">
                            System <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Flowchart</span>
                        </h1>
                        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                            Interactive visualization of the complete Abalay rental management platform — from user journeys to technical architecture.
                        </p>

                        {/* Stats */}
                        <div className="flex flex-wrap justify-center gap-6 mt-10">
                            {[
                                { label: 'User Roles', value: '3', icon: '👥' },
                                { label: 'Payment Methods', value: '7+', icon: '💳' },
                                { label: 'Notification Types', value: '20+', icon: '🔔' },
                                { label: 'API Endpoints', value: '35+', icon: '⚙️' },
                                { label: 'Family Members', value: '✓', icon: '👨‍👩‍👧' },
                            ].map((stat, i) => (
                                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 backdrop-blur-sm">
                                    <span className="text-2xl">{stat.icon}</span>
                                    <div className="text-left">
                                        <div className="text-xl font-black text-white">{stat.value}</div>
                                        <div className="text-[11px] text-gray-500 font-medium">{stat.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Flow Tabs + Content */}
                <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-8 pb-20">
                    {/* Tab Bar */}
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 mb-6 flex flex-wrap gap-1">
                        {flowKeys.map((key) => (
                            <button
                                key={key}
                                onClick={() => handleFlowChange(key)}
                                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${activeFlow === key
                                    ? 'bg-black text-white shadow-lg'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                    }`}
                            >
                                <span>{tabIcons[key]}</span>
                                <span className="hidden sm:inline">{systemFlows[key].title}</span>
                            </button>
                        ))}
                    </div>

                    {/* Title Bar */}
                    <div className={`mb-6 transition-all duration-300 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                        <h2 className="text-2xl font-black text-gray-900">{currentFlow.title}</h2>
                        <p className="text-sm text-gray-500 mt-1">{currentFlow.description}</p>
                    </div>

                    {/* Flowchart */}
                    <div className={`transition-all duration-300 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <FlowchartCanvas flow={currentFlow} />
                    </div>

                    {/* Legend */}
                    <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Legend</h3>
                        <div className="flex flex-wrap gap-4">
                            {[
                                { label: 'Start / Entry Point', color: 'from-emerald-500 to-green-600' },
                                { label: 'Process / Action', color: 'from-slate-700 to-slate-900' },
                                { label: 'Decision / Branch', color: 'from-amber-400 to-orange-500' },
                                { label: 'End / Result', color: 'from-blue-500 to-indigo-600' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className={`w-8 h-5 rounded-md bg-gradient-to-br ${item.color}`} />
                                    <span className="text-xs font-medium text-gray-600">{item.label}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-400" />
                                <span className="text-xs font-medium text-gray-600">Conditional Path</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-0.5 bg-gray-400" />
                                <span className="text-xs font-medium text-gray-600">Direct Path</span>
                            </div>
                        </div>
                    </div>

                    {/* Feature Summary Grid */}
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            {
                                icon: '🏠', title: 'Property Management',
                                items: ['Add/edit properties with images', 'Set availability status', 'Property badges (Top Rated, Most Favorite)', 'Leaflet maps + navigation', 'Compare up to 3 properties', 'Conditional See All filters']
                            },
                            {
                                icon: '📅', title: 'Booking System',
                                items: ['Schedule with slot or preferred time', 'Tenant reschedule or cancel while pending', 'Landlord approve/reject flow', 'Viewing success then tenant assignment', 'Auto-cancel for missed pending schedules']
                            },
                            {
                                icon: '💰', title: 'Payment Processing',
                                items: ['PayMongo (GCash, Maya, QR PH, Card)', 'Stripe (Credit Card)', 'PayPal (Online)', 'Cash + QR Code (manual)', 'Auto payout', 'Family member payments']
                            },
                            {
                                icon: '🔔', title: 'Notifications',
                                items: ['In-app real-time toasts', 'Email via Brevo (20+ templates)', 'SMS via Gateway (15+ types)', 'Booking + reschedule + maintenance updates', 'Bulk landlord notifications']
                            },
                            {
                                icon: '🔧', title: 'Maintenance',
                                items: ['Tenant/family request submission', 'Schedule + edit details by landlord', 'Auto-start at scheduled time', 'Cost tracking (deposit deduct or tenant bill)', 'Close/archive + tenant feedback']
                            },
                            {
                                icon: '📝', title: 'Occupancy & Family',
                                items: ['4-step tenant assignment wizard', 'Move-in payment bill generation', 'End occupancy request + move-out review', 'Family member management', 'Monthly PDF statements', 'Brevo OTP reset verification']
                            },
                        ].map((card, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-md transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl">{card.icon}</div>
                                    <h3 className="font-bold text-gray-900 text-sm">{card.title}</h3>
                                </div>
                                <ul className="space-y-1.5">
                                    {card.items.map((item, j) => (
                                        <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                                            <div className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-12 text-center">
                        <p className="text-xs text-gray-400">
                            Abalay Rental Management System — Built with Next.js, Supabase, PayMongo, Stripe & Brevo
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
