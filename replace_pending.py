import os
import re

file_path = "components/LandlordDashboard.js"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

start_marker = "{pendingCancelEndRequests.map(req => ("
end_marker = "{dashboardTasks.payments.length > 0 && ("

new_content = '''{pendingCancelEndRequests.map(req => (
                        <div key={req.id} className="p-5 bg-white border border-gray-300 rounded-xl hover:border-black hover:shadow-lg transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4" onClick={() => openEndConfirmation('approve_cancel_end', req.id)}>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border border-black text-black">
                                Cancel Move-Out
                              </span>
                              <span className="text-xs text-gray-500 font-medium">Tenant Request</span>
                            </div>
                            <h4 className="font-black text-base sm:text-lg text-black mb-2 truncate">{req.property?.title}</h4>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-700">
                              <p className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {req.tenant?.first_name} {req.tenant?.last_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <button className="px-5 py-2.5 border-2 border-black bg-black text-white rounded-lg text-sm font-black uppercase hover:bg-white hover:text-black transition-all">Review</button>
                          </div>
                        </div>
                      ))}

                      {pendingEndRequests.filter(req => req.end_request_status === 'pending').map(req => {
                        const isApproved = req.end_request_status === 'approved';
                        return (
                          <div key={req.id} className="p-5 bg-white border border-gray-300 rounded-xl hover:border-black hover:shadow-lg transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4" onClick={() => isApproved ? setActivePanel('terminations') : openEndConfirmation('approve', req.id)}>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <span className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border border-black text-black">
                                  {isApproved ? 'Scheduled Move-Out' : 'Move-Out Request'}
                                </span>
                                <span className="text-xs text-gray-500 font-medium">{isApproved ? 'Already Approved' : 'Request Pending'}</span>
                              </div>
                              <h4 className="font-black text-base sm:text-lg text-black mb-2 truncate">{req.property?.title}</h4>
                              <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-700">
                                <p className="flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                  {req.tenant?.first_name} {req.tenant?.last_name}
                                </p>
                                {req.end_request_date && (
                                  <p className="flex items-center gap-2 text-black font-bold">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Leaves: {new Date(req.end_request_date).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-2 sm:mt-0">
                              <button className="px-5 py-2.5 border-2 border-black bg-black text-white rounded-lg text-sm font-black uppercase hover:bg-white hover:text-black transition-all">{isApproved ? 'View' : 'Review'}</button>
                            </div>
                          </div>
                        )
                      })}

                      {pendingRenewalRequests.map(req => (
                        <div key={req.id} className="p-5 bg-white border border-gray-300 rounded-xl hover:border-black hover:shadow-lg transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4" onClick={() => openRenewalModal(req, 'approve')}>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border border-black text-black">
                                Renewal Request
                              </span>
                              <span className="text-xs text-gray-500 font-medium">Action Required</span>
                            </div>
                            <h4 className="font-black text-base sm:text-lg text-black mb-2 truncate">{req.property?.title}</h4>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-700">
                              <p className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {req.tenant?.first_name} {req.tenant?.last_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <button className="px-5 py-2.5 border-2 border-black bg-black text-white rounded-lg text-sm font-black uppercase hover:bg-white hover:text-black transition-all">Review</button>
                          </div>
                        </div>
                      ))}

                      {dashboardTasks.maintenance.length > 0 && (
                        <div onClick={() => router.push('/maintenance')} className="p-5 bg-white border border-gray-300 rounded-xl hover:border-black hover:shadow-lg transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border border-black text-black">
                                Maintenance
                              </span>
                              <span className="text-xs text-gray-500 font-medium">To Review</span>
                            </div>
                            <h4 className="font-black text-base sm:text-lg text-black mb-2 truncate">{dashboardTasks.maintenance.length} Pending Reports</h4>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-700">
                              <p className="flex items-center gap-2">
                                Review and assign maintenance tasks.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <button className="px-5 py-2.5 border-2 border-black bg-black text-white rounded-lg text-sm font-black uppercase hover:bg-white hover:text-black transition-all">Review</button>
                          </div>
                        </div>
                      )}

                      {dashboardTasks.payments.length > 0 && (
                        <div onClick={() => router.push('/payments')} className="p-5 bg-white border border-gray-300 rounded-xl hover:border-black hover:shadow-lg transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border border-black text-black">
                                Payments
                              </span>
                              <span className="text-xs text-gray-500 font-medium">Check Receipts</span>
                            </div>
                            <h4 className="font-black text-base sm:text-lg text-black mb-2 truncate">{dashboardTasks.payments.length} Pending Confirmations</h4>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-700">
                              <p className="flex items-center gap-2">
                                Verify tenant payment submissions.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <button className="px-5 py-2.5 border-2 border-black bg-black text-white rounded-lg text-sm font-black uppercase hover:bg-white hover:text-black transition-all">Review</button>
                          </div>
                        </div>
                      )}'''

# Find the start and end indices
start_idx = text.find(start_marker)
# Find the end marker and then find the closing tag for that block
end_idx = text.find(end_marker, start_idx)
if start_idx != -1 and end_idx != -1:
    # Need to go past the last block to close it properly.
    # The last block ends with "</div>\n                      )}"
    end_block_end = text.find("</div>\n                      )}", end_idx) + len("</div>\n                      )}")
    
    final_text = text[:start_idx] + new_content + text[end_block_end:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(final_text)
    print("Replaced successfully")
else:
    print("Could not find markers")
    print(f"Start: {start_idx}, End: {end_idx}")

