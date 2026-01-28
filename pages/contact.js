import Head from 'next/head'
import { useRouter } from 'next/router'
import Footer from '../components/Footer'

export default function Contact() {
  const router = useRouter()

  const emergencyContacts = [
    {
      id: 1,
      name: "Valencia Municipal Police Station",
      number: "0905-500-5491",
      rawNumber: "09055005491",
      color: "bg-blue-600",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      id: 2,
      name: "Valencia Municipal Fire Station",
      number: "0917-868-4819",
      rawNumber: "09178684819",
      color: "bg-red-600",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
        </svg>
      )
    },
    {
      id: 3,
      name: "Valencia RHU / Ambulance",
      number: "0910-577-6648",
      rawNumber: "09105776648",
      color: "bg-green-600",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )
    },
    {
      id: 4,
      name: "Valencia LDRRMO (Disaster Risk Reduction)",
      number: "0929-179-3115",
      rawNumber: "09291793115",
      color: "bg-orange-500",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    {
      id: 5,
      name: "Alpha Company 11th IB Philippine Army",
      number: "0918-759-4759",
      rawNumber: "09187594759",
      color: "bg-stone-700",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 6,
      name: "Parish Emergency Rescue Unit Volunteers",
      number: "0918-292-7116",
      rawNumber: "09182927116",
      color: "bg-sky-600",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-[#F2F3F4] font-sans text-black flex flex-col">
      <Head>
        <title>Emergency Contacts | EaseRent</title>
        <meta name="description" content="Local emergency hotline numbers for Valencia" />
      </Head>

      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        
        {/* Header & Navigation */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-black uppercase tracking-tight">Emergency Hotlines</h1>
            <p className="text-gray-500 font-medium mt-1">Local emergency numbers for Valencia</p>
          </div>
          {/* <button 
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 hover:border-black transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button> */}
        </div>

        {/* Warning Banner */}
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-xl shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-bold">
                Only use these numbers in case of genuine emergencies.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {emergencyContacts.map((contact) => (
            <div 
              key={contact.id}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-black/10 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${contact.color} p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {contact.icon}
                </div>
                <div className="bg-gray-50 px-2 py-1 rounded text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  24/7
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1 min-h-[3rem] flex items-center">
                {contact.name}
              </h3>
              
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Hotline Number</p>
                <a 
                  href={`tel:${contact.rawNumber}`}
                  className="text-2xl font-black text-black hover:text-blue-600 transition-colors flex items-center gap-2"
                >
                  {contact.number}
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Local Government Note */}
        <div className="mt-12 text-center border-t-2 border-dashed border-gray-200 pt-8">
          <p className="text-gray-500 text-sm">
            Information sourced from official Valencia Municipality public notices.
          </p>
        </div>

      </div>

      <Footer />
    </div>
  )
}