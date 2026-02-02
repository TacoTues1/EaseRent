// pages/getDirections.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function GetDirections() {
  const router = useRouter();
  const mapRef = useRef(null);      
  const mapInstance = useRef(null); 
  const userMarker = useRef(null);
  const userArrow = useRef(null);
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
  const [isPanelHidden, setIsPanelHidden] = useState(false);

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
  
  // NEW: Selected route index for each mode (0 = primary, 1 = alternate)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  // Store the active route coordinates for navigation
  const activeRouteCoords = useRef([]); 

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
  const drawRoutes = useCallback((routes, LInstance, mode, selectedIdx = 0) => {
    if (!mapInstance.current || !routes || routes.length === 0) return;
    
    // Clear existing route lines
    routeLines.current.forEach(line => {
      if (line && line.remove) line.remove();
    });
    routeLines.current = [];

    let mainColor = '#111827'; 
    if (mode === 'bike') mainColor = '#7c3aed'; 
    if (mode === 'foot') mainColor = '#059669'; 

    // Draw all routes, with non-selected ones first (behind)
    routes.forEach((route, index) => {
      if (index === selectedIdx) return; // Skip selected, draw it last
      
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const polyline = LInstance.polyline(coords, {
        color: '#9ca3af', 
        weight: 5, 
        opacity: 0.5, 
        lineJoin: 'round',
        className: 'route-alternate'
      }).addTo(mapInstance.current);
      
      // Make alternate routes clickable to select them
      polyline.on('click', () => {
        setSelectedRouteIndex(index);
        drawRoutes(routes, LInstance, mode, index);
      });
      
      routeLines.current.push(polyline);
    });

    // Draw selected route last (on top)
    const selectedRoute = routes[selectedIdx];
    if (selectedRoute) {
      const selectedCoords = selectedRoute.geometry.coordinates.map(c => [c[1], c[0]]);
      
      // Store active route coordinates for navigation
      activeRouteCoords.current = selectedCoords;
      
      const selectedPolyline = LInstance.polyline(selectedCoords, {
        color: mainColor, 
        weight: 7, 
        opacity: 1.0, 
        lineJoin: 'round',
        className: 'route-selected'
      }).addTo(mapInstance.current);
      
      routeLines.current.push(selectedPolyline);
      
      // Only fit bounds if we are NOT navigating
      if (!isNavigating) {
        mapInstance.current.fitBounds(selectedPolyline.getBounds(), { 
          paddingTopLeft: [50, 50], 
          paddingBottomRight: [50, 300] 
        });
      }
    }
  }, [isNavigating]);

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
        // Reset to first route when calculating fresh routes
        setSelectedRouteIndex(0);
    }

    // Determine mode: if preserving, keep current. If new calculation, pick best available.
    let modeToUse = selectedMode;
    if (!preserveMode) {
        modeToUse = drivingRoutes.length > 0 ? 'driving' : bikeRoutes.length > 0 ? 'bike' : 'foot';
        setSelectedMode(modeToUse);
    }
    
    // Get the current route index (preserve during navigation)
    const routeIdx = preserveMode ? selectedRouteIndex : 0;
    
    // Draw based on the determined mode
    if (modeToUse === 'driving' && drivingRoutes.length > 0) drawRoutes(drivingRoutes, L, 'driving', routeIdx);
    else if (modeToUse === 'bike' && bikeRoutes.length > 0) drawRoutes(bikeRoutes, L, 'bike', routeIdx);
    else if (modeToUse === 'foot' && footRoutes.length > 0) drawRoutes(footRoutes, L, 'foot', routeIdx);
  }, [selectedMode, isNavigating, selectedRouteIndex, drawRoutes]);

  // --- Real-time Route Updater ---
  useEffect(() => {
    // Only update if we are actively navigating, have locations, and the map is ready
    if (isNavigating && userLocation && destLocation && mapInstance.current) {
        const now = Date.now();
        // Throttle updates to every 2 seconds to reduce API calls
        if (now - lastRouteUpdate.current > 2000) {
            lastRouteUpdate.current = now;
            import('leaflet').then(L => {
                // Redraw the current selected route from stored coordinates
                // This keeps the line visible and in sync with user position
                if (activeRouteCoords.current.length > 0) {
                    // Clear and redraw the route line
                    routeLines.current.forEach(line => {
                        if (line && line.remove) line.remove();
                    });
                    routeLines.current = [];
                    
                    let mainColor = '#111827'; 
                    if (selectedMode === 'bike') mainColor = '#7c3aed'; 
                    if (selectedMode === 'foot') mainColor = '#059669';
                    
                    const polyline = L.polyline(activeRouteCoords.current, {
                        color: mainColor, 
                        weight: 7, 
                        opacity: 1.0, 
                        lineJoin: 'round'
                    }).addTo(mapInstance.current);
                    
                    routeLines.current.push(polyline);
                }
            });
        }
    }
  }, [userLocation, isNavigating, destLocation, selectedMode]);

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
      }, 250);
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

  const updateUserMarker = (lat, lng, L, heading = null) => {
    if (userMarker.current) userMarker.current.remove();
    if (userArrow.current) userArrow.current.remove();
    
    // Calculate bearing to destination for direction
    let bearingDeg = 0;
    if (destLocation) {
      bearingDeg = calculateBearing(lat, lng, destLocation.lat, destLocation.lng);
    }
    // Use device heading if available, otherwise use bearing to destination
    if (heading !== null && !isNaN(heading)) {
      bearingDeg = heading;
    }
    
    // Create a simple navigation marker with Tailwind classes
    const navigationIcon = L.divIcon({
      className: '',
      html: `
        <div class="relative w-12 h-12">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-500/20 rounded-full animate-ping"></div>
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 border-[3px] border-white rounded-full shadow-lg z-10"></div>
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style="transform: translate(-50%, -50%) rotate(${bearingDeg}deg);">
            <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[14px] border-b-blue-600 -mt-6"></div>
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
    
    const marker = L.marker([lat, lng], { icon: navigationIcon }).addTo(mapInstance.current);
    userMarker.current = marker;
  };

  // Calculate bearing between two points
  const calculateBearing = (lat1, lng1, lat2, lng2) => {
    const toRad = (deg) => deg * Math.PI / 180;
    const toDeg = (rad) => rad * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
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

  // Helper to offset user position to bottom of screen so they see more road ahead
  const getOffsetCenter = (lat, lng, offsetY = 0.0008) => {
    // Offset north so user appears in lower part of screen
    return [lat + offsetY, lng];
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
        
        // Zoom out to see full route
        if (mapInstance.current && userLocation && destLocation) {
            import('leaflet').then((L) => {
                const bounds = L.latLngBounds([userLocation.lat, userLocation.lng], [destLocation.lat, destLocation.lng]);
                mapInstance.current.fitBounds(bounds, { padding: [50, 150] });
            });
        }
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
        
        // Zoom in close with user at bottom of screen
        if (mapInstance.current && userLocation) {
            const offsetCenter = getOffsetCenter(userLocation.lat, userLocation.lng);
            mapInstance.current.setView(offsetCenter, 18, { animate: true });
        }

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const heading = position.coords.heading;
                setUserLocation({ lat, lng });

                if (mapInstance.current) {
                    import('leaflet').then((L) => {
                        updateUserMarker(lat, lng, L, heading);
                        // Position user at bottom of screen so they see road ahead
                        const offsetCenter = getOffsetCenter(lat, lng);
                        mapInstance.current.setView(offsetCenter, 18, { animate: true, duration: 0.3 }); 
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
    setSelectedRouteIndex(0); // Reset to first route when changing mode
    import('leaflet').then(L => {
        if (routesData[mode] && routesData[mode].length > 0) {
            drawRoutes(routesData[mode], L, mode, 0);
        }
    });
  };

  // Handle route selection (for alternate routes)
  const handleRouteSelect = (index) => {
    setSelectedRouteIndex(index);
    import('leaflet').then(L => {
        if (routesData[selectedMode] && routesData[selectedMode].length > 0) {
            drawRoutes(routesData[selectedMode], L, selectedMode, index);
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
        <div className={`absolute left-1/2 transform -translate-x-1/2 w-[95%] max-w-md z-[1000] transition-all duration-300 ${isPanelHidden ? 'bottom-4' : 'bottom-4'}`}>
           
           {/* Toggle Button */}
           <button 
             onClick={() => setIsPanelHidden(!isPanelHidden)}
             className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-white shadow-lg rounded-full p-2 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer z-10"
           >
             <svg className={`w-5 h-5 text-gray-600 transition-transform duration-300 ${isPanelHidden ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
             </svg>
           </button>
           
           {/* Panel Content */}
           <div className={`bg-white shadow-2xl rounded-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${isPanelHidden ? 'max-h-0 p-0 opacity-0' : 'max-h-[500px] p-4 opacity-100'}`}>
              <div className="flex flex-col gap-3">
              
              {/* STATUS BAR */}
              {isNavigating && (
                 <div className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 shadow-lg">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    Live Navigation Active
                 </div>
              )}

              {/* INPUTS ROW */}
              <div className="flex flex-col gap-2 relative">
                 <div className="flex items-center bg-gray-50 rounded-xl px-3 py-2.5 relative z-50 border border-gray-200">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3 shadow-sm"></div>
                    <input className="flex-1 bg-transparent text-sm font-medium outline-none placeholder-gray-400" placeholder="Your Location" value={fromAddress} onChange={handleAddressChange} onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }} />
                    <button onClick={handleShowMyLocation} className="p-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600 transition-colors cursor-pointer shadow-sm" title="Locate Me">
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
                 
                 <div className="pl-5 -my-0.5 z-0"><div className="w-0.5 h-4 bg-gray-300 rounded-full"></div></div>

                 <div className="flex items-center bg-gray-50 rounded-xl px-3 py-2.5 z-0 border border-gray-200">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-3 shadow-sm"></div>
                    <input className="flex-1 bg-transparent text-sm font-medium outline-none text-gray-600" placeholder="Destination" value={toAddress || "Property Location"} readOnly />
                 </div>
              </div>

              {/* ROUTE STATS & LIVE NAVIGATION */}
              {routesData.driving.length > 0 || routesData.bike.length > 0 || routesData.foot.length > 0 ? (
                  <div className="flex flex-col gap-3">
                      {/* Route Mode Selection (4 COLS) */}
                      <div className="grid grid-cols-4 gap-2">
                          
                          {/* 1. Driving */}
                          <button onClick={() => handleModeClick('driving')} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all cursor-pointer ${selectedMode === 'driving' ? 'bg-gray-900 text-white border-gray-900 shadow-lg scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                             <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                             <span className="text-[10px] font-bold uppercase">{routesData.driving.length > 1 ? `Car (${routesData.driving.length})` : 'Car'}</span>
                             <span className="text-xs font-bold mt-0.5">{routesData.driving[0] ? formatDuration(routesData.driving[0].duration) : '--'}</span>
                          </button>

                          {/* 2. Bike */}
                          <button onClick={() => handleModeClick('bike')} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all cursor-pointer ${selectedMode === 'bike' ? 'bg-violet-600 text-white border-violet-600 shadow-lg scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                             <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/></svg>
                             <span className="text-[10px] font-bold uppercase">{routesData.bike.length > 1 ? `Bike (${routesData.bike.length})` : 'Bike'}</span>
                             <span className="text-xs font-bold mt-0.5">{routesData.bike[0] ? formatDuration(routesData.bike[0].duration) : '--'}</span>
                          </button>

                          {/* 3. Walk */}
                          <button onClick={() => handleModeClick('foot')} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all cursor-pointer ${selectedMode === 'foot' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                             <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
                             <span className="text-[10px] font-bold uppercase">{routesData.foot.length > 1 ? `Walk (${routesData.foot.length})` : 'Walk'}</span>
                             <span className="text-xs font-bold mt-0.5">{routesData.foot[0] ? formatDuration(routesData.foot[0].duration) : '--'}</span>
                          </button>

                          {/* 4. START NAVIGATION (Beside the others) */}
                          <button 
                            onClick={toggleNavigation}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all cursor-pointer ${isNavigating ? 'bg-red-500 text-white border-red-500 shadow-lg scale-105' : 'bg-blue-600 text-white border-blue-600 shadow-lg hover:bg-blue-700 hover:scale-105'}`}
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

                      {/* Route Selection (when alternate routes available) */}
                      {routesData[selectedMode] && routesData[selectedMode].length > 1 && !isNavigating && (
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                            Select Route ({routesData[selectedMode].length} available)
                          </p>
                          <div className="flex gap-2">
                            {routesData[selectedMode].map((route, index) => {
                              const isSelected = selectedRouteIndex === index;
                              const distance = (route.distance / 1000).toFixed(1);
                              const duration = formatDuration(route.duration);
                              
                              return (
                                <button
                                  key={index}
                                  onClick={() => handleRouteSelect(index)}
                                  className={`flex-1 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'bg-white border-black shadow-md' 
                                      : 'bg-white border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs font-bold ${isSelected ? 'text-black' : 'text-gray-500'}`}>
                                      {index === 0 ? '🏆 Fastest' : `Route ${index + 1}`}
                                    </span>
                                    {isSelected && (
                                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className={`font-bold ${isSelected ? 'text-black' : 'text-gray-600'}`}>{duration}</span>
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-500">{distance} km</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-2 text-center">
                            Tap on the gray route on the map to select it
                          </p>
                        </div>
                      )}
                  </div>
              ) : (
                <div className="text-center py-3">
                    {statusMsg ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-blue-600"></div>
                        <p className="text-sm font-medium text-gray-600">{statusMsg}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Tap the location button to start</p>
                    )}
                </div>
              )}
              </div>
           </div>
        </div>
      </div>
    </>
  );
}