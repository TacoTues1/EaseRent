import { supabase } from './supabaseClient'

/**
 * Helper function to create notifications
 */
export async function createNotification({ recipient, actor, type, message, data = {} }) {
  try {
    const { error } = await supabase.from('notifications').insert({
      recipient,
      actor,
      type,
      message,
      data,
      read: false
    })

    if (error) throw error
    return { success: true }
  } catch (err) {
    console.error('Failed to create notification:', err)
    return { success: false, error: err }
  }
}

/**
 * Notification templates
 */
export const NotificationTemplates = {
  newApplication: (propertyTitle, tenantName) => ({
    type: 'application',
    message: `${tenantName} submitted an application for ${propertyTitle}`
  }),

  applicationStatusUpdate: (propertyTitle, status) => ({
    type: 'application',
    message: `Your application for ${propertyTitle} has been ${status}`
  }),

  newMaintenanceRequest: (propertyTitle, tenantName) => ({
    type: 'maintenance',
    message: `${tenantName} submitted a maintenance request for ${propertyTitle}`
  }),

  maintenanceStatusUpdate: (title, status) => ({
    type: 'maintenance',
    message: `Your maintenance request "${title}" is now ${status}`
  }),

  paymentRecorded: (amount, propertyTitle) => ({
    type: 'payment',
    message: `Payment of ₱${amount} received for ${propertyTitle}`
  }),

  bookingConfirmed: (propertyTitle, date) => ({
    type: 'booking',
    message: `Your viewing appointment for ${propertyTitle} is confirmed for ${date}`
  }),

  rentDueReminder: (propertyTitle, dueDate) => ({
    type: 'payment',
    message: `Rent payment for ${propertyTitle} is due on ${dueDate}`
  })
}

/**
 * Send notification with template
 */
export async function sendNotification({ recipient, actor, template, data = {} }) {
  return await createNotification({
    recipient,
    actor,
    type: template.type,
    message: template.message,
    data
  })
}
