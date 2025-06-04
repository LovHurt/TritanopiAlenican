// src/LiveScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useSkiaFrameProcessor,
  // runAtTargetFps, // We'll remove this from the processor for now
} from 'react-native-vision-camera';
import type { CameraDeviceFormat } from 'react-native-vision-camera'; // Import type for clarity
import { Skia, SkPaint, SkImageFilter } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';
import { tritanopiaEffect } from './TritanopiaShader';

// Define a target FPS. Start lower to be safe, e.g., 15 or 20.
const TARGET_FPS = 15;

export default function LiveScreen() {
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice('back');
  const [hasPermission, setHasPermission] = useState(false);

  /** ------------------------------------------------------------------
   * 1️⃣  Kamera izinleri
   * ------------------------------------------------------------------ */
  useEffect(() => {
    (async () => {
      let cameraPermission = await Camera.getCameraPermissionStatus();
      if (cameraPermission !== 'granted') {
        cameraPermission = await Camera.requestCameraPermission();
      }
      let currentHasPermission = cameraPermission === 'granted';

      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Kamera İzni',
            message: 'Canlı filtre için kameraya izin verin',
            buttonPositive: 'Tamam',
          }
        );
        currentHasPermission =
          currentHasPermission || result === PermissionsAndroid.RESULTS.GRANTED;
      }
      setHasPermission(currentHasPermission);
    })();
  }, []);

  /** ------------------------------------------------------------------
   * 2️⃣  Skia objelerini bir kez oluştur
   * ------------------------------------------------------------------ */
  const paint = useMemo<SkPaint>(() => {
    const p = Skia.Paint();
    const builder = Skia.RuntimeShaderBuilder(tritanopiaEffect);
    const filter: SkImageFilter = Skia.ImageFilter.MakeRuntimeShader(
      builder,
      null,
      null
    );
    p.setImageFilter(filter);
    return p;
  }, []);

  /** ------------------------------------------------------------------
   * 3️⃣  Küçük, TARGET_FPS’lik video formatını seç
   * ------------------------------------------------------------------ */
  const format = useMemo(() => {
    if (!device) return undefined;

    console.log('[CameraFormat] Available formats for back camera:');
    device.formats.forEach((f: CameraDeviceFormat, index: number) => {
      console.log(`[CameraFormat] [${index}] Res: ${f.videoWidth}x${f.videoHeight}, FPS: min ${'minFps' in f ? (f as any).minFps : 'n/a'} – max ${'maxFps' in f ? (f as any).maxFps : 'n/a'}, PhotoRes: ${f.photoWidth}x${f.photoHeight}`);
    });
    
    const candidates = device.formats.filter((f: CameraDeviceFormat) => {
      const resOK =
        (f.videoWidth ?? f.photoWidth) <= 1280 && // Prefer videoWidth if available
        (f.videoHeight ?? f.photoHeight) <= 720;

      const fpsOK =
        // @ts-ignore legacy VisionCamera types
        (f.minFps ?? 0) <= TARGET_FPS && (f.maxFps ?? 0) >= TARGET_FPS;
      
      return resOK && fpsOK;
    });

    if (candidates.length === 0) {
      console.warn(`[CameraFormat] No candidate format found for ${TARGET_FPS} FPS and <= 720p. Using device default format (index 0). This might be high resolution/FPS.`);
      return device.formats[0]; // Fallback, could be problematic
    }

    // Sort by resolution (ascending), then by how well it matches TARGET_FPS
    candidates.sort((a, b) => {
      const aRes = (a.videoWidth ?? a.photoWidth) * (a.videoHeight ?? a.photoHeight);
      const bRes = (b.videoWidth ?? b.photoWidth) * (b.videoHeight ?? b.photoHeight);
      if (aRes !== bRes) return aRes - bRes;

      // Prioritize formats that can hit TARGET_FPS exactly or narrowly
      const aSupportsTargetExactly = (a.minFps === TARGET_FPS && a.maxFps === TARGET_FPS);
      const bSupportsTargetExactly = (b.minFps === TARGET_FPS && b.maxFps === TARGET_FPS);
      if (aSupportsTargetExactly && !bSupportsTargetExactly) return -1;
      if (!aSupportsTargetExactly && bSupportsTargetExactly) return 1;
      
      return 0; // Or further sort by smallest max FPS if desired
    });
    
    const selectedFormat = candidates[0];
    console.log(`[CameraFormat] Selected format: Res: ${selectedFormat.videoWidth}x${selectedFormat.videoHeight}, FPS: ${selectedFormat.minFps}-${selectedFormat.maxFps}`);
    return selectedFormat;
  }, [device]);

  /** ------------------------------------------------------------------
   * 4️⃣  Frame Processor
   * ------------------------------------------------------------------ */
  const frameProcessor = useSkiaFrameProcessor((frame) => {
    'worklet';
    // The `frame` object here is the one that needs to be managed.
    // We will render every frame the camera provides at TARGET_FPS.
    // `frame.close()` MUST be called for every frame if not handled automatically
    // by the Skia plugin in your Vision Camera version. Given the OOM,
    // it's safer to ensure it's called.
    try {
      if (frame.isValid) { // Check if frame is still valid before rendering
         frame.render(paint);
      }
    } finally {
      // ALWAYS close the frame.
      if (frame.isValid) {
        // @ts-expect-error: Your comment indicates `close()` exists natively.
        // If using VCv3 + Skia plugin, this might eventually be removed if auto-close is confirmed working.
        frame.close?.();
      }
    }
  }, [paint]); // Dependencies: only 'paint' as it's stable.

  /** ------------------------------------------------------------------
   * 5️⃣  İzin / cihaz kontrolü
   * ------------------------------------------------------------------ */
  if (!hasPermission) {
    return (
      <View style={styles.centeredMessageContainer}>
        <Text style={styles.messageText}>Kamera izni bekleniyor…</Text>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.centeredMessageContainer}>
        <Text style={styles.messageText}>Arka kamera bulunamadı…</Text>
      </View>
    );
  }
  if (!format) { // Wait for format to be calculated
    return (
      <View style={styles.centeredMessageContainer}>
        <Text style={styles.messageText}>Kamera formatı ayarlanıyor…</Text>
      </View>
    );
  }

  /** ------------------------------------------------------------------
   * 6️⃣  Nihai render
   * ------------------------------------------------------------------ */
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      format={format} // Use the carefully selected format
      fps={TARGET_FPS} // Set the camera's FPS to our target
      videoStabilizationMode="off" // Good for performance
      isActive={true} // Ensure camera is active
      pixelFormat="yuv" // Generally efficient
      enableBufferCompression={true} // Good for performance
      frameProcessor={frameProcessor}
      // Consider adding onError prop to Camera for more diagnostics
      // onError={(error) => console.error("Camera Error:", error)}
    />
  );
}

const styles = StyleSheet.create({
  centeredMessageContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});