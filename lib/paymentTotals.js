export const NON_ADVANCE_PAYMENT_REQUEST_FILTER = 'is_advance_payment.is.null,is_advance_payment.eq.false'

export function sumPaymentRequestCharges(request = {}) {
  return [
    request.rent_amount,
    request.security_deposit_amount,
    request.advance_amount,
    request.water_bill,
    request.electrical_bill,
    request.wifi_bill,
    request.other_bills
  ].reduce((sum, value) => sum + (parseFloat(value || 0) || 0), 0)
}

export function getRecordedPaymentRequestAmount(request = {}) {
  const amountPaid = parseFloat(request.amount_paid || 0) || 0
  return amountPaid > 0 ? amountPaid : sumPaymentRequestCharges(request)
}

export function sumRecordedPaymentRequestAmounts(requests = []) {
  return (requests || []).reduce((sum, request) => sum + getRecordedPaymentRequestAmount(request), 0)
}
