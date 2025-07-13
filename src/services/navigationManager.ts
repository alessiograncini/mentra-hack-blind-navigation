/**
 * Navigation Manager
 * Core service that manages navigation state, route tracking, and turn-by-turn guidance
 */

import { AppSession } from '@mentra/sdk';
import {
  NavigationState,
  NavigationRoute,
  NavigationInstruction,
  Coordinates,
  NavigationSettings,
  NavigationEvent,
  NavigationEventType,
  NavigationUpdate,
  Waypoint
} from '../types/navigation.js';
import { MappingService } from './mappingService.js';
import { StreetViewService } from './streetViewService.js';
import { GeminiService, type StoreSignDetection } from './geminiService.js';
import { calculateDistance, isWithinRadius, formatDistance, formatDuration, calculateBearing, getDirectionalArrow } from '../utils/distance.js';
import { 
  formatDisplayInstruction, 
  generateVoiceAnnouncement, 
  generateProgressAnnouncement 
} from '../utils/instructions.js';

// Import LocationUpdate from MentraOS SDK
import { LocationUpdate } from '@mentra/sdk';

export class NavigationManager {
  private session: AppSession;
  private mappingService: MappingService;
  private streetViewService: StreetViewService;
  private geminiService: GeminiService;
  private navigationState: NavigationState;
  private settings: NavigationSettings;
  private instructions: NavigationInstruction[] = [];
  private currentInstructionIndex: number = 0;
  private lastAnnouncedDistance: number = -1;
  private routeTrackingInterval?: NodeJS.Timeout;
  private displayUpdateInterval?: NodeJS.Timeout;
  private aiContextInterval?: NodeJS.Timeout;
  private offRouteCheckCount: number = 0;
  private lastLocationUpdate?: Date;
  private currentAiContext: string = 'Loading surroundings...';
  private currentStoreSignDetection: StoreSignDetection = {
    detected: false,
    confidence: 0,
    count: 0,
    details: 'Initializing store sign detection...'
  };

  // Event listeners
  private eventListeners: Map<NavigationEventType, ((event: NavigationEvent) => void)[]> = new Map();
  private locationUnsubscriber?: () => void;

  // Constants
  private static readonly ROUTE_DEVIATION_THRESHOLD = 50; // meters
  private static readonly MAX_OFF_ROUTE_CHECKS = 3;
  private static readonly LOCATION_UPDATE_INTERVAL = 1000; // 1 second - more frequent like running example
  private static readonly INSTRUCTION_DISTANCE_THRESHOLD = 30; // meters
  private static readonly DESTINATION_THRESHOLD = 30; // meters - more forgiving arrival detection

  constructor(session: AppSession, settings: NavigationSettings) {
    this.session = session;
    this.settings = settings;
    this.mappingService = new MappingService();
    this.streetViewService = new StreetViewService();
    this.geminiService = new GeminiService();
    
    this.navigationState = {
      isNavigating: false,
      sessionLocked: false,
      currentLocation: undefined,
      currentSpeed: 0,
      isOffRoute: false,
      routeProgress: 0,
      currentStepIndex: 0,
      totalSteps: 0
    };
  }

  /**
   * Start navigation to a destination
   */
  async startNavigation(destination: string | Coordinates, waypoints?: Coordinates[]): Promise<boolean> {
    try {
      // Get current location
      const currentLocation = await this.getCurrentLocation();
      if (!currentLocation) {
        this.showMessage('Unable to get current location. Please check GPS settings.');
        return false;
      }

      this.showMessage('Calculating route...');

      // Enhanced destination handling
      let destinationCoords: Coordinates;
      if (typeof destination === 'string') {
        console.log('Geocoding destination:', destination);
        
        // Try to geocode the destination
        const geocodeResults = await this.mappingService.geocode(destination);
        if (geocodeResults.length === 0) {
          this.showMessage(`Unable to find location "${destination}". Please try a more specific address.`);
          return false;
        }
        
        destinationCoords = geocodeResults[0].geometry.location;
        console.log('Geocoded to:', destinationCoords);
      } else {
        destinationCoords = destination;
      }

      // Calculate route with better error handling
      const route = await this.mappingService.calculateRoute({
        origin: currentLocation,
        destination: destinationCoords,
        waypoints,
        mode: this.settings.transportation_mode,
        avoid: this.getAvoidancePreferences(),
        units: this.settings.distance_units,
        language: this.settings.voice_language
      });

      if (!route) {
        this.showMessage('Unable to calculate route. Please try a different destination.');
        return false;
      }

      // Initialize navigation
      this.navigationState = {
        isNavigating: true,
        sessionLocked: true, // Lock session during navigation
        currentRoute: route,
        currentLocation,
        currentSpeed: 0,
        isOffRoute: false,
        routeProgress: 0,
        currentStepIndex: 1,
        totalSteps: 0 // Will be set after instructions are generated
      };

      // Start high-frequency location tracking immediately for navigation
      // This ensures we get realtime updates for arrow direction
      console.log('🔄 Starting realtime location tracking for navigation');
      this.startLocationTracking();

      this.instructions = this.mappingService.generateInstructions(route);
      this.currentInstructionIndex = 0;
      this.lastAnnouncedDistance = -1;
      this.offRouteCheckCount = 0;
      
      // Debug: Log instructions setup
      console.log(`🔧 Navigation setup: ${this.instructions.length} instructions generated`);
      console.log(`🔧 First instruction:`, {
        instruction: this.instructions[0]?.instruction,
        distance: this.instructions[0]?.distance,
        streetName: this.instructions[0]?.streetName
      });
      
      // Update navigation state with step counts
      this.navigationState.totalSteps = this.instructions.length;
      this.navigationState.currentStepIndex = 1;
      this.navigationState.currentInstruction = this.instructions[0];

      // Location tracking was already started above with navigation state change

      // Start display update interval to keep directional arrow updated
      this.startDisplayUpdateInterval();

      // Start AI context update interval to provide surroundings information
      this.startAiContextUpdateInterval();

      // Show initial navigation info
      console.log('🔧 About to show initial navigation display...');
      this.updateNavigationDisplay();
      
      // Get initial AI context
      this.updateAiContext();
      
      // Voice announcement
      if (this.settings.voice_guidance) {
        this.speakText(`Navigation started. ${route.distance.text}, estimated time ${route.duration.text}.`);
      }
      
      console.log('🔧 Navigation started successfully');

      this.emitEvent('navigation_started', { route, destination });

      return true;
    } catch (error) {
      console.error('Error starting navigation:', error);
      this.showMessage('Navigation error. Please try again.');
      return false;
    }
  }

  /**
   * Stop current navigation
   */
  stopNavigation(): void {
    if (!this.navigationState.isNavigating) {
      return;
    }

    this.navigationState.isNavigating = false;
    this.navigationState.sessionLocked = true; // Keep session locked until restart
    
    // Switch to reduced accuracy but keep location tracking for arrow updates
    console.log('🔄 Switching to reduced accuracy location tracking after navigation stop');
    this.stopLocationTracking();
    
    // Keep AI context updates running to show surroundings
    // No need to stop AI context interval - it will continue providing context
    
    // Start basic location tracking to keep arrow pointing correctly
    setTimeout(() => {
      this.startLocationTracking();
    }, 100);
    
    // Keep display update interval running to update directional arrow
    // The display will continue showing the last instruction
    this.updateNavigationDisplay();
    
    this.showMessage('Navigation stopped\n\nSay "restart session" to start a new route');
    
    if (this.settings.voice_guidance) {
      this.speakText('Navigation cancelled. Say restart session to start a new route.');
    }

    this.emitEvent('navigation_cancelled', {});
  }

  /**
   * Restart navigation session - unlocks for new navigation
   */
  restartSession(): void {
    this.navigationState.sessionLocked = false;
    this.navigationState.isNavigating = false;
    this.navigationState.currentRoute = undefined;
    this.navigationState.currentInstruction = undefined;
    this.navigationState.nextInstruction = undefined;
    this.navigationState.currentStepIndex = 0;
    this.navigationState.totalSteps = 0;
    
    // Stop display updates, AI context updates, and location tracking
    this.stopDisplayUpdateInterval();
    this.stopAiContextUpdateInterval();
    this.stopLocationTracking();
    
    console.log('🔓 Session restarted - all tracking stopped');
    
    this.showMessage('🔓 Session Restarted\n\nYou can now start a new navigation');
    
    if (this.settings.voice_guidance) {
      this.speakText('Session restarted. You can now navigate to a new destination.');
    }

    this.emitEvent('session_restarted', {});
  }

  /**
   * Check if session is locked
   */
  isSessionLocked(): boolean {
    return this.navigationState.sessionLocked;
  }

  /**
   * Add a waypoint to the current route
   */
  async addWaypoint(waypoint: string | Coordinates): Promise<boolean> {
    if (!this.navigationState.currentRoute || !this.navigationState.currentLocation) {
      return false;
    }

    try {
      // Recalculate route with new waypoint
      const currentWaypoints = this.navigationState.currentRoute.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
      currentWaypoints.push(typeof waypoint === 'string' ? await this.geocodeAddress(waypoint) : waypoint);

      const newRoute = await this.mappingService.calculateRoute({
        origin: this.navigationState.currentLocation,
        destination: this.navigationState.currentRoute.endLocation,
        waypoints: currentWaypoints,
        mode: this.settings.transportation_mode,
        avoid: this.getAvoidancePreferences(),
        units: this.settings.distance_units
      });

      if (newRoute) {
        this.navigationState.currentRoute = newRoute;
        this.instructions = this.mappingService.generateInstructions(newRoute);
        this.currentInstructionIndex = 0;
        this.updateNavigationDisplay();
        
        if (this.settings.voice_guidance) {
          this.speakText('Route updated with new waypoint');
        }

        this.emitEvent('route_recalculated', { route: newRoute });
        return true;
      }
    } catch (error) {
      console.error('Error adding waypoint:', error);
    }

    return false;
  }

  /**
   * Get current navigation status
   */
  getNavigationStatus(): string {
    if (!this.navigationState.isNavigating || !this.navigationState.currentRoute) {
      return 'Navigation is not active';
    }

    const route = this.navigationState.currentRoute;
    const remainingDistance = this.calculateRemainingDistance();
    const remainingTime = this.calculateRemainingTime();
    
    const distanceText = formatDistance(remainingDistance, this.settings.distance_units);
    const timeText = formatDuration(remainingTime, true);

    return `${distanceText} remaining, ETA ${timeText}`;
  }

  /**
   * Handle location updates from MentraOS
   */
  onLocationUpdate(update: NavigationUpdate): void {
    this.navigationState.currentLocation = update.location;
    this.navigationState.currentSpeed = update.speed;
    this.lastLocationUpdate = update.timestamp;

    console.log('📍 Location update received:', {
      lat: update.location.lat.toFixed(6),
      lng: update.location.lng.toFixed(6),
      isNavigating: this.navigationState.isNavigating,
      currentStep: this.navigationState.currentStepIndex,
      totalSteps: this.navigationState.totalSteps
    });

    if (this.navigationState.isNavigating) {
      this.processLocationUpdate(update);
    }
    
    // Update display immediately on location change (like running example)
    // This ensures arrow direction is always current
    if (this.navigationState.sessionLocked) {
      this.updateNavigationDisplay();
    }
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<NavigationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    if (this.navigationState.isNavigating) {
      this.updateNavigationDisplay();
    }
  }

  /**
   * Add event listener
   */
  on(eventType: NavigationEventType, listener: (event: NavigationEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: NavigationEventType, listener: (event: NavigationEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Set location unsubscriber function for cleanup
   */
  setLocationUnsubscriber(unsubscriber: () => void): void {
    this.locationUnsubscriber = unsubscriber;
  }

  /**
   * Private methods
   */

  private async getCurrentLocation(): Promise<Coordinates | null> {
    try {
      const accuracy = this.getLocationAccuracy();
      console.log(`🔄 Getting current location with accuracy: ${accuracy}`);
      
      // Following docs pattern - this gets a single, fresh location fix
      const location = await this.session.location.getLatestLocation({ accuracy });
      
      console.log(`✅ Current location obtained: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
      
      // Now you can use the location data - following docs pattern
      return { lat: location.lat, lng: location.lng };
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  private startLocationTracking(): void {
    const accuracy = this.getLocationAccuracy();
    
    console.log(`🔄 Starting location tracking with accuracy: ${accuracy}`);
    
    // Subscribe to location updates - following docs pattern exactly
    try {
      const stopLocationUpdates = this.session.location.subscribeToStream(
        { accuracy },
        (data) => {
          // This function is your handler - following docs pattern exactly
          console.log(`New location: ${data.lat}, ${data.lng} (accuracy: ${accuracy})`);
          
          // Your app logic here - update navigation state (like running example)
          try {
            this.onLocationUpdate({
              location: { lat: data.lat, lng: data.lng },
              speed: undefined, // Would come from device if available
              heading: undefined,
              timestamp: new Date()
            });
          } catch (error) {
            console.error('Error processing location update:', error);
          }
        }
      );

      // Store cleanup function for proper cleanup
      if (typeof stopLocationUpdates === 'function') {
        this.locationUnsubscriber = stopLocationUpdates;
      }
      
      console.log(`✅ Location tracking started with ${accuracy} accuracy`);
    } catch (error) {
      console.error('Error subscribing to location stream:', error);
    }
  }



  private stopLocationTracking(): void {
    // To stop receiving updates, call the function that was returned - following docs pattern
    if (this.locationUnsubscriber) {
      try {
        this.locationUnsubscriber();
        console.log('✅ Location tracking stopped');
      } catch (error) {
        console.error('Error stopping location updates:', error);
      }
      this.locationUnsubscriber = undefined;
    }
    
    // Also use the general unsubscribe method as fallback
    try {
      this.session.location.unsubscribeFromStream();
    } catch (error) {
      console.error('Error unsubscribing from location stream:', error);
    }
  }

  private startDisplayUpdateInterval(): void {
    // Stop any existing interval
    this.stopDisplayUpdateInterval();
    
    // Update display every 1 second to refresh directional arrow frequently
    // This ensures the arrow always points to destination as you change direction
    this.displayUpdateInterval = setInterval(() => {
      if (this.navigationState.sessionLocked) {
        this.updateNavigationDisplay();
      }
    }, 1000); // 1 second like running example - frequent arrow updates
    
    console.log('✅ Display update interval started (1 second frequency)');
  }

  private stopDisplayUpdateInterval(): void {
    if (this.displayUpdateInterval) {
      clearInterval(this.displayUpdateInterval);
      this.displayUpdateInterval = undefined;
      console.log('✅ Display update interval stopped');
    }
  }

  private startAiContextUpdateInterval(): void {
    // Stop any existing interval
    this.stopAiContextUpdateInterval();
    
    // Update AI context every 20 seconds
    this.aiContextInterval = setInterval(() => {
      if (this.navigationState.sessionLocked && this.navigationState.currentLocation) {
        this.updateAiContext();
      }
    }, 20000); // 20 seconds like requested
    
    console.log('✅ AI context update interval started (20 second frequency)');
  }

  private stopAiContextUpdateInterval(): void {
    if (this.aiContextInterval) {
      clearInterval(this.aiContextInterval);
      this.aiContextInterval = undefined;
      console.log('✅ AI context update interval stopped');
    }
  }

  private async updateAiContext(): Promise<void> {
    if (!this.navigationState.currentLocation) {
      return;
    }

    try {
      console.log('🤖 Updating AI context...');
      
      // Fetch street view image
      const imagePath = await this.streetViewService.fetchStreetViewImage(
        this.navigationState.currentLocation
      );
      
      if (imagePath) {
        // Detect store signs with Roboflow first
        const storeSignDetection = await this.geminiService.detectStoreSigns(
          imagePath,
          this.navigationState.currentLocation
        );
        
        this.currentStoreSignDetection = storeSignDetection;
        console.log('✅ Store sign detection updated:', storeSignDetection);

        // Analyze with Gemini AI (passing store sign detection results)
        const analysis = await this.geminiService.analyzeStreetViewImage(
          imagePath,
          this.navigationState.currentLocation,
          storeSignDetection
        );
        
        this.currentAiContext = analysis;
        console.log('✅ AI context updated:', analysis);
        
        // Update display immediately
        this.updateNavigationDisplay();
      } else {
        this.currentAiContext = this.geminiService.getFallbackDescription(this.navigationState.currentLocation);
        this.currentStoreSignDetection = {
          detected: false,
          confidence: 0,
          count: 0,
          details: 'No image available'
        };
      }
      
    } catch (error) {
      console.error('Error updating AI context:', error);
      this.currentAiContext = 'AI context unavailable';
      this.currentStoreSignDetection = {
        detected: false,
        confidence: 0,
        count: 0,
        details: 'Detection error'
      };
    }
  }

  private processLocationUpdate(update: NavigationUpdate): void {
    if (!this.navigationState.currentRoute || !update.location) {
      console.log('🔍 Location update skipped - no route or location');
      return;
    }

    console.log('🔍 Processing location update for navigation...');

    // Check if we've reached the destination
    const distanceToDestination = calculateDistance(
      update.location,
      this.navigationState.currentRoute.endLocation
    );

    console.log(`🔍 Distance to destination: ${distanceToDestination.toFixed(2)}m (threshold: ${NavigationManager.DESTINATION_THRESHOLD}m)`);

    if (distanceToDestination <= NavigationManager.DESTINATION_THRESHOLD) {
      console.log('🎯 Destination reached! Stopping navigation...');
      this.handleDestinationReached();
      return;
    }

    // Update route progress
    this.updateRouteProgress(update.location);

    // Check for off-route condition
    this.checkOffRoute(update.location);

    // Update current instruction
    this.updateCurrentInstruction(update.location);

    // Update display
    this.updateNavigationDisplay();

    // Generate voice announcements
    this.handleVoiceAnnouncements(update.location);
  }

  private updateCurrentInstruction(location: Coordinates): void {
    if (this.currentInstructionIndex >= this.instructions.length) {
      console.log('🔍 No more instructions to process');
      return;
    }

    const currentInstruction = this.instructions[this.currentInstructionIndex];
    
    console.log(`🔍 Current instruction ${this.currentInstructionIndex + 1}/${this.instructions.length}:`, {
      instruction: currentInstruction.instruction,
      distance: currentInstruction.distance,
      isDestination: currentInstruction.isDestination
    });
    
    // Simplified advancement logic - advance after traveling some distance or time
    // In a real implementation, this would be based on route geometry
    if (currentInstruction && !currentInstruction.isDestination) {
      // For now, advance instructions every 30 seconds or when very close to destination
      const timeSinceStart = Date.now() - (this.lastLocationUpdate?.getTime() || Date.now());
      const shouldAdvance = this.currentInstructionIndex < this.instructions.length - 2 && 
                           Math.random() < 0.1; // 10% chance each update for demo purposes
      
      if (shouldAdvance) {
        console.log(`🔍 Advancing to next instruction: ${this.currentInstructionIndex + 1} -> ${this.currentInstructionIndex + 2}`);
        
        this.currentInstructionIndex++;
        this.lastAnnouncedDistance = -1; // Reset for next instruction
        
        // Update step index for progress display
        this.navigationState.currentStepIndex = this.currentInstructionIndex + 1;
        
        if (this.currentInstructionIndex < this.instructions.length) {
          this.emitEvent('instruction_updated', {
            instruction: this.instructions[this.currentInstructionIndex],
            stepIndex: this.navigationState.currentStepIndex,
            totalSteps: this.navigationState.totalSteps
          });
        }
      }
    }

    // Update navigation state
    this.navigationState.currentInstruction = this.instructions[this.currentInstructionIndex];
    this.navigationState.nextInstruction = this.instructions[this.currentInstructionIndex + 1];
  }

  private checkOffRoute(location: Coordinates): void {
    // Simplified off-route detection
    // In a real implementation, this would check against the route polyline
    if (!this.navigationState.currentRoute) return;

    const distanceToRoute = this.calculateDistanceToRoute(location);
    
    if (distanceToRoute > NavigationManager.ROUTE_DEVIATION_THRESHOLD) {
      this.offRouteCheckCount++;
      
      if (this.offRouteCheckCount >= NavigationManager.MAX_OFF_ROUTE_CHECKS) {
        this.handleOffRoute(location);
      }
    } else {
      this.offRouteCheckCount = 0;
      if (this.navigationState.isOffRoute) {
        this.navigationState.isOffRoute = false;
        this.showMessage('Back on route');
      }
    }
  }

  private handleOffRoute(location: Coordinates): void {
    if (this.navigationState.isOffRoute) return;

    this.navigationState.isOffRoute = true;
    this.showMessage('Off route - recalculating...');
    
    if (this.settings.voice_guidance) {
      this.speakText('Recalculating route');
    }

    this.emitEvent('off_route_detected', { location });
    this.recalculateRoute(location);
  }

  private async recalculateRoute(currentLocation: Coordinates): Promise<void> {
    if (!this.navigationState.currentRoute) return;

    try {
      const newRoute = await this.mappingService.calculateRoute({
        origin: currentLocation,
        destination: this.navigationState.currentRoute.endLocation,
        mode: this.settings.transportation_mode,
        avoid: this.getAvoidancePreferences(),
        units: this.settings.distance_units
      });

      if (newRoute) {
        this.navigationState.currentRoute = newRoute;
        this.navigationState.isOffRoute = false;
        this.instructions = this.mappingService.generateInstructions(newRoute);
        this.currentInstructionIndex = 0;
        this.offRouteCheckCount = 0;
        
        this.showMessage('Route recalculated');
        this.emitEvent('route_recalculated', { route: newRoute });
      }
    } catch (error) {
      console.error('Error recalculating route:', error);
      this.showMessage('Unable to recalculate route');
    }
  }

  private handleDestinationReached(): void {
    this.navigationState.isNavigating = false;
    this.navigationState.sessionLocked = true; // Keep session locked after reaching destination
    
    // Switch to reduced accuracy but keep location tracking for arrow updates
    console.log('🔄 Switching to reduced accuracy location tracking after destination reached');
    this.stopLocationTracking();
    
    // Keep AI context updates running to show surroundings at destination
    // No need to stop AI context interval - it will continue providing context
    
    // Start basic location tracking to keep arrow pointing correctly (in case they move away)
    setTimeout(() => {
      this.startLocationTracking();
    }, 100);
    
    // Update display to show final state
    this.updateNavigationDisplay();
    
    this.showMessage('🎯 You have arrived at your destination!\n\nSay "restart session" to start a new route');
    
    if (this.settings.voice_guidance) {
      this.speakText('You have arrived at your destination. Say restart session to start a new route.');
    }

    this.emitEvent('destination_reached', {});
  }

  private updateNavigationDisplay(): void {
    // Show display if we have current instruction and session is locked (navigating or stopped)
    if (!this.navigationState.currentInstruction || !this.navigationState.sessionLocked) {
      console.log('🔍 Display update skipped - no instruction or session not locked');
      return;
    }

    const instruction = this.navigationState.currentInstruction;
    const currentStep = this.navigationState.currentStepIndex || 1;
    const totalSteps = this.navigationState.totalSteps || 1;
    
    console.log('🔍 Updating display:', {
      currentStep: `${currentStep}/${totalSteps}`,
      instruction: instruction.instruction,
      distance: instruction.distance,
      streetName: instruction.streetName,
      isNavigating: this.navigationState.isNavigating,
      sessionLocked: this.navigationState.sessionLocked,
      hasCurrentLocation: !!this.navigationState.currentLocation,
      hasDestination: !!this.navigationState.currentRoute?.endLocation,
      storeSignDetected: this.currentStoreSignDetection.detected
    });
    
    // Format main instruction with step progress - enhanced format
    let mainText = '';
    if (instruction.streetName) {
      mainText = `${instruction.instruction} on ${instruction.streetName}`;
    } else {
      mainText = instruction.instruction;
    }
    
    // Add distance information for better context
    const distanceText = formatDistance(instruction.distance, this.settings.distance_units);
    const instructionWithProgress = `${mainText} for ${distanceText} (${currentStep}/${totalSteps})`;
    
    // Calculate directional arrow to destination (this updates as you face different directions)
    // The arrow ALWAYS points toward the final destination, regardless of current step
    let arrow = '?';
    if (this.navigationState.currentLocation && this.navigationState.currentRoute) {
      const bearing = calculateBearing(
        this.navigationState.currentLocation,
        this.navigationState.currentRoute.endLocation
      );
      arrow = getDirectionalArrow(bearing);
      
      console.log('🔍 Directional arrow to destination:', {
        bearing: bearing.toFixed(1),
        arrow: arrow,
        currentLat: this.navigationState.currentLocation.lat.toFixed(6),
        currentLng: this.navigationState.currentLocation.lng.toFixed(6),
        destinationLat: this.navigationState.currentRoute.endLocation.lat.toFixed(6),
        destinationLng: this.navigationState.currentRoute.endLocation.lng.toFixed(6)
      });
    }
    
    // Build display with enhanced format with AI context and store sign detection
    let display = '------\n';
    display += `${instructionWithProgress}\n`;
    display += `${arrow}\n`;
    display += '------\n';
    
    // Add navigation status
    if (this.navigationState.isNavigating) {
      display += 'Navigation Session Active\n';
    } else if (this.navigationState.sessionLocked) {
      display += 'Session Locked - Say "restart session"\n';
    }
    
    display += '------\n';
    
    // Add store sign detection status
    const storeSignStatus = this.currentStoreSignDetection.detected 
      ? 'Store sign detected' 
      : 'No store sign detected';
    display += `${storeSignStatus}\n`;
    
    display += '------\n';
    display += `${this.currentAiContext}`;
    display += '\n------';
    
    // Add optional status info
    if (this.settings.show_eta && this.navigationState.currentRoute && this.navigationState.isNavigating) {
      const remainingTime = this.calculateRemainingTime();
      display += `\n\nETA: ${formatDuration(remainingTime, true)}`;
    }
    
    if (this.settings.show_distance_remaining && this.navigationState.isNavigating) {
      const remainingDistance = this.calculateRemainingDistance();
      display += ` | ${formatDistance(remainingDistance, this.settings.distance_units)} remaining`;
    }

    this.showMessage(display);
  }

  private handleVoiceAnnouncements(location: Coordinates): void {
    if (!this.settings.voice_guidance || !this.navigationState.currentInstruction) {
      return;
    }

    const instruction = this.navigationState.currentInstruction;
    const distanceToTurn = this.calculateDistanceToCurrentInstruction(location);

    // Generate voice announcement if needed
    const announcement = generateVoiceAnnouncement(
      instruction,
      distanceToTurn,
      this.settings.distance_units,
      this.settings
    );

    if (announcement && distanceToTurn !== this.lastAnnouncedDistance) {
      this.speakText(announcement);
      this.lastAnnouncedDistance = distanceToTurn;
    }

    // Generate progress announcements for long routes
    const remainingDistance = this.calculateRemainingDistance();
    const progressAnnouncement = generateProgressAnnouncement(
      remainingDistance,
      this.settings.distance_units
    );

    if (progressAnnouncement) {
      this.speakText(progressAnnouncement);
    }
  }

  private calculateRemainingDistance(): number {
    if (!this.navigationState.currentRoute || !this.navigationState.currentLocation) {
      return 0;
    }

    // Simplified calculation - would use actual route geometry in real implementation
    return calculateDistance(
      this.navigationState.currentLocation,
      this.navigationState.currentRoute.endLocation
    );
  }

  private calculateRemainingTime(): number {
    if (!this.navigationState.currentRoute) {
      return 0;
    }

    // Simplified calculation based on average speed
    const remainingDistance = this.calculateRemainingDistance();
    const averageSpeed = this.getAverageSpeed();
    
    return remainingDistance / averageSpeed; // seconds
  }

  private calculateDistanceToRoute(location: Coordinates): number {
    // Simplified - would calculate distance to nearest point on route polyline
    if (!this.navigationState.currentRoute) return 0;
    
    return calculateDistance(location, this.navigationState.currentRoute.startLocation);
  }

  private calculateDistanceToCurrentInstruction(location: Coordinates): number {
    // Simplified - would calculate distance to actual instruction point
    return 100; // placeholder
  }

  private updateRouteProgress(location: Coordinates): void {
    if (!this.navigationState.currentRoute) return;

    const totalDistance = this.navigationState.currentRoute.distance.value;
    const remainingDistance = this.calculateRemainingDistance();
    const progress = Math.max(0, Math.min(100, ((totalDistance - remainingDistance) / totalDistance) * 100));
    
    this.navigationState.routeProgress = progress;
  }

  private getLocationAccuracy(): 'realtime' | 'high' | 'tenMeters' | 'hundredMeters' | 'kilometer' | 'threeKilometers' | 'reduced' {
    // Use most basic accuracy to avoid timeouts - following docs
    // Only upgrade if basic location is confirmed working
    
    if (this.navigationState.isNavigating) {
      // For active navigation, use realtime accuracy like the running example
      // This gives us high-frequency updates for better arrow direction updates
      return 'realtime'; // High-frequency updates for navigation
    } else {
      // For general location, use lowest accuracy (this is what works!)
      return 'reduced'; // Minimal power, basic location - confirmed working
    }
  }

  private getAvoidancePreferences(): ('highways' | 'tolls' | 'ferries')[] {
    const avoid: ('highways' | 'tolls' | 'ferries')[] = [];
    
    if (this.settings.route_type === 'avoid_highways') {
      avoid.push('highways');
    }
    if (this.settings.route_type === 'avoid_tolls') {
      avoid.push('tolls');
    }
    
    return avoid;
  }

  private getAverageSpeed(): number {
    // Return average speed in m/s based on transportation mode
    switch (this.settings.transportation_mode) {
      case 'walking': return 1.4; // 5 km/h
      case 'cycling': return 5.6; // 20 km/h
      case 'driving': return 13.9; // 50 km/h
      default: return 13.9;
    }
  }

  private async geocodeAddress(address: string): Promise<Coordinates> {
    const results = await this.mappingService.geocode(address);
    if (results.length === 0) {
      throw new Error('Unable to geocode address');
    }
    return results[0].geometry.location;
  }

  private showMessage(message: string): void {
    // For navigation display, don't set timeout - let it stay visible
    if (this.navigationState.isNavigating || this.navigationState.sessionLocked) {
      this.session.layouts.showTextWall(message, {
        // No durationMs - stays visible until updated or session restarted
      });
    } else {
      // For regular messages, keep the timeout
      this.session.layouts.showTextWall(message, {
        durationMs: 5000
      });
    }
  }

  private speakText(text: string): void {
    // In a real implementation, this would use text-to-speech
    console.log(`[VOICE]: ${text}`);
    this.showMessage(`🔊 ${text}`);
  }

  private emitEvent(type: NavigationEventType, data?: any): void {
    const event: NavigationEvent = {
      type,
      timestamp: new Date(),
      data
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
} 