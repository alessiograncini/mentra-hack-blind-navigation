/**
 * Gemini AI Service
 * Handles processing Street View images with Gemini AI for navigation context
 * Now includes Roboflow store sign detection with labeled image generation
 */

import fs from 'fs';
import path from 'path';
import { Coordinates } from '../types/navigation.js';

// Store Sign Detection Interface
export interface StoreSignDetection {
  detected: boolean;
  confidence: number;
  count: number;
  details?: string;
}

export class GeminiService {
  private apiKey: string;
  private roboflowApiKey: string;
  private roboflowEndpoint: string;
  private imageDir: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
    this.roboflowApiKey = process.env.ROBOFLOW_API_KEY || '';
    this.roboflowEndpoint = 'https://serverless.roboflow.com/store-sign-2/1';
    this.imageDir = path.join(process.cwd(), 'images');
    
    // Ensure images directory exists
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }
    
    if (!this.apiKey) {
      console.error('GOOGLE_GEMINI_API_KEY environment variable is required for Gemini AI');
      console.error('Please set GOOGLE_GEMINI_API_KEY in your environment variables');
    }
    
    if (!this.roboflowApiKey) {
      console.error('ROBOFLOW_API_KEY environment variable is required for store sign detection');
      console.error('Please set ROBOFLOW_API_KEY in your environment variables');
    }
  }

  /**
   * Detect store signs in an image using Roboflow and create labeled image
   * @param imagePath - Path to the image file to analyze
   * @param location - The coordinates where the image was taken
   * @returns Promise<StoreSignDetection> - Detection results
   */
  async detectStoreSigns(imagePath: string, location: Coordinates): Promise<StoreSignDetection> {
    try {
      if (!this.roboflowApiKey) {
        console.error('🚨 Roboflow API key is missing!');
        return {
          detected: false,
          confidence: 0,
          count: 0,
          details: 'Roboflow API not configured - missing ROBOFLOW_API_KEY'
        };
      }

      if (!fs.existsSync(imagePath)) {
        console.error('🚨 Image file not found:', imagePath);
        return {
          detected: false,
          confidence: 0,
          count: 0,
          details: 'Image file not found'
        };
      }

      // Read and convert image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log(`🏪 Analyzing image for store signs with Roboflow...`);
      console.log(`📍 Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
      console.log(`🖼️ Image size: ${imageBuffer.length} bytes`);
      console.log(`🔗 Roboflow endpoint: ${this.roboflowEndpoint}`);

      const response = await fetch(`${this.roboflowEndpoint}?api_key=${this.roboflowApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: base64Image
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🚨 Roboflow API error: ${response.status} ${response.statusText}`);
        console.error(`🚨 Response body: ${errorText}`);
        return {
          detected: false,
          confidence: 0,
          count: 0,
          details: `API error (${response.status}): ${errorText}`
        };
      }

      const data = await response.json();
      console.log('🔍 Roboflow response:', JSON.stringify(data, null, 2));

      // Process the predictions
      const predictions = data.predictions || [];
      const storeSignPredictions = predictions.filter((pred: any) => 
        pred.class === 'text' || pred.class === 'store-sign' || pred.confidence > 0.3
      );

      const detected = storeSignPredictions.length > 0;
      const maxConfidence = storeSignPredictions.length > 0 
        ? Math.max(...storeSignPredictions.map((pred: any) => pred.confidence))
        : 0;

      // Create labeled image if detections found
      if (detected) {
        await this.createLabeledImage(imagePath, predictions, data);
      }

      const result: StoreSignDetection = {
        detected,
        confidence: maxConfidence,
        count: storeSignPredictions.length,
        details: detected 
          ? `${storeSignPredictions.length} store sign(s) detected (${(maxConfidence * 100).toFixed(1)}% confidence)`
          : 'No store signs detected'
      };

      console.log(`✅ Store sign detection complete:`, result);
      return result;
      
    } catch (error) {
      console.error('🚨 Error detecting store signs with Roboflow:', error);
      return {
        detected: false,
        confidence: 0,
        count: 0,
        details: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a labeled image with detection boxes drawn on it
   * @param originalImagePath - Path to the original image
   * @param predictions - Roboflow predictions with bounding boxes
   * @param roboflowData - Full Roboflow response data
   */
  private async createLabeledImage(originalImagePath: string, predictions: any[], roboflowData: any): Promise<void> {
    try {
      const { createCanvas, loadImage } = await import('canvas');
      
      // Load the original image
      const originalImage = await loadImage(originalImagePath);
      const canvas = createCanvas(originalImage.width, originalImage.height);
      const ctx = canvas.getContext('2d');
      
      // Draw the original image
      ctx.drawImage(originalImage, 0, 0);
      
      // Draw bounding boxes for each detection
      predictions.forEach((pred: any, index: number) => {
        const { x, y, width, height, confidence, class: className } = pred;
        
        // Calculate bounding box coordinates (Roboflow uses center + width/height)
        const left = x - width / 2;
        const top = y - height / 2;
        
        // Choose color based on confidence
        const color = confidence > 0.7 ? '#00ff00' : confidence > 0.5 ? '#ffff00' : '#ff0000';
        
        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(left, top, width, height);
        
        // Draw label background
        const label = `${className} ${(confidence * 100).toFixed(1)}%`;
        ctx.font = '16px Arial';
        const labelMetrics = ctx.measureText(label);
        const labelHeight = 20;
        
        ctx.fillStyle = color;
        ctx.fillRect(left, top - labelHeight, labelMetrics.width + 10, labelHeight);
        
        // Draw label text
        ctx.fillStyle = '#000000';
        ctx.fillText(label, left + 5, top - 5);
      });
      
      // Save the labeled image
      const labeledImagePath = path.join(this.imageDir, 'roboflow_labeled_image.jpg');
      const buffer = canvas.toBuffer('image/jpeg');
      fs.writeFileSync(labeledImagePath, buffer);
      console.log(`✅ Labeled image saved to: ${labeledImagePath}`);
      
      // Also save the detection data as JSON
      const labeledDataPath = path.join(this.imageDir, 'roboflow_labeled_detections.json');
      const labelData = {
        timestamp: new Date().toISOString(),
        originalImage: originalImagePath,
        labeledImage: labeledImagePath,
        imageWidth: roboflowData.image?.width || originalImage.width,
        imageHeight: roboflowData.image?.height || originalImage.height,
        predictions: predictions.map((pred: any) => ({
          class: pred.class,
          confidence: pred.confidence,
          x: pred.x,
          y: pred.y,
          width: pred.width,
          height: pred.height,
          // Calculate bounding box coordinates
          bbox: {
            left: pred.x - pred.width / 2,
            top: pred.y - pred.height / 2,
            right: pred.x + pred.width / 2,
            bottom: pred.y + pred.height / 2
          }
        }))
      };

      fs.writeFileSync(labeledDataPath, JSON.stringify(labelData, null, 2));
      console.log(`✅ Detection data saved to: ${labeledDataPath}`);
      
      // Also create a simple text overlay file for debugging
      const debugPath = path.join(this.imageDir, 'roboflow_debug.txt');
      const debugText = `Store Sign Detection Results\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Detections: ${predictions.length}\n` +
        `Labeled Image: ${labeledImagePath}\n` +
        `Details:\n${predictions.map(p => `- ${p.class}: ${(p.confidence * 100).toFixed(1)}% at (${p.x},${p.y})`).join('\n')}`;
      
      fs.writeFileSync(debugPath, debugText);
      console.log(`✅ Debug info saved to: ${debugPath}`);
      
    } catch (error) {
      console.error('Error creating labeled image:', error);
      // Fallback to JSON only if canvas fails
      const labeledDataPath = path.join(this.imageDir, 'roboflow_labeled_detections.json');
      const labelData = {
        timestamp: new Date().toISOString(),
        originalImage: originalImagePath,
        imageWidth: roboflowData.image?.width || 640,
        imageHeight: roboflowData.image?.height || 640,
        error: 'Canvas drawing failed',
        predictions: predictions.map((pred: any) => ({
          class: pred.class,
          confidence: pred.confidence,
          x: pred.x,
          y: pred.y,
          width: pred.width,
          height: pred.height
        }))
      };

      fs.writeFileSync(labeledDataPath, JSON.stringify(labelData, null, 2));
      console.log(`✅ Fallback detection data saved to: ${labeledDataPath}`);
    }
  }

  /**
   * Analyze a Street View image with Gemini AI for navigation context
   * Now includes store sign information when detected
   * @param imagePath - Path to the image file to analyze
   * @param location - The coordinates where the image was taken
   * @param storeSignDetection - Optional store sign detection results to include in prompt
   * @returns Promise<string> - AI description of the surroundings
   */
  async analyzeStreetViewImage(
    imagePath: string, 
    location: Coordinates, 
    storeSignDetection?: StoreSignDetection
  ): Promise<string> {
    try {
      if (!this.apiKey) {
        console.error('🚨 Gemini API key is missing!');
        return 'Gemini AI not configured - missing GOOGLE_GEMINI_API_KEY';
      }

      if (!fs.existsSync(imagePath)) {
        console.error('🚨 Street View image file not found:', imagePath);
        return 'No street view image available';
      }

      // Read and convert image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log(`🤖 Analyzing Street View image with Gemini AI...`);
      console.log(`📍 Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
      console.log(`🖼️ Image size: ${imageBuffer.length} bytes`);
      console.log(`🔗 Gemini endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`);

      // Enhanced prompt that includes store sign information
      let customPrompt = `You are a navigation assistant analyzing a street view image to provide brief context about the surroundings. 

Look at this street view image and provide a concise description (2-3 sentences maximum) that would be helpful for navigation, focusing on:
- Notable landmarks, buildings, or signs
- General environment (urban, suburban, residential, commercial)
- Any distinctive features that would help with navigation`;

      // Add store sign information to prompt if detected
      if (storeSignDetection?.detected) {
        customPrompt += `\n\nIMPORTANT: Store signs have been detected in this image. Please mention that the user is in proximity of store signs and communicate this to the user prominently in your response.`;
      }

      customPrompt += `\n\nKeep the response very brief and focused on navigation-relevant information only. Do not mention the image quality or technical details.

If the image is unclear or shows no distinctive features, respond with: "Generic street view with no notable landmarks."`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: customPrompt
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Image
                  }
                }
              ]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🚨 Gemini API error: ${response.status} ${response.statusText}`);
        console.error(`🚨 Response body: ${errorText}`);
        
        // Provide more specific error messages
        if (response.status === 401) {
          return 'Gemini API authentication failed - check GOOGLE_GEMINI_API_KEY';
        } else if (response.status === 429) {
          return 'Gemini API rate limit exceeded - try again later';
        } else if (response.status === 403) {
          return 'Gemini API access forbidden - check API key permissions';
        } else {
          return `Gemini API error (${response.status}) - check API configuration`;
        }
      }

      const data = await response.json();
      console.log('🔍 Gemini response structure:', {
        candidates: data.candidates?.length || 0,
        hasContent: !!data.candidates?.[0]?.content,
        hasParts: !!data.candidates?.[0]?.content?.parts?.length
      });

      const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!analysis) {
        console.error('🚨 No analysis text found in Gemini response');
        return 'No AI analysis available - empty response';
      }

      // Clean up the response and limit length
      const cleanedAnalysis = analysis
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Limit to ~100 characters for display
      const truncatedAnalysis = cleanedAnalysis.length > 100 
        ? cleanedAnalysis.substring(0, 97) + '...'
        : cleanedAnalysis;

      console.log(`✅ Gemini AI analysis complete: ${truncatedAnalysis}`);
      return truncatedAnalysis;
      
    } catch (error) {
      console.error('🚨 Error analyzing image with Gemini AI:', error);
      return `AI analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get a fallback description when no image is available
   * @param location - The current location
   * @returns string - Fallback description
   */
  getFallbackDescription(location: Coordinates): string {
    return `Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  }
} 