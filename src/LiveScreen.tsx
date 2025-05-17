// src/LiveScreen.tsx
import React, { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevices,
  useSkiaFrameProcessor,
} from 'react-native-vision-camera';
import { Skia } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';
import { tritanopiaEffect } from './TritanopiaShader';

export default function LiveScreen() {
  const { width, height } = useWindowDimensions();
  const device = useCameraDevices().find(d => d.position === 'back');
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      // @ts-ignore: bazen tipler uyuşmuyor
      setHasPermission(status === 'authorized');
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
      }
    })();
  }, []);

  // Skia Frame Processor
  const frameProcessor = useSkiaFrameProcessor(frame => {
    'worklet';
    // 1) İlk önce sahneyi (frame) render et
    //    (kamera görüntüsünü kendisi çiziyor)
    // 2) Brettel tritanopi shader'ını runtime shader olarak sar
    const paint = Skia.Paint();
    const shaderBuilder = Skia.RuntimeShaderBuilder(tritanopiaEffect);
    const imageFilter = Skia.ImageFilter.MakeRuntimeShader(
      shaderBuilder,
      null,
      null
    );
    paint.setImageFilter(imageFilter);
    // 3) paint içindeki tritanopi filtresini uygula
    frame.render(paint);
  }, []);

  if (!device || !hasPermission) return null;

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive
      frameProcessor={frameProcessor}
    />
  );
}