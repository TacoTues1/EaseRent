import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendSMS } from '../../lib/sms'
import { 
  sendMoveOutEmail, 
  sendAssignmentEmail, 
  sendMaintenanceEmail, 
  sendBookingEmail
} from '../../lib/email'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type, recordId, actorId, extraData } = req.body

  try {
    const { data: actor } = await supabaseAdmin.from('profiles').select('*').eq('id', actorId).single()

    // 1. Move Out
    if (type === 'move_out') {
      const { data: property } = await supabaseAdmin.from('properties').select('*, landlord_profile:profiles!properties_landlord_fkey(*)').eq('id', recordId).single()
      const landlord = property.landlord_profile
      const msg = `EaseRent: Tenant ${actor.first_name} requested to move out of ${property.title}. Reason: ${extraData?.reason}`
      
      if (landlord.phone) await sendSMS(landlord.phone, msg)
      
      await sendMoveOutEmail({
        to: await getUserEmail(landlord.id),
        landlordName: landlord.first_name,
        tenantName: `${actor.first_name} ${actor.last_name}`,
        propertyTitle: property.title,
        reason: extraData?.reason
      })
    }

    // 2. Assign User
    else if (type === 'assign_user') {
      const { data: app } = await supabaseAdmin.from('applications').select('*, property:properties(*), tenant_profile:profiles(*)').eq('id', recordId).single()
      const tenant = app.tenant_profile
      const property = app.property
      const { data: landlord } = await supabaseAdmin.from('profiles').select('*').eq('id', property.landlord).single()

      const msg = `EaseRent: Congrats! You have been assigned to ${property.title}. Log in for details.`
      if (tenant.phone) await sendSMS(tenant.phone, msg)
      
      await sendAssignmentEmail({
        to: await getUserEmail(tenant.id),
        tenantName: tenant.first_name,
        propertyTitle: property.title,
        address: property.address,
        landlordName: `${landlord.first_name} ${landlord.last_name}`,
        phone: landlord.phone
      })
    }

    // 3. Maintenance
    else if (type === 'maintenance_new' || type === 'maintenance_status') {
      const { data: req } = await supabaseAdmin.from('maintenance_requests').select('*, property:properties(*), tenant_profile:profiles!maintenance_requests_tenant_fkey(*)').eq('id', recordId).single()
      const isNew = type === 'maintenance_new'
      const { data: landlord } = await supabaseAdmin.from('profiles').select('*').eq('id', req.property.landlord).single()
      
      const targetUser = isNew ? landlord : req.tenant_profile
      const msg = isNew ? `EaseRent: New maintenance request for ${req.property.title}: "${req.title}".` : `EaseRent: Maintenance "${req.title}" is now ${req.status}.`

      if (targetUser.phone) await sendSMS(targetUser.phone, msg)
      
      await sendMaintenanceEmail({
        to: await getUserEmail(targetUser.id),
        recipientName: targetUser.first_name,
        title: req.title,
        propertyTitle: req.property.title,
        status: req.status,
        isUpdate: !isNew
      })
    }

    // 4. Bookings
    else if (type === 'booking_new' || type === 'booking_status') {
       const { data: booking } = await supabaseAdmin.from('bookings').select('*, property:properties(*), tenant_profile:profiles(*)').eq('id', recordId).single()
       const isNew = type === 'booking_new'
       const { data: landlord } = await supabaseAdmin.from('profiles').select('*').eq('id', booking.property.landlord).single()
       
       const targetUser = isNew ? landlord : booking.tenant_profile
       const msg = isNew ? `EaseRent: New viewing request for ${booking.property.title}.` : `EaseRent: Viewing for ${booking.property.title} is ${booking.status}.`

       if (targetUser.phone) await sendSMS(targetUser.phone, msg)
       
       await sendBookingEmail({
         to: await getUserEmail(targetUser.id),
         recipientName: targetUser.first_name,
         propertyTitle: booking.property.title,
         date: booking.booking_date,
         status: booking.status,
         isNew: isNew
       })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Notify Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

async function getUserEmail(userId) {
  const { data } = await supabaseAdmin.rpc('get_user_email', { user_id: userId })
  return data
}