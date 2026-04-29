import {
    sendNotificationEmail,
    sendOnlinePaymentReceivedEmail,
} from "@/lib/email";
import { sendPaymentReceivedNotification, sendSMS } from "@/lib/sms";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const event = req.body;

    // PayMongo sends events in this format:
    const eventType = event?.data?.attributes?.type;
    const eventData = event?.data?.attributes?.data;
    // Only process payment success events
    if (
      eventType !== "checkout_session.payment.paid" &&
      eventType !== "link.payment.paid"
    ) {
      return res.status(200).json({ received: true, ignored: true });
    }

    // Extract session/link data
    const attributes = eventData?.attributes || {};
    const payments = attributes.payments || [];
    const metadata = attributes.metadata || {};
    const paymentRequestId = metadata.payment_request_id;

    console.log(
      `[PayMongo Webhook] Payment Request ID from metadata: ${paymentRequestId}`,
    );
    console.log(`[PayMongo Webhook] Payments count: ${payments.length}`);

    // ─── HANDLE SUBSCRIPTION SLOT PAYMENTS ───
    // If this is a subscription slot purchase (not a rent payment), process separately
    if (metadata.type === "subscription_slot") {
      const subscriptionPaymentId = metadata.subscription_payment_id;
      const subscriptionId = metadata.subscription_id;
      const tenantId = metadata.tenant_id;

      console.log(
        `[PayMongo Webhook] Processing SUBSCRIPTION SLOT payment for tenant: ${tenantId}`,
      );

      if (!subscriptionPaymentId || !subscriptionId) {
        console.error(
          "[PayMongo Webhook] Missing subscription payment metadata",
        );
        return res
          .status(200)
          .json({ received: true, error: "Missing subscription metadata" });
      }

      // Load current payment status
      const { data: existingPayment } = await supabase
        .from("subscription_payments")
        .select("status, subscription_id")
        .eq("id", subscriptionPaymentId)
        .single();

      // Mark subscription payment as paid when needed.
      if (existingPayment?.status !== "paid") {
        await supabase
          .from("subscription_payments")
          .update({
            status: "paid",
            payment_method: "paymongo",
            paid_at: new Date().toISOString(),
          })
          .eq("id", subscriptionPaymentId);
      }

      const resolvedSubscriptionId =
        existingPayment?.subscription_id || subscriptionId;
      const FREE_SLOTS = 1;
      const MAX_FAMILY_MEMBERS = 4;

      // Reconcile slots from paid payments to prevent missed increments on retries/races.
      const { count: paidCount } = await supabase
        .from("subscription_payments")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", resolvedSubscriptionId)
        .eq("status", "paid");

      let usedFamilySlots = 0;
      if (tenantId) {
        const { data: latestOccupancy } = await supabase
          .from("tenant_occupancies")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("status", ["active", "pending_end"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestOccupancy?.id) {
          const { count } = await supabase
            .from("family_members")
            .select("id", { count: "exact", head: true })
            .eq("parent_occupancy_id", latestOccupancy.id);
          usedFamilySlots = count || 0;
        }
      }

      const maxPaidSlots = Math.max(0, MAX_FAMILY_MEMBERS - FREE_SLOTS);
      const newPaidSlots = Math.min(
        Math.max(paidCount || 0, usedFamilySlots - FREE_SLOTS),
        maxPaidSlots,
      );
      const newTotalSlots = Math.min(
        MAX_FAMILY_MEMBERS,
        Math.max(FREE_SLOTS + newPaidSlots, usedFamilySlots),
      );

      await supabase
        .from("subscriptions")
        .update({
          paid_slots: newPaidSlots,
          total_slots: newTotalSlots,
          plan_type: newPaidSlots > 0 ? "paid" : "free",
        })
        .eq("id", resolvedSubscriptionId);

      // Send in-app notification to tenant
      if (tenantId) {
        await supabase.from("notifications").insert({
          recipient: tenantId,
          type: "subscription_upgraded",
          message: `Your family member slot has been unlocked! You now have ${newTotalSlots} slot(s).`,
          data: { subscription_id: subscriptionId },
          read: false,
        });

        // Send Email Receipt
        try {
          const { data: userData } =
            await supabase.auth.admin.getUserById(tenantId);
          const tenantEmail = userData?.user?.email;

          if (tenantEmail) {
            const { data: tenantProfile } = await supabase
              .from("profiles")
              .select("first_name")
              .eq("id", tenantId)
              .single();
            const userName = tenantProfile?.first_name || "Tenant";

            await sendNotificationEmail({
              to: tenantEmail,
              subject: "Payment Successful - Family Member Slot Unlocked",
              message: `<div style="font-family: sans-serif; color: #333;">
                                <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Payment Confirmed!</h2>
                                <p>Dear ${userName},</p>
                                <p>We confirm that your payment has been successfully processed via PayMongo.</p>
                                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
                                  <p style="margin: 5px 0;"><strong>Item:</strong> Extra Family Member Slot</p>
                                  <p style="margin: 5px 0;"><strong>Total Slots:</strong> ${newTotalSlots}</p>
                                </div>
                                <p>Thank you for using Abalay!</p>
                            </div>`,
            });
          }
        } catch (emailErr) {
          console.error(
            "[PayMongo Webhook] Family Slot Email error:",
            emailErr,
          );
        }
      }

      return res
        .status(200)
        .json({ received: true, success: true, type: "subscription_slot" });
    }

    // ─── HANDLE LANDLORD PROPERTY SLOT PAYMENTS ───
    if (metadata.type === "landlord_property_slot") {
      const landlordSlotPaymentId = metadata.landlord_slot_payment_id;
      const landlordSubscriptionId = metadata.landlord_subscription_id;
      const landlordId = metadata.landlord_id;

      console.log(
        `[PayMongo Webhook] Processing LANDLORD PROPERTY SLOT payment for landlord: ${landlordId}`,
      );

      if (!landlordSlotPaymentId || !landlordSubscriptionId) {
        console.error(
          "[PayMongo Webhook] Missing landlord slot payment metadata",
        );
        return res
          .status(200)
          .json({ received: true, error: "Missing landlord slot metadata" });
      }

      const { data: existingLandlordPayment } = await supabase
        .from("landlord_slot_payments")
        .select("status, subscription_id")
        .eq("id", landlordSlotPaymentId)
        .single();

      if (existingLandlordPayment?.status !== "paid") {
        await supabase
          .from("landlord_slot_payments")
          .update({
            status: "paid",
            payment_method: "paymongo",
            paid_at: new Date().toISOString(),
          })
          .eq("id", landlordSlotPaymentId);
      }

      const resolvedLandlordSubId =
        existingLandlordPayment?.subscription_id || landlordSubscriptionId;
      const LANDLORD_FREE_SLOTS = 3;
      const MAX_PROPERTY_SLOTS = 10;

      const { count: landlordPaidCount } = await supabase
        .from("landlord_slot_payments")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", resolvedLandlordSubId)
        .eq("status", "paid");

      const maxLandlordPaidSlots = Math.max(
        0,
        MAX_PROPERTY_SLOTS - LANDLORD_FREE_SLOTS,
      );
      const { count: landlordUsedSlots } = landlordId
        ? await supabase
            .from("properties")
            .select("id", { count: "exact", head: true })
            .eq("landlord", landlordId)
            .eq("is_deleted", false)
        : { count: 0 };
      const newLandlordPaidSlots = Math.min(
        Math.max(landlordPaidCount || 0, (landlordUsedSlots || 0) - LANDLORD_FREE_SLOTS),
        maxLandlordPaidSlots,
      );
      const newLandlordTotalSlots = Math.min(
        MAX_PROPERTY_SLOTS,
        Math.max(LANDLORD_FREE_SLOTS + newLandlordPaidSlots, landlordUsedSlots || 0),
      );

      await supabase
        .from("landlord_subscriptions")
        .update({
          paid_slots: newLandlordPaidSlots,
          total_slots: newLandlordTotalSlots,
          plan_type: newLandlordPaidSlots > 0 ? "paid" : "free",
          updated_at: new Date().toISOString(),
        })
        .eq("id", resolvedLandlordSubId);

      console.log(
        `[PayMongo Webhook] ✅ Landlord subscription reconciled: ${newLandlordTotalSlots} total property slots for landlord ${landlordId}`,
      );

      if (landlordId) {
        await supabase.from("notifications").insert({
          recipient: landlordId,
          type: "property_slot_purchased",
          message: `Your property slot has been unlocked! You now have ${newLandlordTotalSlots} property slot(s).`,
          data: { subscription_id: landlordSubscriptionId },
          read: false,
        });

        // Send Email Receipt
        try {
          const { data: userData } =
            await supabase.auth.admin.getUserById(landlordId);
          const landlordEmail = userData?.user?.email;

          if (landlordEmail) {
            const { data: landlordProfile } = await supabase
              .from("profiles")
              .select("first_name")
              .eq("id", landlordId)
              .single();
            const userName = landlordProfile?.first_name || "Landlord";

            await sendNotificationEmail({
              to: landlordEmail,
              subject: "Payment Successful - Property Slot Unlocked",
              message: `<div style="font-family: sans-serif; color: #333;">
                                <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Payment Confirmed!</h2>
                                <p>Dear ${userName},</p>
                                <p>We confirm that your payment has been successfully processed via PayMongo.</p>
                                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
                                  <p style="margin: 5px 0;"><strong>Item:</strong> Extra Property Slot</p>
                                  <p style="margin: 5px 0;"><strong>Total Slots:</strong> ${newLandlordTotalSlots}</p>
                                </div>
                                <p>Thank you for using Abalay!</p>
                            </div>`,
            });
          }
        } catch (emailErr) {
          console.error(
            "[PayMongo Webhook] Landlord Slot Email error:",
            emailErr,
          );
        }
      }

      return res
        .status(200)
        .json({
          received: true,
          success: true,
          type: "landlord_property_slot",
        });
    }

    // ─── HANDLE REGULAR RENT PAYMENTS ───

    // Find the successful payment
    let amountPaid = 0;
    let transactionId = "";

    if (eventType === "checkout_session.payment.paid") {
      // Checkout Session event
      const successfulPayment =
        payments.find(
          (p) =>
            p.attributes?.status === "paid" ||
            p.data?.attributes?.status === "paid",
        ) || payments[0];

      if (successfulPayment) {
        const payAttrs =
          successfulPayment.attributes ||
          successfulPayment.data?.attributes ||
          {};
        amountPaid = (payAttrs.amount || 0) / 100;
        const externalRef = payAttrs.external_reference_number || "";
        const sessionRef = attributes.reference_number || "";
        transactionId =
          externalRef ||
          sessionRef ||
          successfulPayment.id ||
          eventData?.id ||
          "";
      } else {
        // Fallback: use checkout session amount
        amountPaid = (attributes.amount || 0) / 100;
        transactionId = attributes.reference_number || eventData?.id || "";
      }
    } else if (eventType === "link.payment.paid") {
      // Link payment event
      const successPay =
        payments.find((p) => p.data?.attributes?.status === "paid") ||
        payments[0];

      if (successPay) {
        amountPaid = (successPay.data?.attributes?.amount || 0) / 100;
        const externalRef =
          successPay.data?.attributes?.external_reference_number || "";
        const linkRef = attributes.reference_number || "";
        transactionId = externalRef || linkRef || successPay.data?.id || "";
      } else {
        amountPaid = (attributes.amount || 0) / 100;
        transactionId = attributes.reference_number || eventData?.id || "";
      }
    }

    console.log(`[PayMongo Webhook] Amount Paid: ₱${amountPaid}`);
    console.log(`[PayMongo Webhook] Transaction ID: ${transactionId}`);

    // If no payment_request_id in metadata, try to find it from remarks or reference
    let finalPaymentRequestId = paymentRequestId;

    if (!finalPaymentRequestId) {
      // Try to extract from remarks
      const remarks = attributes.remarks || "";
      const match = remarks.match(/Payment Request ID:\s*(.+)/);
      if (match) {
        finalPaymentRequestId = match[1].trim();
      }
    }

    if (!finalPaymentRequestId) {
      console.error(
        "[PayMongo Webhook] No payment_request_id found in metadata or remarks",
      );
      // Still return 200 to prevent PayMongo from retrying
      return res
        .status(200)
        .json({ received: true, error: "No payment_request_id found" });
    }

    // Get Payment Request Details
    const { data: request, error: requestError } = await supabase
      .from("payment_requests")
      .select("*, properties(title)")
      .eq("id", finalPaymentRequestId)
      .single();

    if (requestError || !request) {
      console.error(
        "[PayMongo Webhook] Payment request not found:",
        finalPaymentRequestId,
      );
      return res
        .status(200)
        .json({ received: true, error: "Payment request not found" });
    }

    // Skip if already paid via paymongo (avoid double processing from both polling + webhook)
    if (request.status === "paid" && request.payment_method === "paymongo") {
      console.log("[PayMongo Webhook] Already processed, skipping");
      return res
        .status(200)
        .json({ received: true, message: "Already processed" });
    }

    console.log(
      `[PayMongo Webhook] Processing payment for: ${request.properties?.title}`,
    );

    // ====== PROCESS PAYMENT (same logic as process-paymongo-success.js) ======

    const requestTotal =
      parseFloat(request.rent_amount || 0) +
      parseFloat(request.advance_amount || 0) +
      parseFloat(request.security_deposit_amount || 0) +
      parseFloat(request.water_bill || 0) +
      parseFloat(request.electrical_bill || 0) +
      parseFloat(request.wifi_bill || 0) +
      parseFloat(request.other_bills || 0);

    // Handle tenant balance (excess / deduction)
    const { data: balanceRecord } = await supabase
      .from("tenant_balances")
      .select("*")
      .eq("tenant_id", request.tenant)
      .eq("occupancy_id", request.occupancy_id)
      .maybeSingle();

    let balanceChange = 0;
    let availableExcess = amountPaid - requestTotal;

    if (availableExcess > 0) {
      balanceChange = availableExcess;
    } else if (availableExcess < 0) {
      const needed = Math.abs(availableExcess);
      const currentBalance = balanceRecord?.amount || 0;
      if (currentBalance >= needed) {
        balanceChange = -needed;
      } else if (currentBalance > 0) {
        balanceChange = -currentBalance;
      }
    }

    if (balanceChange !== 0 && request.occupancy_id) {
      const newBalance = (balanceRecord?.amount || 0) + balanceChange;
      await supabase.from("tenant_balances").upsert(
        {
          tenant_id: request.tenant,
          occupancy_id: request.occupancy_id,
          amount: newBalance,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "tenant_id,occupancy_id" },
      );
    }

    // Create Payment Record (Ledger)
    const { data: paymentRecord, error: paymentError } = await supabase
      .from("payments")
      .insert({
        property_id: request.property_id,
        tenant: request.tenant,
        landlord: request.landlord,
        amount: amountPaid,
        water_bill: request.water_bill,
        electrical_bill: request.electrical_bill,
        wifi_bill: request.wifi_bill,
        other_bills: request.other_bills,
        bills_description: request.bills_description,
        method: "paymongo",
        status: "recorded",
        paid_at: new Date().toISOString(),
        currency: "PHP",
      })
      .select()
      .single();

    if (paymentError)
      console.error(
        "[PayMongo Webhook] Failed to create payment record:",
        paymentError,
      );

    // Update Payment Request Status
    const updatedDescription = request.bills_description
      ? `${request.bills_description} (Via PayMongo)`
      : "Payment (Via PayMongo)";

    const { error: updateError } = await supabase
      .from("payment_requests")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: "paymongo",
        bills_description: updatedDescription,
        tenant_reference_number: transactionId,
        payment_id: paymentRecord?.id,
      })
      .eq("id", finalPaymentRequestId);

    if (updateError) {
      console.error("[PayMongo Webhook] Update error:", updateError);
    }

    // Handle Advance Payment Records (skip move-in payments)
    let monthlyRent = parseFloat(request.rent_amount || 0);
    let extraMonths = 0;
    if (monthlyRent > 0 && !request.is_move_in_payment) {
      const advanceAmount = parseFloat(request.advance_amount || 0);
      if (advanceAmount > 0) {
        extraMonths = Math.floor(advanceAmount / monthlyRent);
      }
    }

    if (extraMonths > 0 && request.occupancy_id) {
      const baseDueDate = new Date(request.due_date);
      for (let i = 1; i <= extraMonths; i++) {
        const futureDueDate = new Date(baseDueDate);
        const currentMonth = futureDueDate.getMonth();
        const currentYear = futureDueDate.getFullYear();
        const currentDay = futureDueDate.getDate();

        const targetMonth = currentMonth + i;
        const targetYear = currentYear + Math.floor(targetMonth / 12);
        let finalMonth = targetMonth % 12;
        if (finalMonth < 0) finalMonth += 12;

        futureDueDate.setFullYear(targetYear);
        futureDueDate.setMonth(finalMonth);
        futureDueDate.setDate(currentDay);

        await supabase.from("payment_requests").insert({
          landlord: request.landlord,
          tenant: request.tenant,
          property_id: request.property_id,
          occupancy_id: request.occupancy_id,
          rent_amount: monthlyRent,
          water_bill: 0,
          electrical_bill: 0,
          other_bills: 0,
          bills_description: `Advance Payment (Month ${i + 1} of ${extraMonths + 1}) - via PayMongo`,
          due_date: futureDueDate.toISOString(),
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: "paymongo",
          is_advance_payment: true,
          payment_id: paymentRecord?.id,
          tenant_reference_number: transactionId,
        });
      }
    }

    // Notifications
    try {
      const { data: tenantProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", request.tenant)
        .single();

      const message = `Payment of ₱${amountPaid.toLocaleString()} for "${request.properties?.title}" received (Via PayMongo).`;

      // SMS to Tenant
      if (tenantProfile?.phone) {
        try {
          await sendSMS(tenantProfile.phone, message);
        } catch (smsErr) {
          console.error("[PayMongo Webhook] SMS error:", smsErr);
        }
      }

      // Email to Tenant
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(
          request.tenant,
        );
        const tenantEmail = userData?.user?.email;

        if (tenantEmail) {
          await sendNotificationEmail({
            to: tenantEmail,
            subject: "Payment Successful (Via PayMongo)",
            message: `<div style="font-family: sans-serif; color: #333;">
                            <p>Dear ${tenantProfile?.first_name || "Tenant"},</p>
                            <p>We confirm that your payment of <strong>₱${amountPaid.toLocaleString()}</strong> has been successfully processed via PayMongo.</p>
                            <p>Property: ${request.properties?.title}</p>
                            <p>Transaction ID: ${transactionId}</p>
                            <p>Thank you!</p>
                        </div>`,
          });
        }
      } catch (emailErr) {
        console.error("[PayMongo Webhook] Email error:", emailErr);
      }

      // Notify Landlord (in-app)
      await supabase.from("notifications").insert({
        recipient: request.landlord,
        actor: request.tenant,
        type: "payment_paid",
        message: `Tenant paid ₱${amountPaid.toLocaleString()} for ${request.properties?.title} via PayMongo.`,
        link: "/payments",
        data: { payment_request_id: request.id },
      });

      // Email + SMS to Landlord
      try {
        const { data: landlordEmail } = await supabase.rpc("get_user_email", {
          user_id: request.landlord,
        });
        const { data: landlordProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone")
          .eq("id", request.landlord)
          .single();

        const landlordName = landlordProfile
          ? `${landlordProfile.first_name} ${landlordProfile.last_name}`
          : "Landlord";
        const tenantName = tenantProfile
          ? `${tenantProfile.first_name} ${tenantProfile.last_name}`
          : "Tenant";

        if (landlordEmail) {
          await sendOnlinePaymentReceivedEmail({
            to: landlordEmail,
            landlordName,
            tenantName,
            propertyTitle: request.properties?.title || "Property",
            amount: amountPaid,
            paymentMethod: "paymongo",
            transactionId: transactionId,
          });
        }

        if (landlordProfile?.phone) {
          await sendPaymentReceivedNotification(landlordProfile.phone, {
            method: "paymongo",
            tenantName,
            amount: amountPaid.toLocaleString(),
            propertyTitle: request.properties?.title || "Property",
          });
        }
      } catch (llErr) {
        console.error("[PayMongo Webhook] Landlord notification error:", llErr);
      }
    } catch (notifyErr) {
      console.error("[PayMongo Webhook] Notification error:", notifyErr);
    }

    console.log(
      `[PayMongo Webhook] ✅ Payment processed successfully for ${request.properties?.title}`,
    );
    return res.status(200).json({ received: true, success: true });
  } catch (err) {
    console.error("[PayMongo Webhook] Error:", err);
    // IMPORTANT: Return 200 even on error to prevent PayMongo from retrying endlessly
    return res.status(200).json({ received: true, error: err.message });
  }
}
