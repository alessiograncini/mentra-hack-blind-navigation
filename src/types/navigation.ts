/**
 * Navigation App Type Definitions
 * Defines all interfaces and types used throughout the GPS navigation app
 */

export interface Coordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: Date;
}

export interface RoutePoint extends Coordinates {
  address?: string;
  name?: string;
  type?: 'start' | 'waypoint' | 'destination';
}

export interface NavigationRoute {
  id: string;
  startLocation: RoutePoint;
  endLocation: RoutePoint;
  waypoints: RoutePoint[];
  overview_polyline: string;
  distance: {
    text: string;
    value: number; // in meters
  };
  duration: {
    text: string;
    value: number; // in seconds
  };
  legs: RouteLeg[];
  warnings: string[];
  bounds?: {
    northeast: Coordinates;
    southwest: Coordinates;
  };
}

export interface RouteLeg {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  startLocation: Coordinates;
  endLocation: Coordinates;
  startAddress: string;
  endAddress: string;
  steps: RouteStep[];
}

export interface RouteStep {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  startLocation: Coordinates;
  endLocation: Coordinates;
  instructions: string;
  maneuver?: string;
  polyline: {
    points: string;
  };
  travel_mode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
  // Enhanced Mapbox fields for better navigation
  voice_instructions?: any[];
  banner_instructions?: any[];
  modifier?: string;
  street_name?: string;
  reference?: string;
  destinations?: string;
  exits?: string;
}

export interface NavigationInstruction {
  id: string;
  distance: number; // meters to next turn
  instruction: string;
  maneuver?: string;
  streetName?: string;
  exitNumber?: string;
  modifier?: string; // Mapbox modifier (left, right, straight, etc.)
  direction?: 'left' | 'right' | 'straight' | 'u-turn' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right';
  isDestination?: boolean;
}

export interface NavigationState {
  isNavigating: boolean;
  sessionLocked: boolean; // Prevents new navigation until "restart session"
  currentRoute?: NavigationRoute;
  currentLocation?: Coordinates;
  currentSpeed?: number; // km/h or mph based on user preference
  currentInstruction?: NavigationInstruction;
  nextInstruction?: NavigationInstruction;
  distanceToDestination?: number; // in meters
  timeToDestination?: number; // in seconds
  distanceToNextTurn?: number; // in meters
  speedLimit?: number;
  isOffRoute?: boolean;
  routeProgress?: number; // percentage 0-100
  currentStepIndex?: number; // Current step in the route (1/16, 2/16, etc.)
  totalSteps?: number; // Total number of steps in the route
}

export interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: Coordinates;
  };
  types: string[];
  rating?: number;
  opening_hours?: {
    open_now: boolean;
  };
  distance?: number; // from current location in meters
}

export interface TrafficReport {
  id: string;
  location: Coordinates;
  type: 'accident' | 'construction' | 'road_closure' | 'traffic_jam' | 'hazard';
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  timestamp: Date;
  reportedBy?: string;
}

export interface VoiceCommand {
  command: string;
  parameters?: Record<string, any>;
  confidence: number;
  timestamp: Date;
}

export interface NavigationSettings {
  route_type: 'fastest' | 'shortest' | 'avoid_highways' | 'avoid_tolls';
  transportation_mode: 'driving' | 'walking' | 'cycling' | 'transit';
  voice_guidance: boolean;
  voice_language: string;
  announcement_frequency: number; // 1-5 scale
  distance_units: 'metric' | 'imperial';
  show_speed: boolean;
  show_eta: boolean;
  show_distance_remaining: boolean;
  location_accuracy: 'high' | 'balanced' | 'low_power';
  save_frequent_destinations: boolean;
  speed_limit_warnings: boolean;
  traffic_alerts: boolean;
  hands_free_mode: boolean;
}

export type TransportationMode = 'driving' | 'walking' | 'cycling' | 'transit';
export type RouteType = 'fastest' | 'shortest' | 'avoid_highways' | 'avoid_tolls';
export type DistanceUnits = 'metric' | 'imperial';
export type LocationAccuracy = 'high' | 'balanced' | 'low_power';

export interface GeocodeResult {
  formatted_address: string;
  geometry: {
    location: Coordinates;
    location_type: string;
  };
  place_id: string;
  types: string[];
}

export interface DirectionsRequest {
  origin: string | Coordinates;
  destination: string | Coordinates;
  waypoints?: (string | Coordinates)[];
  mode?: TransportationMode;
  avoid?: ('highways' | 'tolls' | 'ferries')[];
  units?: DistanceUnits;
  language?: string;
}

export interface NavigationUpdate {
  location: Coordinates;
  speed?: number;
  heading?: number;
  timestamp: Date;
}

export interface Waypoint {
  id: string;
  location: RoutePoint;
  visited: boolean;
  estimatedArrival?: Date;
}

export interface NavigationStats {
  totalDistance: number;
  totalTime: number;
  averageSpeed: number;
  fuelUsed?: number;
  co2Emissions?: number;
  routeEfficiency: number; // percentage
}

export type NavigationEventType = 
  | 'navigation_started'
  | 'navigation_paused' 
  | 'navigation_resumed'
  | 'navigation_completed'
  | 'navigation_cancelled'
  | 'session_restarted'
  | 'route_recalculated'
  | 'off_route_detected'
  | 'waypoint_reached'
  | 'destination_reached'
  | 'speed_limit_exceeded'
  | 'traffic_detected'
  | 'instruction_updated';

export interface NavigationEvent {
  type: NavigationEventType;
  timestamp: Date;
  data?: any;
} 