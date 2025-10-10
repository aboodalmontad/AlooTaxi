import { RouteInfo, LocationSuggestion } from '../types';

let apiKey = '5b3ce3597851110001cf6248e12d4b05e23f4f36be3b1b7f7c69a82a';

export const setMapApiKey = (newKey: string) => {
    if (newKey && newKey.trim() !== '') {
        apiKey = newKey;
    }
};

// Use absolute URLs for direct API calls, as ORS supports CORS.
const DIRECTIONS_API_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const GEOCODE_API_URL = 'https://api.openrouteservice.org/geocode/search';


/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param coords1 - The first coordinate object { lat, lng }.
 * @param coords2 - The second coordinate object { lat, lng }.
 * @returns The distance in kilometers.
 */
export const getHaversineDistance = (
  coords1: { lat: number; lng: number },
  coords2: { lat: number; lng: number }
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (coords2.lat - coords1.lat) * (Math.PI / 180);
  const dLon = (coords2.lng - coords1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.lat * (Math.PI / 180)) *
      Math.cos(coords2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};


export const getRoute = async (
  start: { lat: number, lng: number },
  end: { lat: number, lng: number }
): Promise<RouteInfo> => {
  // Defensive checks for coordinates
  if (!start || !end || typeof start.lat !== 'number' || typeof start.lng !== 'number' || typeof end.lat !== 'number' || typeof end.lng !== 'number') {
      const errorMsg = "إحداثيات بداية أو نهاية غير صالحة.";
      console.error("getRoute validation failed: Invalid coordinates provided.", { start, end });
      return Promise.reject(new Error(errorMsg));
  }
  // Prevent calls with (0,0) which is a common cause for large distance errors
  if ((start.lat === 0 && start.lng === 0) || (end.lat === 0 && end.lng === 0)) {
    const errorMsg = "تم اكتشاف إحداثيات غير صالحة (0,0). تم إيقاف حساب المسار.";
    console.error("getRoute aborted due to (0,0) coordinate:", { start, end });
    return Promise.reject(new Error(errorMsg));
  }
  
  // Pre-flight distance check to prevent pointless API calls that will surely fail.
  const haversineDistance = getHaversineDistance(start, end);

  // Pre-flight check for extremely close points to prevent API errors.
  const VERY_CLOSE_DISTANCE_KM = 0.05; // 50 meters
  if (haversineDistance < VERY_CLOSE_DISTANCE_KM) {
    console.warn(`Route calculation aborted pre-flight: points are too close (${haversineDistance.toFixed(4)}km). Returning zero-length route.`);
    return {
      distance: 0,
      duration: 0,
      polyline: [[start.lat, start.lng], [end.lat, end.lng]],
    };
  }

  const MAX_REASONABLE_DISTANCE_KM = 1500; // A safe buffer for a country-wide app.
  if (haversineDistance > MAX_REASONABLE_DISTANCE_KM) {
    const errorMsg = `المسافة بين النقطتين (${Math.round(haversineDistance)} كم) كبيرة جداً. يرجى التحقق من المواقع المحددة.`;
    console.error(`Route calculation aborted pre-flight due to excessive distance: ${haversineDistance.toFixed(2)}km`, { start, end });
    return Promise.reject(new Error(errorMsg));
  }

  const coordinates = [[start.lng, start.lat], [end.lng, end.lat]];

  try {
    const response = await fetch(DIRECTIONS_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ coordinates }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => response.text());
      console.error(`OpenRouteService API Error: Status ${response.status}`, JSON.stringify(errorBody, null, 2));
      
      if (response.status === 403) {
          throw new Error("مفتاح API غير صالح أو انتهت صلاحيته. يرجى مراجعة صفحة الإدارة لتحديثه.");
      }
      
      let errorMessage = "تعذر العثور على مسار. قد تكون المشكلة من خدمة الخرائط.";
      if (typeof errorBody === 'object' && errorBody?.error?.message) {
          if (errorBody.error.message.includes('approximated route distance must not be greater')) {
            errorMessage = "المسافة بين النقطتين كبيرة جداً ولا يمكن حساب مسار لها.";
          } else {
            errorMessage = errorBody.error.message;
          }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Step 1: Check for explicit error object in the response body.
    if (data.error) {
        console.error("OpenRouteService API returned an error in the response body:", data.error);
        let userMessage = `خطأ من خدمة الخرائط: ${data.error.message || 'فشل غير معروف'}`;
        
        if (data.error.code === 2010 || data.error.message?.toLowerCase().includes('could not find point')) {
            userMessage = "تعذر العثور على إحدى النقاط على شبكة الطرق. يرجى محاولة تحديد موقع أقرب إلى الطريق.";
        } else if (data.error.code === 2004) {
             userMessage = "تعذر العثور على مسار بين النقطتين. قد تكونان بعيدتان جدًا أو لا يوجد طريق يربطهما.";
        }

        throw new Error(userMessage);
    }

    // Step 2: Extract the main route feature from the GeoJSON FeatureCollection.
    const routeFeature = data?.features?.[0];

    // Create a consistent 'route' object for validation, mimicking the old structure.
    const route = routeFeature ? {
        summary: routeFeature.properties?.summary,
        geometry: routeFeature.geometry,
    } : undefined;


    // Step 3: Check if no route was found.
    if (!route) {
        if (data.warnings && data.warnings.length > 0) {
            const warningMessage = data.warnings.map((w: any) => w.message).join(', ');
            console.warn("ORS returned warnings but no route:", warningMessage);
            throw new Error(`تعذر العثور على مسار. ملاحظة من خدمة الخرائط: ${warningMessage}`);
        }
        
        console.error("No route feature found in ORS GeoJSON response:", data);
        throw new Error("تعذر إنشاء مسار صالح بين النقطتين. قد تكون إحدى النقاط غير قابلة للوصول أو خارج منطقة الخدمة.");
    }
    
    // Step 4: Validate the route's geometry, which is essential for display.
    const geometry = route.geometry;
    
    if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) {
        console.error("Invalid or incomplete geometry object in ORS route:", route);
        throw new Error("تم استلام بيانات مسار غير مكتملة من خدمة الخرائط.");
    }

    // Explicitly handle non-LineString geometries which can occur for unroutable points.
    if (geometry.type !== 'LineString') {
        console.error(`Received unexpected geometry type: '${geometry.type}'. Full route object:`, route);
        throw new Error(`تعذر إنشاء المسار. النوع الهندسي المستلم '${geometry.type}' غير مدعوم.`);
    }

    const rawCoords = geometry.coordinates;

    const polyline: [number, number][] = rawCoords
      .filter((coord: any) => Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number')
      .map((coord: [number, number]) => [coord[1], coord[0]]);

    if (polyline.length < 2) {
      if (haversineDistance < VERY_CLOSE_DISTANCE_KM) {
        console.warn(`Polyline has < 2 points, but Haversine distance is very small (${haversineDistance.toFixed(4)}km). Treating as a zero-length route.`);
        return {
          distance: 0,
          duration: 0,
          polyline: [[start.lat, start.lng], [end.lat, end.lng]],
        };
      }
      console.error("Could not form a valid polyline from LineString geometry (less than 2 valid points). This can happen for unroutable points.", { original: rawCoords, filtered: polyline });
      throw new Error("لا يمكن إنشاء خط مسار صالح من البيانات المستلمة. قد تكون نقاط المسار غير صالحة.");
    }

    // Step 5: Validate the summary object for distance and duration.
    const summary = route.summary;
    if (
        !summary || 
        typeof summary.distance !== 'number' ||
        typeof summary.duration !== 'number'
    ) {
        console.error("Invalid or missing summary in ORS route object:", route);
        throw new Error("تم استلام بيانات مسافة وزمن غير صالحة من خدمة الخرائط.");
    }
    
    // Step 6: If all checks pass, format and return the data.
    return {
      distance: parseFloat((summary.distance / 1000).toFixed(2)), // meters to km
      duration: parseFloat((summary.duration / 60).toFixed(2)), // seconds to minutes
      polyline: polyline,
    };

  } catch (error) {
    console.error("A critical error occurred in getRoute:", error);
    if (error instanceof Error) {
        // Re-throw the specific error to be handled by the UI
        throw error;
    }
    // Generic fallback for network issues etc.
    throw new Error("حدث خطأ في الشبكة أثناء محاولة حساب المسار. يرجى التحقق من اتصالك بالإنترنت.");
  }
};

export const searchLocations = async (query: string, focusPoint?: { lat: number, lng: number }): Promise<LocationSuggestion[]> => {
    if (!query || query.length < 3) return [];
    
    const params = new URLSearchParams({
        text: query,
    });

    if (focusPoint) {
        params.append('focus.point.lon', focusPoint.lng.toString());
        params.append('focus.point.lat', focusPoint.lat.toString());
    }
    
    const url = `${GEOCODE_API_URL}?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Authorization': apiKey,
            }
        });
        if (!response.ok) {
            console.error('Error from OpenRouteService Geocode:', await response.text());
            throw new Error('Failed to fetch locations');
        }
        const data = await response.json();
        
        if (data && data.features && Array.isArray(data.features)) {
            return data.features.map((feature: any) => ({
                name: feature.properties.label,
                coordinates: {
                    lat: feature.geometry.coordinates[1],
                    lng: feature.geometry.coordinates[0],
                },
            }));
        }
        
        return [];
    } catch (error) {
        console.error("Error searching locations:", error);
        return [];
    }
};