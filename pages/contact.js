import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Footer from '../components/Footer'

const CONTACTS_BY_CITY = {
  valencia: [
    { id: 1, name: 'Valencia Municipal Police Station', number: '0905-500-5491', rawNumber: '09055005491', color: 'bg-blue-600', type: 'police' },
    { id: 2, name: 'Valencia Municipal Fire Station', number: '0917-868-4819', rawNumber: '09178684819', color: 'bg-red-600', type: 'fire' },
    { id: 3, name: 'Valencia RHU / Ambulance', number: '0910-577-6648', rawNumber: '09105776648', color: 'bg-green-600', type: 'medical' },
    { id: 4, name: 'Valencia LDRRMO (Disaster Risk Reduction)', number: '0929-179-3115', rawNumber: '09291793115', color: 'bg-orange-500', type: 'disaster' },
    { id: 5, name: 'Alpha Company 11th IB Philippine Army', number: '0918-759-4759', rawNumber: '09187594759', color: 'bg-stone-700', type: 'security' },
    { id: 6, name: 'Parish Emergency Rescue Unit Volunteers', number: '0918-292-7116', rawNumber: '09182927116', color: 'bg-sky-600', type: 'rescue' }
  ],
  dumaguete: [
    { id: 1, name: 'Dumaguete Emergency Response', number: '911', rawNumber: '911', color: 'bg-blue-600', type: 'disaster' },
    { id: 2, name: 'Dumaguete Fire Emergency', number: '911', rawNumber: '911', color: 'bg-red-600', type: 'fire' },
    { id: 3, name: 'Dumaguete Medical Emergency', number: '911', rawNumber: '911', color: 'bg-green-600', type: 'medical' }
  ]
}

const CITY_LABELS = {
  valencia: 'Valencia',
  dumaguete: 'Dumaguete'
}

function normalizeCityName(value) {
  const city = (value || '').toLowerCase().trim()

  if (city.includes('dumaguete')) return 'dumaguete'
  if (city.includes('valencia')) return 'valencia'

  return ''
}

function renderServiceIcon(type) {
  if (type === 'police' || type === 'security') {
    return (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  }

  if (type === 'fire') {
    return (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    )
  }

  if (type === 'medical') {
    return (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    )
  }

  if (type === 'disaster') {
    return (
      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  }

  return (
    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

export default function Contact() {
  const router = useRouter()
  const DEFAULT_CITY = 'dumaguete'
  const LOCATION_CITY_KEY = 'ablay_user_location_city'
  const LOCATION_PERMISSION_KEY = 'ablay_user_location_permission'
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY)
  const [locationMessage, setLocationMessage] = useState('Detecting your location...')

  const emergencyContacts = useMemo(() => CONTACTS_BY_CITY[selectedCity] || [], [selectedCity])

  useEffect(() => {
    const detectLocation = async () => {
      // Reuse dashboard location if it's already known.
      try {
        const cachedPermission = localStorage.getItem(LOCATION_PERMISSION_KEY)
        const cachedCityRaw = localStorage.getItem(LOCATION_CITY_KEY)
        const cachedCity = normalizeCityName(cachedCityRaw)

        if (cachedPermission === 'denied') {
          setSelectedCity(DEFAULT_CITY)
          setLocationMessage(`Location permission was denied. Showing default directory for ${CITY_LABELS[DEFAULT_CITY]}.`)
          return
        }

        if (cachedPermission === 'granted' && cachedCity && CONTACTS_BY_CITY[cachedCity]?.length) {
          setSelectedCity(cachedCity)
          setLocationMessage(`Showing emergency contacts for ${CITY_LABELS[cachedCity]}.`)
          return
        }
      } catch (_) {}

      if (typeof window === 'undefined' || !navigator?.geolocation) {
        setSelectedCity(DEFAULT_CITY)
        setLocationMessage(`Location access is unavailable on this device. Showing default directory for ${CITY_LABELS[DEFAULT_CITY]}.`)
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
            const data = await response.json()
            const detected = normalizeCityName(data?.city || data?.locality || data?.principalSubdivision || '')

            if (detected && CONTACTS_BY_CITY[detected]?.length) {
              setSelectedCity(detected)
              setLocationMessage(`Showing emergency contacts for ${CITY_LABELS[detected]}.`)
              try {
                localStorage.setItem(LOCATION_PERMISSION_KEY, 'granted')
                localStorage.setItem(LOCATION_CITY_KEY, detected)
              } catch (_) {}
            } else {
              setSelectedCity(DEFAULT_CITY)
              setLocationMessage(`No direct city match from your location. Showing default directory for ${CITY_LABELS[DEFAULT_CITY]}.`)
            }
          } catch (error) {
            console.error('Failed to detect city:', error)
            setSelectedCity(DEFAULT_CITY)
            setLocationMessage(`Could not determine your city. Showing default directory for ${CITY_LABELS[DEFAULT_CITY]}.`)
          }
        },
        () => {
          setSelectedCity(DEFAULT_CITY)
          setLocationMessage(`Location permission denied. Showing default directory for ${CITY_LABELS[DEFAULT_CITY]}.`)
          try {
            localStorage.setItem(LOCATION_PERMISSION_KEY, 'denied')
            localStorage.removeItem(LOCATION_CITY_KEY)
          } catch (_) {}
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      )
    }

    detectLocation()
  }, [])

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-black flex flex-col">
      <Head>
        <title>Emergency Contacts | Abalay</title>
        <meta name="description" content="Location-based emergency hotline numbers" />
      </Head>

      <div className="relative overflow-hidden border-b border-black/10 bg-[#e9e3d6]">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(120deg, #d5ccb8 0%, transparent 42%, #b8c4b6 100%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-black/60">Location Based Public Safety Directory</p>
              <h1 className="mt-2 text-3xl sm:text-5xl font-black leading-[0.98] tracking-tight">Emergency Contacts</h1>
              <p className="mt-3 text-sm sm:text-base text-black/70 max-w-2xl">Direct lines for police, fire, ambulance, disaster response, and local rescue support. Keep this page accessible and call only for urgent situations.</p>
              <p className="mt-3 text-sm font-semibold text-black/70">{locationMessage}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-5 py-2.5 rounded-full border border-black/20 bg-white/80 backdrop-blur text-sm font-bold hover:bg-white transition-colors cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black tracking-tight">Before You Call</h2>
              <ul className="mt-4 space-y-3 text-sm text-black/70">
                <li className="border-l-2 border-black/20 pl-3">Confirm the nearest landmark and exact address.</li>
                <li className="border-l-2 border-black/20 pl-3">State the incident clearly and stay on the line.</li>
                <li className="border-l-2 border-black/20 pl-3">Keep your phone available for callback instructions.</li>
              </ul>
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">Important</p>
                <p className="mt-1 text-sm text-red-700">Use these numbers for real emergencies only.</p>
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8">
            <div className="divide-y divide-black/10 rounded-3xl border border-black/10 bg-white shadow-sm overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] px-5 sm:px-7 py-4 bg-[#f8f6f1]">
                <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.16em] text-black/55">Service</p>
                <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.16em] text-black/55">Direct Line</p>
              </div>

              {emergencyContacts.map((contact) => (
                <article key={contact.id} className="group px-5 sm:px-7 py-5 sm:py-6 hover:bg-[#fbfaf7] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`${contact.color} p-2.5 rounded-xl shadow-sm`}>
                          {renderServiceIcon(contact.type)}
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">24/7 Availability</p>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black leading-tight tracking-tight">{contact.name}</h3>
                    </div>

                    <a
                      href={`tel:${contact.rawNumber}`}
                      className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-black/15 bg-white px-3.5 py-2.5 hover:border-black/40 hover:bg-black hover:text-white transition-all"
                    >
                      <span className="text-sm sm:text-base font-black tracking-wide">{contact.number}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  </div>
                </article>
              ))}

              {emergencyContacts.length === 0 && (
                <div className="px-5 sm:px-7 py-8">
                  <p className="text-sm text-black/60">No emergency contacts configured for this city yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="mt-8 border-t border-black/10 pt-5">
          <p className="text-sm text-black/55">Data source: municipality public notices and local agency postings.</p>
        </div>
      </div>

      <Footer />
    </div>
  )
}