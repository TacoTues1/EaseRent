import '../styles/globals.css'
import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import Meta from '../components/Meta'
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from 'react-hot-toast'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Meta />
      <Toaster position="top-center" />
      <Navbar />
      <Component {...pageProps} supabase={supabase} />
      <Analytics />
    </>
  )
}

export default MyApp
