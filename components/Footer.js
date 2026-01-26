import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-black text-white py-8 mt-6">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-1 text-center">
          
          {/* Logo */}
          <div className="flex items-center">
            <span className="text-xl font-black tracking-tighter">EaseRent</span>
          </div>
          
          {/* Combined Links & Contact */}
          <p className="text-gray-500 text-xs flex flex-wrap items-center justify-center gap-2 ">
            <span>© 2026 EaseRent, Inc.</span>
            
            <span className="hidden sm:inline text-gray-700">|</span> 
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            
            <span className="hidden sm:inline text-gray-700">|</span>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>

            <span className="hidden sm:inline text-gray-700">|</span>
            <a href="mailto:admin@easerent.com" className="hover:text-white transition-colors flex items-center gap-1">
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
               admin@easerent.com
            </a>

            <span className="hidden sm:inline text-gray-700">|</span>
            <a href="tel:+639111111111" className="hover:text-white transition-colors flex items-center gap-1">
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
               +63 911 111 1111
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}