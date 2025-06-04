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
} from 'react-native-vision-camera';
import type { CameraDeviceFormat } from 'react-native-vision-camera';
import { Skia, SkPaint, SkImageFilter } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';
import { tritanopiaEffect } from './TritanopiaShader';

const TARGET_FPS = 25; 
const MAX_RESOLUTION_WIDTH = 854;
const MAX_RESOLUTION_HEIGHT = 480;

export default function LiveScreen() {
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice('back');
  const [hasPermission, setHasPermission] = useState(false);

  // ... (useEffect for permissions - no change)
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

  // ... (useMemo for paint - no change)
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

  const format = useMemo(() => {
    if (!device) return undefined;

    console.log('[CameraFormat] Available formats for back camera:');
    device.formats.forEach((f: CameraDeviceFormat, index: number) => {
      console.log(`[CameraFormat] [${index}] Res: ${f.videoWidth}x${f.videoHeight}, FPS: min ${'minFps' in f ? (f as any).minFps : 'n/a'} – max ${'maxFps' in f ? (f as any).maxFps : 'n/a'}, PhotoRes: ${f.photoWidth}x${f.photoHeight}`);
    });
    
    const candidates = device.formats.filter((f: CameraDeviceFormat) => {
      const videoW = f.videoWidth ?? f.photoWidth;
      const videoH = f.videoHeight ?? f.photoHeight;
      
      const resOK =
        videoW <= MAX_RESOLUTION_WIDTH && 
        videoH <= MAX_RESOLUTION_HEIGHT;

      // @ts-ignore legacy VisionCamera types 
      const fpsOK = ((f as any).minFps ?? 0) <= TARGET_FPS && ((f as any).maxFps ?? 0) >= TARGET_FPS;
      
      return resOK && fpsOK;
    });

    if (candidates.length === 0) {
      console.warn(`[CameraFormat] No candidate format found for ${TARGET_FPS} FPS and <= ${MAX_RESOLUTION_WIDTH}x${MAX_RESOLUTION_HEIGHT}. Trying fallback (any resolution supporting ${TARGET_FPS} FPS).`);
      
      let fallbackCandidates = device.formats.filter((f: CameraDeviceFormat) => {
        // @ts-ignore legacy VisionCamera types
        const fpsOK = ((f as any).minFps ?? 0) <= TARGET_FPS && ((f as any).maxFps ?? 0) >= TARGET_FPS;
        return fpsOK;
      });

      if (fallbackCandidates.length > 0) {
         fallbackCandidates.sort((a, b) => {
            const aRes = ((a.videoWidth ?? a.photoWidth) * (a.videoHeight ?? a.photoHeight));
            const bRes = ((b.videoWidth ?? b.photoWidth) * (b.videoHeight ?? b.photoHeight));
            if (aRes !== bRes) return aRes - bRes; // ASCENDING resolution for safety

            const aMinFps = (a as any).minFps ?? 0;
            const aMaxFps = (a as any).maxFps ?? 0;
            const bMinFps = (b as any).minFps ?? 0;
            const bMaxFps = (b as any).maxFps ?? 0;
            const aSupportsTargetExactly = (aMinFps === TARGET_FPS && aMaxFps === TARGET_FPS);
            const bSupportsTargetExactly = (bMinFps === TARGET_FPS && bMaxFps === TARGET_FPS);
            if (aSupportsTargetExactly && !bSupportsTargetExactly) return -1;
            if (!aSupportsTargetExactly && bSupportsTargetExactly) return 1;
            return (aMaxFps ?? Infinity) - (bMaxFps ?? Infinity); 
         });
         const fallbackSelected = fallbackCandidates[0];
         console.warn(`[CameraFormat] Fallback: Selected smallest resolution format supporting ${TARGET_FPS} FPS: ${fallbackSelected.videoWidth}x${fallbackSelected.videoHeight}, FPS: ${(fallbackSelected as any).minFps}-${(fallbackSelected as any).maxFps}`);
         return fallbackSelected;
      } else {
        console.error(`[CameraFormat] Critical Fallback: No format supports ${TARGET_FPS} FPS. Using absolute device default (index 0). High risk of issues.`);
        if (device.formats.length > 0) return device.formats[0];
        return undefined;
      }
    }

    candidates.sort((a, b) => {
      const aRes = (a.videoWidth ?? a.photoWidth) * (a.videoHeight ?? a.photoHeight);
      const bRes = (b.videoWidth ?? b.photoWidth) * (b.videoHeight ?? a.photoHeight);
      if (aRes !== bRes) return bRes - aRes; // DESCENDING resolution

      const aMinFps = (a as any).minFps ?? 0;
      const aMaxFps = (a as any).maxFps ?? 0;
      const bMinFps = (b as any).minFps ?? 0;
      const bMaxFps = (b as any).maxFps ?? 0;

      const aSupportsTargetExactly = (aMinFps === TARGET_FPS && aMaxFps === TARGET_FPS);
      const bSupportsTargetExactly = (bMinFps === TARGET_FPS && bMaxFps === TARGET_FPS);
      if (aSupportsTargetExactly && !bSupportsTargetExactly) return -1;
      if (!aSupportsTargetExactly && bSupportsTargetExactly) return 1;
      
      return (aMaxFps ?? Infinity) - (bMaxFps ?? Infinity);
    });
    
    const selectedFormat = candidates[0];
    console.log(`[CameraFormat] Selected format (prioritizing quality up to ${MAX_RESOLUTION_WIDTH}x${MAX_RESOLUTION_HEIGHT}): Res: ${selectedFormat.videoWidth}x${selectedFormat.videoHeight}, FPS: ${(selectedFormat as any).minFps}-${(selectedFormat as any).maxFps}`);
    return selectedFormat;
  }, [device]);

  // ... (useSkiaFrameProcessor - no change)
  const frameProcessor = useSkiaFrameProcessor((frame) => {
    'worklet';
    try {
      if (frame.isValid) { 
         frame.render(paint);
      }
    } finally {
      if (frame.isValid) {
        // @ts-expect-error: Your comment indicates `close()` exists natively.
        frame.close?.();
      }
    }
  }, [paint]); 

  // ... (UI rendering logic - no change)
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
  if (!format) { 
    return (
      <View style={styles.centeredMessageContainer}>
        <Text style={styles.messageText}>Kamera formatı ayarlanıyor…</Text>
      </View>
    );
  }

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      format={format} 
      fps={TARGET_FPS} 
      videoStabilizationMode="off" 
      isActive={true} 
      pixelFormat="yuv" 
      enableBufferCompression={true} 
      frameProcessor={frameProcessor}
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