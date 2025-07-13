/**
 * Mapping Service
 * Handles route calculation, geocoding, place search, and traffic data
 * Uses OpenRouteService as the primary mapping provider (free alternative to Google Maps)
 */

import axios from 'axios';
import {
  Coordinates,
  NavigationRoute,
  DirectionsRequest,
  PlaceSearchResult,
  GeocodeResult,
  TransportationMode,
  RouteType,
  RouteStep,
  NavigationInstruction
} from '../types/navigation.js';
import { calculateDistance } from '../utils/distance.js';
import { cleanInstruction, extractManeuver, extractStreetName } from '../utils/instructions.js';

// OpenRouteService API (free alternative to Google Maps)
const ORS_API_BASE = 'https://api.openrouteservice.org';
const NOMINATIM_API_BASE = 'https://nominatim.openstreetmap.org';

// Backup services
const MAPBOX_API_BASE = 'https://api.mapbox.com';

export class MappingService {
  private orsApiKey: string | undefined;
  private mapboxApiKey: string | undefined;
  private httpClient: any;
  private geocodeCache = new Map<string, GeocodeResult[]>();
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests to be more conservative

  constructor() {
    // API keys would typically come from environment variables
    this.orsApiKey = process.env.OPENROUTESERVICE_API_KEY;
    this.mapboxApiKey = process.env.MAPBOX_API_KEY;
    
    // Configure axios with proper headers for Nominatim
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'MentraOS-Navigation-App/1.0 (contact@mentra.glass)', // Required by Nominatim
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://mentra.glass' // Additional identification
      }
    });
  }

  /**
   * Calculate a route between origin and destination
   */
  async calculateRoute(request: DirectionsRequest): Promise<NavigationRoute | null> {
    try {
      console.log('🗺️ Calculating route from', request.origin, 'to', request.destination);
      
      // Try Mapbox first (best for navigation)
      if (this.mapboxApiKey) {
        try {
          console.log('🔄 Trying Mapbox Directions API...');
          return await this.calculateRouteMapbox(request);
        } catch (mapboxError) {
          console.warn('⚠️ Mapbox failed, trying OpenRouteService:', mapboxError);
        }
      }
      
      // Fallback to OpenRouteService
      if (this.orsApiKey) {
        try {
          console.log('🔄 Trying OpenRouteService...');
          return await this.calculateRouteORS(request);
        } catch (orsError) {
          console.warn('⚠️ OpenRouteService failed, using demo route:', orsError);
        }
      }

      // Always provide a demo route as final fallback
      console.log('📍 Using demo route as fallback');
      return this.generateDemoRoute(request);
    } catch (error) {
      console.error('❌ Error calculating route, using demo route:', error);
      // Always return a demo route rather than null
      return this.generateDemoRoute(request);
    }
  }

  /**
   * Calculate route using OpenRouteService
   */
  private async calculateRouteORS(request: DirectionsRequest): Promise<NavigationRoute | null> {
    const origin = await this.normalizeCoordinates(request.origin);
    const destination = await this.normalizeCoordinates(request.destination);

    if (!origin || !destination) {
      throw new Error('Invalid origin or destination');
    }

    const profile = this.getORSProfile(request.mode || 'driving');
    const coordinates = [
      [origin.lng, origin.lat],
      ...(request.waypoints || []).map(wp => {
        const coord = typeof wp === 'string' ? this.parseCoordinateString(wp) : wp;
        return coord ? [coord.lng, coord.lat] : null;
      }).filter(Boolean),
      [destination.lng, destination.lat]
    ];

    const response = await axios.post(
      `${ORS_API_BASE}/v2/directions/${profile}`,
      {
        coordinates,
        instructions: true,
        maneuvers: true,
        units: 'm',
        language: 'en'
      },
      {
        headers: {
          'Authorization': this.orsApiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    const route = response.data.routes[0];
    if (!route) {
      throw new Error('No route found');
    }

    return this.processORSRoute(route, origin, destination);
  }

  /**
   * Calculate route using Mapbox Directions API
   */
  private async calculateRouteMapbox(request: DirectionsRequest): Promise<NavigationRoute | null> {
    const origin = await this.normalizeCoordinates(request.origin);
    const destination = await this.normalizeCoordinates(request.destination);

    if (!origin || !destination) {
      throw new Error('Invalid origin or destination');
    }

    const profile = this.getMapboxProfile(request.mode || 'driving');
    let coordinates = `${origin.lng},${origin.lat}`;
    
    // Add waypoints if provided
    if (request.waypoints && request.waypoints.length > 0) {
      for (const waypoint of request.waypoints) {
        const waypointCoords = await this.normalizeCoordinates(waypoint);
        if (waypointCoords) {
          coordinates += `;${waypointCoords.lng},${waypointCoords.lat}`;
        }
      }
    }
    
    coordinates += `;${destination.lng},${destination.lat}`;

    // Build comprehensive request parameters following Mapbox docs
    const params: any = {
      access_token: this.mapboxApiKey,
      steps: true, // Get turn-by-turn instructions
      voice_instructions: true, // Get voice guidance
      banner_instructions: true, // Get visual guidance
      geometries: 'geojson',
      overview: 'full',
      language: request.language || 'en',
      voice_units: request.units === 'imperial' ? 'imperial' : 'metric'
    };

    // Add avoidance preferences
    if (request.avoid && request.avoid.length > 0) {
      const excludeMap: Record<string, string> = {
        'highways': 'motorway',
        'tolls': 'toll',
        'ferries': 'ferry'
      };
      const excludeValues = request.avoid.map(avoid => excludeMap[avoid]).filter(Boolean);
      if (excludeValues.length > 0) {
        params.exclude = excludeValues.join(',');
      }
    }

    console.log('🗺️ Making Mapbox Directions API request:', {
      profile,
      coordinates,
      params: { ...params, access_token: '[HIDDEN]' }
    });

    const response = await axios.get(
      `${MAPBOX_API_BASE}/directions/v5/mapbox/${profile}/${coordinates}`,
      { params }
    );

    const route = response.data.routes[0];
    if (!route) {
      throw new Error('No route found');
    }

    console.log('✅ Mapbox route calculated successfully:', {
      distance: route.distance,
      duration: route.duration,
      legs: route.legs?.length || 0,
      steps: route.legs.reduce((total: number, leg: any) => total + (leg.steps?.length || 0), 0)
    });

    // Debug: Log first few steps to see what we're getting
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      console.log('🔍 First 3 Mapbox steps:');
      route.legs[0].steps.slice(0, 3).forEach((step: any, i: number) => {
        console.log(`  Step ${i + 1}:`, {
          instruction: step.maneuver?.instruction,
          name: step.name,
          distance: step.distance,
          duration: step.duration
        });
      });
    }

    return this.processMapboxRoute(route, origin, destination);
  }

  /**
   * Process Mapbox route response
   */
  private processMapboxRoute(route: any, origin: Coordinates, destination: Coordinates): NavigationRoute {
    const routeId = `route_${Date.now()}`;
    
    return {
      id: routeId,
      startLocation: {
        ...origin,
        type: 'start'
      },
      endLocation: {
        ...destination,
        type: 'destination'
      },
      waypoints: [],
      overview_polyline: route.geometry,
      distance: {
        text: `${(route.distance / 1000).toFixed(1)} km`,
        value: route.distance
      },
      duration: {
        text: this.formatDuration(route.duration),
        value: route.duration
      },
      legs: route.legs?.map((leg: any) => this.processMapboxLeg(leg)) || [],
      warnings: route.warnings || []
    };
  }

  /**
   * Process Mapbox route leg
   */
  private processMapboxLeg(leg: any): any {
    return {
      distance: {
        text: `${(leg.distance / 1000).toFixed(1)} km`,
        value: leg.distance
      },
      duration: {
        text: this.formatDuration(leg.duration),
        value: leg.duration
      },
      startLocation: { lat: 0, lng: 0 }, // Would be extracted from geometry
      endLocation: { lat: 0, lng: 0 },
      startAddress: '',
      endAddress: '',
      steps: leg.steps?.map((step: any) => this.processMapboxStep(step)) || []
    };
  }

  /**
   * Process Mapbox step into RouteStep with detailed instructions
   */
  private processMapboxStep(step: any): RouteStep {
    const instruction = cleanInstruction(step.maneuver?.instruction || '');
    
    // Extract coordinates from geometry if available
    const startLocation = step.geometry?.coordinates?.[0] 
      ? { lat: step.geometry.coordinates[0][1], lng: step.geometry.coordinates[0][0] }
      : { lat: 0, lng: 0 };
    
    const endLocation = step.geometry?.coordinates?.length > 1
      ? { 
          lat: step.geometry.coordinates[step.geometry.coordinates.length - 1][1], 
          lng: step.geometry.coordinates[step.geometry.coordinates.length - 1][0] 
        }
      : startLocation;

    return {
      distance: {
        text: step.distance > 1000 
          ? `${(step.distance / 1000).toFixed(1)} km`
          : `${Math.round(step.distance)} m`,
        value: step.distance
      },
      duration: {
        text: this.formatDuration(step.duration),
        value: step.duration
      },
      startLocation,
      endLocation,
      instructions: instruction,
      maneuver: step.maneuver?.type || 'continue',
      polyline: {
        points: JSON.stringify(step.geometry) || ''
      },
      travel_mode: 'DRIVING',
      // Store additional Mapbox data for enhanced navigation
      voice_instructions: step.voiceInstructions || [],
      banner_instructions: step.bannerInstructions || [],
      modifier: step.maneuver?.modifier,
      street_name: step.name,
      reference: step.ref,
      destinations: step.destinations,
      exits: step.exits
    };
  }

  /**
   * Process OpenRouteService route response
   */
  private processORSRoute(route: any, origin: Coordinates, destination: Coordinates): NavigationRoute {
    const routeId = `route_${Date.now()}`;
    
    return {
      id: routeId,
      startLocation: {
        ...origin,
        type: 'start'
      },
      endLocation: {
        ...destination,
        type: 'destination'
      },
      waypoints: [],
      overview_polyline: route.geometry,
      distance: {
        text: `${(route.summary.distance / 1000).toFixed(1)} km`,
        value: route.summary.distance
      },
      duration: {
        text: this.formatDuration(route.summary.duration),
        value: route.summary.duration
      },
      legs: route.segments?.map((segment: any) => this.processORSSegment(segment)) || [],
      warnings: route.warnings || []
    };
  }

  /**
   * Process OpenRouteService route segment
   */
  private processORSSegment(segment: any): any {
    return {
      distance: {
        text: `${(segment.distance / 1000).toFixed(1)} km`,
        value: segment.distance
      },
      duration: {
        text: this.formatDuration(segment.duration),
        value: segment.duration
      },
      startLocation: { lat: 0, lng: 0 }, // Would be extracted from geometry
      endLocation: { lat: 0, lng: 0 },
      startAddress: '',
      endAddress: '',
      steps: segment.steps?.map((step: any) => this.processORSStep(step)) || []
    };
  }

  /**
   * Process OpenRouteService step into RouteStep
   */
  private processORSStep(step: any): RouteStep {
    const instruction = cleanInstruction(step.instruction);
    
    return {
      distance: {
        text: `${step.distance} m`,
        value: step.distance
      },
      duration: {
        text: this.formatDuration(step.duration),
        value: step.duration
      },
      startLocation: { lat: 0, lng: 0 }, // Would be extracted from way_points
      endLocation: { lat: 0, lng: 0 },
      instructions: instruction,
      maneuver: this.mapORSManeuver(step.type),
      polyline: {
        points: '' // Would be extracted from geometry
      },
      travel_mode: 'DRIVING'
    };
  }

  /**
   * Search for places near a location
   */
  async searchPlaces(
    query: string,
    location?: Coordinates,
    radius?: number
  ): Promise<PlaceSearchResult[]> {
    try {
      console.log('🔍 Searching for places:', query);
      // Use Nominatim (OpenStreetMap) for free place search
      const params: any = {
        q: query,
        format: 'json',
        limit: 10,
        addressdetails: 1,
        extratags: 1
      };

      if (location) {
        params.lat = location.lat;
        params.lon = location.lng;
        params.bounded = 1;
        params.viewbox = this.createViewbox(location, radius || 5000);
      }

      const response = await this.makeRateLimitedRequest(`${NOMINATIM_API_BASE}/search`, params);
      const places = response.data.map((place: any) => this.processNominatimPlace(place, location));
      console.log('✅ Found', places.length, 'places for query:', query);
      return places;
    } catch (error) {
      console.error('❌ Error searching places:', error);
      return [];
    }
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string): Promise<GeocodeResult[]> {
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (this.geocodeCache.has(cacheKey)) {
      console.log('🎯 Using cached geocode result for:', address);
      return this.geocodeCache.get(cacheKey)!;
    }

    try {
      console.log('🔍 Geocoding address:', address);
      const response = await this.makeRateLimitedRequest(`${NOMINATIM_API_BASE}/search`, {
        q: address,
        format: 'json',
        limit: 5,
        addressdetails: 1
      });

      const results = response.data.map((result: any) => ({
        formatted_address: result.display_name,
        geometry: {
          location: {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon)
          },
          location_type: result.type
        },
        place_id: result.place_id,
        types: result.type ? [result.type] : []
      }));

      // Cache the results
      this.geocodeCache.set(cacheKey, results);
      console.log('✅ Geocoded successfully:', results.length, 'results');
      return results;
    } catch (error) {
      console.error('❌ Error geocoding address:', error);
      return [];
    }
  }

  /**
   * Reverse geocode coordinates to an address
   */
  async reverseGeocode(coordinates: Coordinates): Promise<string | null> {
    try {
      console.log('🔄 Reverse geocoding coordinates:', coordinates);
      const response = await this.makeRateLimitedRequest(`${NOMINATIM_API_BASE}/reverse`, {
        lat: coordinates.lat,
        lon: coordinates.lng,
        format: 'json',
        addressdetails: 1
      });

      const address = response.data.display_name || null;
      console.log('✅ Reverse geocoded to:', address);
      return address;
    } catch (error) {
      console.error('❌ Error reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Generate enhanced navigation instructions from route steps with Mapbox data
   */
  generateInstructions(route: NavigationRoute): NavigationInstruction[] {
    const instructions: NavigationInstruction[] = [];
    let instructionId = 0;

    for (const leg of route.legs) {
      for (const step of leg.steps) {
        // Use enhanced Mapbox data if available
        const streetName = step.street_name || extractStreetName(step.instructions);
        const modifier = step.modifier;
        
        // Create enhanced instruction text
        let enhancedInstruction = step.instructions;
        
        console.log(`🔧 Processing step instruction: "${step.instructions}"`);
        console.log(`🔧 Street name: "${streetName}"`);
        
        // Only add street name if it's not already in the instruction
        if (streetName && !enhancedInstruction.toLowerCase().includes(streetName.toLowerCase())) {
          enhancedInstruction = `${step.instructions} on ${streetName}`;
        }
        
        // Add exit or reference information if available
        if (step.exits) {
          enhancedInstruction += ` (Exit ${step.exits})`;
        } else if (step.reference) {
          enhancedInstruction += ` (${step.reference})`;
        }
        
        // Add destinations if available for highways
        if (step.destinations) {
          enhancedInstruction += ` toward ${step.destinations}`;
        }

        const instruction: NavigationInstruction = {
          id: `instruction_${instructionId++}`,
          distance: step.distance.value,
          instruction: enhancedInstruction,
          maneuver: step.maneuver || extractManeuver(step.instructions),
          streetName: streetName,
          modifier: modifier,
          exitNumber: step.exits,
          direction: this.mapModifierToDirection(modifier)
        };

        instructions.push(instruction);
      }
    }

    // Add final destination instruction
    instructions.push({
      id: `instruction_${instructionId}`,
      distance: 0,
      instruction: 'You have arrived at your destination',
      isDestination: true
    });

    console.log(`✅ Generated ${instructions.length} enhanced navigation instructions`);
    
    // Debug: Log first few instructions
    console.log('🔍 First 3 generated instructions:');
    instructions.slice(0, 3).forEach((inst, i) => {
      console.log(`  Instruction ${i + 1}:`, {
        id: inst.id,
        instruction: inst.instruction,
        distance: inst.distance,
        streetName: inst.streetName,
        maneuver: inst.maneuver
      });
    });
    
    return instructions;
  }

  /**
   * Map Mapbox modifier to our direction enum
   */
  private mapModifierToDirection(modifier?: string): 'left' | 'right' | 'straight' | 'u-turn' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | undefined {
    if (!modifier) return undefined;
    
    switch (modifier) {
      case 'left': return 'left';
      case 'right': return 'right';
      case 'straight': return 'straight';
      case 'uturn': return 'u-turn';
      case 'slight left': return 'slight-left';
      case 'slight right': return 'slight-right';
      case 'sharp left': return 'sharp-left';
      case 'sharp right': return 'sharp-right';
      default: return undefined;
    }
  }

  /**
   * Helper methods
   */
  private async normalizeCoordinates(location: string | Coordinates): Promise<Coordinates | null> {
    if (typeof location === 'object') {
      return location;
    }

    // Try to parse as coordinates first (e.g., "37.7749,-122.4194")
    const coords = this.parseCoordinateString(location);
    if (coords) {
      console.log('📍 Parsed coordinates from string:', coords);
      return coords;
    }

    // Otherwise geocode the address
    console.log('🔍 Need to geocode address:', location);
    const results = await this.geocode(location);
    
    if (results.length > 0) {
      console.log('✅ Successfully normalized coordinates for:', location);
      return results[0].geometry.location;
    } else {
      console.warn('⚠️ Could not normalize coordinates for:', location);
      return null;
    }
  }

  private parseCoordinateString(coordString: string): Coordinates | null {
    const parts = coordString.split(',');
    if (parts.length !== 2) return null;

    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());

    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  }

  private getORSProfile(mode: TransportationMode): string {
    switch (mode) {
      case 'walking': return 'foot-walking';
      case 'cycling': return 'cycling-regular';
      case 'driving': return 'driving-car';
      default: return 'driving-car';
    }
  }

  private getMapboxProfile(mode: TransportationMode): string {
    switch (mode) {
      case 'walking': return 'walking';
      case 'cycling': return 'cycling';
      case 'driving': return 'driving';
      default: return 'driving';
    }
  }

  private mapORSManeuver(orsType: number): string {
    // Map ORS maneuver types to our standard types
    const maneuverMap: Record<number, string> = {
      0: 'continue',
      1: 'turn-right',
      2: 'turn-left',
      3: 'turn-sharp-right',
      4: 'turn-sharp-left',
      5: 'turn-slight-right',
      6: 'turn-slight-left',
      7: 'continue',
      8: 'uturn-left',
      9: 'arrive',
      10: 'arrive-left',
      11: 'arrive-right'
    };

    return maneuverMap[orsType] || 'continue';
  }

  private processNominatimPlace(place: any, userLocation?: Coordinates): PlaceSearchResult {
    const location = {
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon)
    };

    const result: PlaceSearchResult = {
      place_id: place.place_id,
      name: place.display_name.split(',')[0],
      formatted_address: place.display_name,
      geometry: { location },
      types: place.type ? [place.type] : []
    };

    if (userLocation) {
      result.distance = calculateDistance(userLocation, location);
    }

    return result;
  }

  private createViewbox(center: Coordinates, radiusMeters: number): string {
    // Rough conversion of meters to degrees (varies by latitude)
    const degreeRadius = radiusMeters / 111320;
    
    const minLng = center.lng - degreeRadius;
    const maxLng = center.lng + degreeRadius;
    const minLat = center.lat - degreeRadius;
    const maxLat = center.lat + degreeRadius;

    return `${minLng},${maxLat},${maxLng},${minLat}`;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Generate a demo route for testing when no API keys are available
   */
  private generateDemoRoute(request: DirectionsRequest): NavigationRoute {
    console.log('🎭 Generating demo route');
    
    // Use provided coordinates or fallback to San Francisco area
    const origin = typeof request.origin === 'object' 
      ? request.origin 
      : { lat: 37.7749, lng: -122.4194 }; // San Francisco
    
    let destination: Coordinates;
    let destinationName = 'Demo Destination';
    
    if (typeof request.destination === 'object') {
      destination = request.destination;
    } else if (typeof request.destination === 'string') {
      // Try to create a plausible destination based on the string
      destinationName = request.destination;
      // Generate a destination ~1-2km away from origin
      const offsetLat = (Math.random() - 0.5) * 0.02; // ~2km range
      const offsetLng = (Math.random() - 0.5) * 0.02;
      destination = {
        lat: origin.lat + offsetLat,
        lng: origin.lng + offsetLng
      };
    } else {
      destination = { lat: 37.7849, lng: -122.4094 }; // 1km northeast of SF
    }

    const distance = calculateDistance(origin, destination);
    const durationSeconds = Math.max(300, distance / 1000 * 180); // minimum 5 minutes
    const durationText = this.formatDuration(durationSeconds);

    return {
      id: `demo_route_${Date.now()}`,
      startLocation: { ...origin, type: 'start' },
      endLocation: { ...destination, type: 'destination' },
      waypoints: [],
      overview_polyline: 'demo_polyline',
      distance: {
        text: `${(distance / 1000).toFixed(1)} km`,
        value: distance
      },
      duration: {
        text: durationText,
        value: durationSeconds
      },
      legs: [{
        distance: {
          text: `${(distance / 1000).toFixed(1)} km`,
          value: distance
        },
        duration: {
          text: durationText,
          value: durationSeconds
        },
        startLocation: origin,
        endLocation: destination,
        startAddress: 'Current Location',
        endAddress: destinationName,
        steps: [
          {
            distance: { text: `${Math.round(distance * 0.3)} m`, value: distance * 0.3 },
            duration: { text: this.formatDuration(durationSeconds * 0.3), value: durationSeconds * 0.3 },
            startLocation: origin,
            endLocation: { lat: origin.lat + (destination.lat - origin.lat) * 0.3, lng: origin.lng + (destination.lng - origin.lng) * 0.3 },
            instructions: `Head northeast on Main Street toward ${destinationName}`,
            maneuver: 'depart',
            polyline: { points: 'demo_polyline_1' },
            travel_mode: 'DRIVING' as const,
            street_name: 'Main Street'
          },
          {
            distance: { text: `${Math.round(distance * 0.4)} m`, value: distance * 0.4 },
            duration: { text: this.formatDuration(durationSeconds * 0.4), value: durationSeconds * 0.4 },
            startLocation: { lat: origin.lat + (destination.lat - origin.lat) * 0.3, lng: origin.lng + (destination.lng - origin.lng) * 0.3 },
            endLocation: { lat: origin.lat + (destination.lat - origin.lat) * 0.7, lng: origin.lng + (destination.lng - origin.lng) * 0.7 },
            instructions: `Turn right onto Oak Avenue`,
            maneuver: 'turn',
            modifier: 'right',
            polyline: { points: 'demo_polyline_2' },
            travel_mode: 'DRIVING' as const,
            street_name: 'Oak Avenue'
          },
          {
            distance: { text: `${Math.round(distance * 0.3)} m`, value: distance * 0.3 },
            duration: { text: this.formatDuration(durationSeconds * 0.3), value: durationSeconds * 0.3 },
            startLocation: { lat: origin.lat + (destination.lat - origin.lat) * 0.7, lng: origin.lng + (destination.lng - origin.lng) * 0.7 },
            endLocation: destination,
            instructions: `Continue straight to arrive at ${destinationName}`,
            maneuver: 'arrive',
            polyline: { points: 'demo_polyline_3' },
            travel_mode: 'DRIVING' as const,
            street_name: 'Oak Avenue'
          }
        ]
      }],
      warnings: [
        'Demo route - External mapping services are currently unavailable',
        'This provides basic navigation functionality for testing'
      ]
    };
  }

  // Add rate limiting method
  private async makeRateLimitedRequest(url: string, params: any): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    return this.httpClient.get(url, { params });
  }
} 