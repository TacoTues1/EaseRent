import '../styles/globals.css'
import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import Meta from '../components/Meta'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Toaster } from 'react-hot-toast'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Meta />
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 3000,
          className: '',
          style: {
            background: '#ffffff',
            color: '#1f2937',
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '500',
            maxWidth: '350px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
          success: {
            icon: '✓',
            iconTheme: {
              primary: '#16a34a',
              secondary: '#ffffff',
            },
            style: {
              background: '#16a34a',
              color: '#ffffff',
            },
          },
          error: {
            icon: '✕',
            iconTheme: {
              primary: '#dc2626',
              secondary: '#ffffff',
            },
            style: {
              background: '#dc2626',
              color: '#ffffff',
            },
          },
        }}
        containerStyle={{
          top: 80,
        }}
        gutter={8}
      />
      <Navbar />
      <Component {...pageProps} supabase={supabase} />
      <Analytics />
      <SpeedInsights />
    </>
  )
}

export default MyApp
