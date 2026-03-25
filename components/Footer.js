import Link from 'next/link'
import { useState } from 'react'
import { showToast } from 'nextjs-toast-notify'
import { supabase } from '../lib/supabaseClient'

export default function Footer() {
  const [isBugModalOpen, setIsBugModalOpen] = useState(false)
  const [bugData, setBugData] = useState({ name: '', description: '' })
  const [bugFile, setBugFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleBugSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      let filePayload = {}

      if (bugFile) {
        // Read file as base64
        const reader = new FileReader()
        const fileBase64 = await new Promise((resolve, reject) => {
          reader.readAsDataURL(bugFile)
          reader.onload = () => resolve(reader.result)
          reader.onerror = error => reject(error)
        })
        
        // base64 contains data:image/png;base64,..... so we split it
        const base64Data = fileBase64.split(',')[1]
        
        filePayload = {
          attachmentName: bugFile.name,
          attachmentContent: base64Data
        }
      }

      // 2. Hit the internal API
      const res = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bugData.name,
          description: bugData.description,
          ...filePayload
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Server error when sending report.')
      }

      // 3. Show Toast Notification
      showToast.success('Thank you for submitting, ensure it will big help to us to improve our system', {
        duration: 5000,
        progress: true,
        position: 'top-center',
        transition: 'bounceIn',
        icon: '',
        sound: true,
      })
      
      setIsBugModalOpen(false)
      setBugData({ name: '', description: '' })
      setBugFile(null)

    } catch (error) {
      console.error(error)
      showToast.error(error.message || 'Error submitting report', { duration: 4000, transition: 'bounceIn' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <footer className="bg-[#F7F7F7] text-[#222222] py-12 border-t border-[#DDDDDD] font-sans">
        <div className="w-full max-w-[1800px] mx-auto px-6 lg:px-10">
          
          {/* Main Link Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-[#DDDDDD]">
            
            {/* Column 1 */}
            <div className="flex flex-col space-y-3">
              <h3 className="font-bold text-[14px]">Support</h3>
              <button 
                onClick={() => setIsBugModalOpen(true)}
                className="text-[14px] hover:underline hover:text-black text-left cursor-pointer transition-colors"
              >
                Report a bug
              </button>

              {/* Social Icons */}
              <div className="flex items-center gap-4 pt-4">
                <a href="https://facebook.com/pahingakamunaaaa" className="hover:text-black transition-colors text-[#222222]" aria-label="Facebook">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" /></svg>
                </a>
                <a href="#" className="hover:text-black transition-colors text-[#222222]" aria-label="X (Twitter)">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="#" className="hover:text-black transition-colors text-[#222222]" aria-label="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" /></svg>
                </a>
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col space-y-3">
              <h3 className="font-bold text-[14px]">Landlords</h3>
              <a href="#" className="text-[14px] hover:underline hover:text-black">List your property</a>
              <Link href="/landlords/landlordlist" className="text-[14px] hover:underline hover:text-black">Landlord list</Link>
            </div>

            {/* Column 3 */}
            <div className="flex flex-col space-y-3">
              <h3 className="font-bold text-[14px]">Abalay</h3>
              <Link href="/about" className="text-[14px] hover:underline hover:text-black">How it works</Link>
              <Link href="/team" className="text-[14px] hover:underline hover:text-black">Our Team</Link>
            </div>

          </div>

          {/* Bottom Section */}
          <div className="flex flex-col-reverse lg:flex-row items-center justify-between pt-6 gap-4">
            
            {/* Left */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1 text-[14px]">
              <span className="mb-1 md:mb-0">© 2026 Abalay</span>
              <span className="hidden md:inline">·</span>
              <Link href="/privacy" className="hover:underline">Privacy</Link>
              <span className="hidden md:inline">·</span>
              <Link href="/terms" className="hover:underline">Terms</Link>
            </div>

            <div className="flex items-center gap-6 text-[14px] font-medium"></div>
          </div>
        </div>
      </footer>

      {/* Report Bug Modal */}
      {isBugModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-xl font-bold">Report a Problem</h2>
              <button 
                onClick={() => !isSubmitting && setIsBugModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                disabled={isSubmitting}
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleBugSubmit} className="p-5 font-sans">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    maxLength="100"
                    placeholder="Enter your name"
                    value={bugData.name}
                    onChange={(e) => setBugData({...bugData, name: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-black outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Issue Description</label>
                  <textarea
                    required
                    rows="4"
                    maxLength="1000"
                    placeholder="What broke? How can we reproduce it? Please provide details."
                    value={bugData.description}
                    onChange={(e) => setBugData({...bugData, description: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-black outline-none transition-colors resize-none"
                  ></textarea>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Attachment <span className="text-gray-400 font-normal">(Image or Video)</span></label>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => setBugFile(e.target.files[0])}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                  />
                  <p className="mt-1 text-xs text-gray-500">Attach a screenshot or short screen recording to help us locate the bug faster.</p>
                </div>
              </div>
              <div className="mt-8">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-black text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting Report...
                    </>
                  ) : 'Submit Bug Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
