import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from '../components/Footer'
import PropertyCard from '../components/PropertyCard'
import { supabase } from '../lib/supabaseClient'

export default function FavoritesPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [properties, setProperties] = useState([])
  const [propertyStats, setPropertyStats] = useState({})
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const skeletonFavoriteIndices = Array.from({ length: 8 }, (_, index) => index)

  useEffect(() => {
    let isMounted = true

    async function bootstrap() {
      const { data: sessionResult } = await supabase.auth.getSession()
      const activeSession = sessionResult?.session || null
      if (!activeSession) {
        router.push('/login')
        return
      }

      setSession(activeSession)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeSession.user.id)
        .maybeSingle()

      if (!isMounted) return
      setProfile(profileData || null)

      if (profileData?.role === 'admin') {
        router.push('/dashboard')
        return
      }

      await loadFavorites(activeSession.user.id)
    }

    bootstrap()

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!nextSession) {
        setSession(null)
        setProfile(null)
        setFavorites([])
        setProperties([])
        router.push('/login')
        return
      }

      setSession(nextSession)
      await loadFavorites(nextSession.user.id)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (properties.length === 0) return

    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const next = { ...prev }
        properties.forEach((property) => {
          const images = getPropertyImages(property)
          if (images.length > 1) {
            next[property.id] = ((prev[property.id] || 0) + 1) % images.length
          }
        })
        return next
      })
    }, 2500)

    return () => clearInterval(interval)
  }, [properties])

  async function loadFavorites(userId) {
    setLoading(true)
    const { data: favoriteRows, error: favoritesError } = await supabase
      .from('favorites')
      .select('property_id')
      .eq('user_id', userId)

    if (favoritesError) {
      showToast.error('Failed to load favorites')
      setFavorites([])
      setProperties([])
      setLoading(false)
      return
    }

    const favoriteIds = (favoriteRows || []).map((row) => row.property_id)
    setFavorites(favoriteIds)

    if (favoriteIds.length === 0) {
      setProperties([])
      setPropertyStats({})
      setLoading(false)
      return
    }

    const { data: propertiesData, error: propertiesError } = await supabase
      .from('properties')
      .select('*')
      .eq('is_deleted', false)
      .in('id', favoriteIds)

    if (propertiesError) {
      showToast.error('Failed to load favorite properties')
      setProperties([])
      setPropertyStats({})
      setLoading(false)
      return
    }

    const orderedProperties = favoriteIds
      .map((id) => (propertiesData || []).find((property) => property.id === id))
      .filter(Boolean)

    const { data: statsData } = await supabase
      .from('property_stats')
      .select('property_id, favorite_count, avg_rating, review_count')
      .in('property_id', favoriteIds)

    const statsMap = {}
    ;(statsData || []).forEach((stat) => {
      statsMap[stat.property_id] = {
        favorite_count: stat.favorite_count || 0,
        avg_rating: stat.avg_rating || 0,
        review_count: stat.review_count || 0,
      }
    })

    setPropertyStats(statsMap)
    setProperties(orderedProperties)
    setLoading(false)
  }

  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) return

    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', session.user.id)
        .eq('property_id', propertyId)

      if (error) {
        showToast.error('Failed to update favorites')
        return
      }

      setFavorites(prev => prev.filter((id) => id !== propertyId))
      setProperties(prev => prev.filter((property) => property.id !== propertyId))
      showToast.success('Removed from favorites')
      return
    }

    const { error } = await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
    if (!error) {
      setFavorites(prev => [...prev, propertyId])
      showToast.success('Added to favorites')
      await loadFavorites(session.user.id)
    }
  }

  function getPropertyImages(property) {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    return ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop']
  }

  const nextImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [propertyId]: ((prev[propertyId] || 0) + 1) % imagesLength,
    }))
  }

  const prevImage = (propertyId, imagesLength) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [propertyId]: ((prev[propertyId] || 0) - 1 + imagesLength) % imagesLength,
    }))
  }

  const renderFavoritesSkeletonGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {skeletonFavoriteIndices.map((index) => (
        <div key={`favorite-skeleton-${index}`} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="h-48 w-full bg-slate-200 skeleton-shimmer" />
          <div className="p-4 space-y-3">
            <div className="h-5 w-3/4 rounded bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-1/2 rounded bg-slate-200 skeleton-shimmer" />
            <div className="h-4 w-2/3 rounded bg-slate-200 skeleton-shimmer" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-4 w-16 rounded bg-slate-200 skeleton-shimmer" />
              <div className="h-8 w-8 rounded-full bg-slate-200 skeleton-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f8fafc] pt-20">
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="mb-7 sm:mb-10 flex items-center justify-between gap-3 flex-wrap">
          <div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-9 w-64 rounded bg-slate-200 skeleton-shimmer" />
                <div className="h-5 w-80 max-w-[90vw] rounded bg-slate-200 skeleton-shimmer" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900">My Favorite Properties</h1>
                <p className="text-sm sm:text-base text-gray-500 mt-1">
                  {profile ? `${profile.first_name || 'User'}, these are all properties you marked as favorite.` : 'Your saved homes in one place.'}
                </p>
              </>
            )}
          </div>
          {loading ? (
            <div className="h-10 w-32 rounded-xl bg-slate-200 skeleton-shimmer" />
          ) : (
            <button
              onClick={() => router.push('/properties/allProperties')}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-black text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Browse More
            </button>
          )}
        </div>

        {loading ? (
          renderFavoritesSkeletonGrid()
        ) : properties.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-4">No favorites yet</h2>
            <p className="text-gray-500 mt-1">Tap the heart on any property to save it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {properties.map((property) => {
              const images = getPropertyImages(property)
              return (
                <PropertyCard
                  key={property.id}
                  property={property}
                  images={images}
                  currentIndex={currentImageIndex[property.id] || 0}
                  isFavorite={favorites.includes(property.id)}
                  stats={propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }}
                  onToggleFavorite={(e) => toggleFavorite(e, property.id)}
                  onPrevImage={() => prevImage(property.id, images.length)}
                  onNextImage={() => nextImage(property.id, images.length)}
                  showCompare={false}
                />
              )
            })}
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}