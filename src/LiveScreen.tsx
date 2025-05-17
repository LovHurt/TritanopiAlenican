import React, {useEffect, useState} from 'react';
import {
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,            // ← singular, from vision-camera
  useSkiaFrameProcessor,
} from 'react-native-vision-camera';
import {Skia} from '@shopify/react-native-skia';
import {useWindowDimensions} from 'react-native';
import {tritanopiaEffect} from './TritanopiaShader';

export default function LiveScreen() {
  const {width, height} = useWindowDimensions();
  const device           = useCameraDevice('back');      // ← one CameraDevice | null
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    (async () => {
      // 1) Vision-Camera permission
      const status = await Camera.getCameraPermissionStatus();
      setHasPermission(status === 'granted');

      // 2) Android runtime permission
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Kamera İzni',
            message: 'Canlı filtre için kameraya izin verin',
            buttonPositive: 'Tamam',
          }
        );
        setHasPermission(prev => prev || result === PermissionsAndroid.RESULTS.GRANTED);
      }
    })();
  }, []);

  // 3) Skia frame processor (unchanged)
  const frameProcessor = useSkiaFrameProcessor(frame => {
    'worklet';
    const paint         = Skia.Paint();
    const shaderBuilder = Skia.RuntimeShaderBuilder(tritanopiaEffect);
    const imageFilter   =
      Skia.ImageFilter.MakeRuntimeShader(shaderBuilder, null, null);
    paint.setImageFilter(imageFilter);
    frame.render(paint);
  }, []);

  // 4) While waiting for permission or device
  if (!device || !hasPermission) {
    return (
      <View style={[StyleSheet.absoluteFill, {
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
      }]}>
        <Text style={{ color: 'white', fontSize: 18, textAlign: 'center' }}>
          { !hasPermission
            ? 'Kamera izni bekleniyor…'
            : 'Arka kamera bulunamadı…' }
        </Text>
      </View>
    );
  }

  // 5) Finally render the Camera
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={true}
      frameProcessor={frameProcessor}
    />
  );
}