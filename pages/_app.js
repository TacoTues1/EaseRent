import '../styles/globals.css'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import NotificationToast from '../components/NotificationToast'
import Meta from '../components/Meta'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
// Removed 'react-hot-toast' imports
import { useRouter } from 'next/router'

function MyApp({ Component, pageProps }) {
  const router = useRouter()

  const hideNavbarPaths = ['/login', '/register', '/register-landlord', '/forgotPassword', '/updatePassword', '/getDirections']
  return (
    <>
      <Meta />

      {!hideNavbarPaths.includes(router.pathname) && <Navbar />}
      <NotificationToast />

      <Component {...pageProps} supabase={supabase} />
      <Analytics />
      <SpeedInsights />
    </>
  )
}

export default MyApp