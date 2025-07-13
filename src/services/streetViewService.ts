/**
 * Street View Service
 * Handles fetching photos from Google Street View Static API
 * Now includes automatic cropping to remove Google watermark
 */

import { Coordinates } from '../types/navigation.js';
import fs from 'fs';
import path from 'path';

export class StreetViewService {
  private apiKey: string;
  private imageDir: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
    this.imageDir = path.join(process.cwd(), 'images');
    
    // Ensure images directory exists
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }
    
    if (!this.apiKey) {
      console.error('GOOGLE_API_KEY environment variable is required for Street View');
    }
  }

  /**
   * Fetch a Street View image at specific coordinates and crop out Google watermark
   * @param location - The coordinates to get the street view image for
   * @param heading - The direction the camera is pointing (0-360 degrees)
   * @param pitch - The up/down angle of the camera (-90 to 90 degrees)
   * @param size - Image size in format "widthxheight"
   * @returns Promise<string> - Path to the saved image file
   */
  async fetchStreetViewImage(
    location: Coordinates,
    heading: number = 0,
    pitch: number = 0,
    size: string = '640x640'
  ): Promise<string | null> {
    try {
      if (!this.apiKey) {
        console.error('Google API key not configured');
        return null;
      }

      const params = new URLSearchParams({
        size: size,
        location: `${location.lat},${location.lng}`,
        heading: heading.toString(),
        pitch: pitch.toString(),
        key: this.apiKey,
        fov: '90' // Field of view in degrees
      });

      const url = `https://maps.googleapis.com/maps/api/streetview?${params}`;
      
      console.log(`🌍 Fetching Street View image for: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
      console.log(`📍 URL: ${url}`);

      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Street View API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Save the original image temporarily
      const tempImagePath = path.join(this.imageDir, 'temp_streetview.jpg');
      fs.writeFileSync(tempImagePath, uint8Array);
      
      // Crop the image to remove Google watermark
      const croppedImagePath = await this.cropGoogleWatermark(tempImagePath);
      
      // Clean up temporary file
      if (fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }
      
      if (croppedImagePath) {
        console.log(`✅ Street View image cropped and saved to: ${croppedImagePath}`);
        return croppedImagePath;
      } else {
        console.log(`⚠️ Image cropping failed, using original image`);
        // Fallback to original image
        const imagePath = path.join(this.imageDir, 'current_streetview.jpg');
        fs.writeFileSync(imagePath, uint8Array);
        return imagePath;
      }
      
    } catch (error) {
      console.error('Error fetching Street View image:', error);
      return null;
    }
  }

  /**
   * Crop the bottom portion of the image to remove Google watermark
   * @param imagePath - Path to the original image
   * @returns Promise<string | null> - Path to the cropped image
   */
  private async cropGoogleWatermark(imagePath: string): Promise<string | null> {
    try {
      const { createCanvas, loadImage } = await import('canvas');
      
      // Load the original image
      const originalImage = await loadImage(imagePath);
      
      // Calculate crop dimensions - remove bottom 15% to get rid of Google logo
      const cropPercentage = 0.15; // Remove 15% from bottom
      const newWidth = originalImage.width;
      const newHeight = Math.floor(originalImage.height * (1 - cropPercentage));
      
      console.log(`📐 Cropping image from ${originalImage.width}x${originalImage.height} to ${newWidth}x${newHeight}`);
      
      // Create canvas with cropped dimensions
      const canvas = createCanvas(newWidth, newHeight);
      const ctx = canvas.getContext('2d');
      
      // Draw only the top portion of the original image
      ctx.drawImage(
        originalImage,
        0, 0, originalImage.width, newHeight, // Source rectangle (top portion)
        0, 0, newWidth, newHeight              // Destination rectangle
      );
      
      // Save the cropped image
      const croppedImagePath = path.join(this.imageDir, 'current_streetview.jpg');
      const buffer = canvas.toBuffer('image/jpeg');
      fs.writeFileSync(croppedImagePath, buffer);
      
      console.log(`✅ Google watermark cropped successfully`);
      return croppedImagePath;
      
    } catch (error) {
      console.error('Error cropping Google watermark:', error);
      return null;
    }
  }

  /**
   * Get the current street view image path
   * @returns string - Path to the current image file
   */
  getCurrentImagePath(): string {
    return path.join(this.imageDir, 'current_streetview.jpg');
  }

  /**
   * Check if current image exists
   * @returns boolean - True if image exists
   */
  hasCurrentImage(): boolean {
    return fs.existsSync(this.getCurrentImagePath());
  }
} 