// pages/getDirections.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function GetDirections() {
  const router = useRouter();
  const mapRef = useRef(null);      
  const mapInstance = useRef(null); 
  const userMarker = useRef(null);
  const destMarker = useRef(null);
  const routeLines = useRef([]); 
  const isInitializing = useRef(false);
  const watchId = useRef(null);
  
  // Throttle ref to prevent API spamming during navigation
  const lastRouteUpdate = useRef(0);

  // Data State
  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [userLocation, setUserLocation] = useState(null); 
  const [destLocation, setDestLocation] = useState(null); 
  const [isRouting, setIsRouting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef(null);

  // Routes Data State
  const [routesData, setRoutesData] = useState({
    driving: [], 
    bike: [],
    foot: []
  });
  const [selectedMode, setSelectedMode] = useState('driving'); 

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mapInstance.current || isInitializing.current) return;

    isInitializing.current = true;

    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstance.current || mapRef.current._leaflet_id) {
        isInitializing.current = false;
        return;
      }
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
      const map = L.map(mapRef.current, { zoomControl: false }).setView([10.3157, 123.8854], 13);
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      mapInstance.current = map;
      isInitializing.current = false;
    }).catch(err => {
      console.error("Failed to load Leaflet", err);
      isInitializing.current = false;
    });
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      isInitializing.current = false;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  // 2. Handle URL Params
  useEffect(() => {
    if (router.isReady) {
      const { to, lat, lng, auto } = router.query;
      if (to) setToAddress(to);

      const checkMapReady = setInterval(() => {
        if (mapInstance.current) {
          clearInterval(checkMapReady);
          import('leaflet').then((L) => {
            if (lat && lng) {
              const dLat = parseFloat(lat);
              const dLng = parseFloat(lng);
              setDestLocation({ lat: dLat, lng: dLng });
              addDestinationMarker(dLat, dLng, L);
            } else if (to) {
              geocodeAddress(to, L);
            }
            if (auto === 'true') {
                handleShowMyLocation();
            }
          });
        }
      }, 100);
      return () => clearInterval(checkMapReady);
    }
  }, [router.isReady, router.query]);

  // --- Markers & Geocoding ---
  const addDestinationMarker = (lat, lng, L) => {
    if (!mapInstance.current) return;
    if (destMarker.current) destMarker.current.remove();
    const redIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    const marker = L.marker([lat, lng], { icon: redIcon }).addTo(mapInstance.current).bindPopup("<b>Property Location</b>").openPopup();
    destMarker.current = marker;
    mapInstance.current.setView([lat, lng], 15);
  };

  const geocodeAddress = async (address, L) => {
    setStatusMsg('Locating property...');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setDestLocation({ lat, lng });
        addDestinationMarker(lat, lng, L);
        setStatusMsg('');
      } else {
        setStatusMsg('Location not found.');
      }
    } catch (err) {
      setStatusMsg('Error locating property.');
    }
  };

  // --- Route Drawing Helper ---
  const drawRoutes = (routes, LInstance, mode) => {
    if (!mapInstance.current || !routes || routes.length === 0) return;
    routeLines.current.forEach(line => line.remove());
    routeLines.current = [];

    let mainColor = '#111827'; 
    if (mode === 'bike') mainColor = '#7c3aed'; 
    if (mode === 'foot') mainColor = '#059669'; 

    routes.slice(1).forEach(route => {
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const polyline = LInstance.polyline(coords, {
            color: '#272828', weight: 5, opacity: 0.5, lineJoin: 'round'
        }).addTo(mapInstance.current);
        routeLines.current.push(polyline);
    });

    const bestRoute = routes[0];
    const bestCoords = bestRoute.geometry.coordinates.map(c => [c[1], c[0]]);
    const bestPolyline = LInstance.polyline(bestCoords, {
        color: mainColor, weight: 7, opacity: 1.0, lineJoin: 'round'
    }).addTo(mapInstance.current);
    routeLines.current.push(bestPolyline);
    
    // Only fit bounds if we are NOT navigating (to allow user to pan around freely while driving)
    if (!isNavigating) {
        mapInstance.current.fitBounds(bestPolyline.getBounds(), { paddingTopLeft: [50, 50], paddingBottomRight: [50, 300] });
    }
  };

  // --- Route Calculation ---
  const fetchRouteData = async (profile, start, end) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?alternatives=true&overview=full&geometries=geojson`
      );
      const data = await response.json();
      if (data.code === 'Ok' && data.routes.length > 0) return data.routes;
      return [];
    } catch (error) { return []; }
  };

  // Wrapped in useCallback to use in useEffect
  const calculateAllRoutes = useCallback(async (start, end, L, preserveMode = false) => {
    if (!start || !end) return;
    
    // Don't show "Calculating" toast if we are just updating the line live
    if (!preserveMode) {
        setIsRouting(true);
        setStatusMsg('Calculating routes...');
    }

    const [drivingRoutes, bikeRoutes, footRoutes] = await Promise.all([
      fetchRouteData('driving', start, end),
      fetchRouteData('bike', start, end),
      fetchRouteData('foot', start, end)
    ]);

    setRoutesData({ driving: drivingRoutes, bike: bikeRoutes, foot: footRoutes });
    
    if (!preserveMode) {
        setIsRouting(false);
        setStatusMsg('');
    }

    // Determine mode: if preserving, keep current. If new calculation, pick best available.
    let modeToUse = selectedMode;
    if (!preserveMode) {
        modeToUse = drivingRoutes.length > 0 ? 'driving' : bikeRoutes.length > 0 ? 'bike' : 'foot';
        setSelectedMode(modeToUse);
    }
    
    // Draw based on the determined mode
    if (modeToUse === 'driving' && drivingRoutes.length > 0) drawRoutes(drivingRoutes, L, 'driving');
    else if (modeToUse === 'bike' && bikeRoutes.length > 0) drawRoutes(bikeRoutes, L, 'bike');
    else if (modeToUse === 'foot' && footRoutes.length > 0) drawRoutes(footRoutes, L, 'foot');
  }, [selectedMode, isNavigating]); // Depends on selectedMode so it knows what to preserve

  // --- Real-time Route Updater ---
  useEffect(() => {
    // Only update if we are actively navigating, have locations, and the map is ready
    if (isNavigating && userLocation && destLocation && mapInstance.current) {
        const now = Date.now();
        // Throttle updates to every 4 seconds to avoid API bans
        if (now - lastRouteUpdate.current > 4000) {
            lastRouteUpdate.current = now;
            import('leaflet').then(L => {
                // Pass true to preserveMode to keep current vehicle selection and silence status
                calculateAllRoutes(userLocation, destLocation, L, true);
            });
        }
    }
  }, [userLocation, isNavigating, destLocation, calculateAllRoutes]);

  const handleAddressChange = (e) => {
    const value = e.target.value;
    setFromAddress(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length > 2) {
      searchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&addressdetails=1`);
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        } catch (error) { console.error("Autocomplete Error:", error); }
      }, 500);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    setFromAddress(suggestion.display_name);
    setShowSuggestions(false);
    setUserLocation({ lat, lng });
    if (mapInstance.current) {
       import('leaflet').then((L) => {
          updateUserMarker(lat, lng, L);
          if (destLocation) {
             calculateAllRoutes({ lat, lng }, destLocation, L);
          } else {
             mapInstance.current.setView([lat, lng], 15);
          }
       });
    }
  };

  const updateUserMarker = (lat, lng, L) => {
    if (userMarker.current) userMarker.current.remove();
    const marker = L.circleMarker([lat, lng], {
        radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 3, opacity: 1, fillOpacity: 1
    }).addTo(mapInstance.current);
    userMarker.current = marker;
  };

  // --- User Location & Navigation Logic ---

  const handleShowMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported.");
      return;
    }
    setStatusMsg('Locating...');
    setShowSuggestions(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        setFromAddress("My Location");
        setStatusMsg('');

        if (mapInstance.current) {
          import('leaflet').then((L) => {
            updateUserMarker(lat, lng, L);
            if (destLocation) {
              calculateAllRoutes({ lat, lng }, destLocation, L);
            } else {
               mapInstance.current.setView([lat, lng], 15);
            }
          });
        }
      },
      (error) => {
        setStatusMsg('Location access denied.');
      }
    );
  };

  const toggleNavigation = () => {
    if (isNavigating) {
        // Stop Tracking
        setIsNavigating(false);
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        setStatusMsg('Navigation Stopped');
    } else {
        // Start Tracking
        if (!userLocation) {
            alert("We need your location first. Locating you now...");
            handleShowMyLocation();
            return; 
        }

        if (!navigator.geolocation) return alert("Geolocation not supported");
        
        setIsNavigating(true);
        setStatusMsg('Live Navigation Active');

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setUserLocation({ lat, lng });

                if (mapInstance.current) {
                    import('leaflet').then((L) => {
                        if (userMarker.current) userMarker.current.remove();
                        const marker = L.circleMarker([lat, lng], {
                            radius: 10, fillColor: "#2563eb", color: "#fff", weight: 3, opacity: 1, fillOpacity: 1
                        }).addTo(mapInstance.current);
                        userMarker.current = marker;
                        // Keep user centered
                        mapInstance.current.setView([lat, lng]); 
                    });
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    }
  };

  const handleModeClick = (mode) => {
    setSelectedMode(mode);
    import('leaflet').then(L => {
        if (routesData[mode] && routesData[mode].length > 0) {
            drawRoutes(routesData[mode], L, mode);
        }
    });
  };

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin=""/>
      </Head>

      <div className="relative h-screen w-full bg-gray-100 overflow-hidden font-sans">
        
        {/* MAP LAYER */}
        <div id="map" ref={mapRef} className="absolute inset-0 z-0" />

        {/* BACK BUTTON */}
        <div className="absolute top-4 left-4 z-[500]">
            <button onClick={() => router.back()} className="bg-white text-black px-4 py-2.5 rounded-xl shadow-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg> Back
            </button>
        </div>

        {/* FLOATING BOTTOM PANEL */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-md z-[1000]">
           <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl p-5 border border-gray-100 flex flex-col gap-4">
              <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-1"></div>
              
              {/* STATUS BAR */}
              {isNavigating && (
                 <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-xs font-bold text-center border border-blue-100 mb-2 animate-pulse">
                    Live Tracking Active • Following you
                 </div>
              )}

              {/* INPUTS ROW */}
              <div className="flex flex-col gap-2 relative">
                 <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2 relative z-50">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <input className="flex-1 bg-transparent text-sm font-medium outline-none placeholder-gray-400" placeholder="Your Location" value={fromAddress} onChange={handleAddressChange} onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }} />
                    <button onClick={handleShowMyLocation} className="p-1.5 bg-white rounded-lg shadow-sm text-blue-600 hover:scale-105 transition-transform cursor-pointer" title="Locate Me">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 z-[2000] overflow-hidden max-h-60 overflow-y-auto">
                        {suggestions.map((item, index) => (
                          <div key={index} onClick={() => selectSuggestion(item)} className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start gap-3">
                            <span className="text-sm text-gray-700 leading-snug">{item.display_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                 </div>
                 
                 <div className="pl-4 -my-1 z-0"><div className="w-0.5 h-3 bg-gray-300"></div></div>

                 <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2 z-0">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                    <input className="flex-1 bg-transparent text-sm font-medium outline-none text-gray-500 cursor-not-allowed" placeholder="Destination" value={toAddress || "Property Location"} readOnly />
                 </div>
              </div>

              {/* ROUTE STATS & LIVE NAVIGATION */}
              {routesData.driving.length > 0 || routesData.bike.length > 0 || routesData.foot.length > 0 ? (
                  /* --- GRID LAYOUT (4 COLS) --- */
                  <div className="grid grid-cols-4 gap-2 mt-2">
                      
                      {/* 1. Driving */}
                      <button onClick={() => handleModeClick('driving')} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${selectedMode === 'driving' ? 'bg-black text-white border-black shadow-md' : 'bg-white text-gray-400 border-gray-100'}`}>
                         <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                         <span className="text-[10px] font-bold uppercase">{routesData.driving.length > 1 ? `Car (${routesData.driving.length})` : 'Car'}</span>
                         <span className="text-xs font-bold mt-0.5">{routesData.driving[0] ? formatDuration(routesData.driving[0].duration) : '--'}</span>
                      </button>

                      {/* 2. Bike */}
                      <button onClick={() => handleModeClick('bike')} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${selectedMode === 'bike' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-gray-400 border-gray-100'}`}>
                         <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 18.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zm0 0h1.5m-1.5 0l-5.25-5.25h-3m3 0l-3-3m0 0H6.75m1.5 0l3 3m0 0l-1.5 1.5m3-3L15 8.25m0 0l3 3m0 0l1.5-1.5M15 8.25V6" /></svg>
                         <span className="text-[10px] font-bold uppercase">{routesData.bike.length > 1 ? `Bike (${routesData.bike.length})` : 'Bike'}</span>
                         <span className="text-xs font-bold mt-0.5">{routesData.bike[0] ? formatDuration(routesData.bike[0].duration) : '--'}</span>
                      </button>

                      {/* 3. Walk */}
                      <button onClick={() => handleModeClick('foot')} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${selectedMode === 'foot' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-gray-400 border-gray-100'}`}>
                         <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 19.5l-3-6-3 6m3-13.5V12m0 0l3.75 3.75M12 12l-3.75 3.75" /></svg>
                         <span className="text-[10px] font-bold uppercase">{routesData.foot.length > 1 ? `Walk (${routesData.foot.length})` : 'Walk'}</span>
                         <span className="text-xs font-bold mt-0.5">{routesData.foot[0] ? formatDuration(routesData.foot[0].duration) : '--'}</span>
                      </button>

                      {/* 4. START NAVIGATION (Beside the others) */}
                      <button 
                        onClick={toggleNavigation}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${isNavigating ? 'bg-red-600 text-white border-red-600 shadow-md animate-pulse' : 'bg-blue-600 text-white border-blue-600 shadow-md hover:bg-blue-700'}`}
                      >
                         {isNavigating ? (
                            <>
                                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                <span className="text-[10px] font-bold uppercase">Stop</span>
                                <span className="text-xs font-bold mt-0.5">Nav</span>
                            </>
                         ) : (
                            <>
                                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                <span className="text-[10px] font-bold uppercase">Start</span>
                                <span className="text-xs font-bold mt-0.5">Nav</span>
                            </>
                         )}
                      </button>
                  </div>
              ) : (
                <div className="text-center py-4">
                    {statusMsg ? <p className="text-sm font-medium text-blue-600 animate-pulse">{statusMsg}</p> : <p className="text-sm text-gray-400">Tap the location icon to start.</p>}
                </div>
              )}
           </div>
        </div>
      </div>
    </>
  );
}