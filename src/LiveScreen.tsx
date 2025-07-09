import React, { useEffect, useState, useMemo, useRef } from 'react'; // useRef eklendi
import {
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import RNFS from 'react-native-fs';
import {
  Camera,
  useCameraDevice,
  useSkiaFrameProcessor,
  Frame,
} from 'react-native-vision-camera';
import type { CameraDeviceFormat, Camera as VisionCamera } from 'react-native-vision-camera'; // Camera tipi eklendi
import { Skia, SkPaint, SkImageFilter, SkImage } from '@shopify/react-native-skia';
import { tritanopiaEffect } from './TritanopiaShader';
// runOnJS ve useSharedValue'ya artık bu yöntemde ihtiyacımız yok.

const TARGET_FPS = 20;
const MAX_RESOLUTION_WIDTH = 854;
const MAX_RESOLUTION_HEIGHT = 480;

export default function LiveScreen() {
  const device = useCameraDevice('back');
  const camera = useRef<VisionCamera>(null); // DEĞİŞİKLİK: Kamera referansı oluşturuldu.
  const [hasPermission, setHasPermission] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // captureNextFrameTrigger'a artık gerek yok.

  useEffect(() => {
    (async () => {
      let cameraPermission = await Camera.getCameraPermissionStatus();
      if (cameraPermission !== 'granted') {
        cameraPermission = await Camera.requestCameraPermission();
      }
      let currentHasPermission = cameraPermission === 'granted';

      if (Platform.OS === 'android') {
        // Android 13 (API 33) ve üzeri için WRITE_EXTERNAL_STORAGE izni gerekmez.
        // CameraRoll bunu kendi içinde yönetir.
        if (Platform.Version < 33) {
            const writePermissionResult = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
              { title: 'Galeriye Yazma İzni', message: 'Çekilen fotoğrafları kaydetmek için izin verin.', buttonPositive: 'Tamam'}
            );
            currentHasPermission = currentHasPermission && writePermissionResult === PermissionsAndroid.RESULTS.GRANTED;
        }
      }
      setHasPermission(currentHasPermission);
    })();
  }, []);

  const tritanopiaPaint = useMemo<SkPaint>(() => {
    const p = Skia.Paint();
    const builder = Skia.RuntimeShaderBuilder(tritanopiaEffect);
    const filter: SkImageFilter = Skia.ImageFilter.MakeRuntimeShader(builder, null, null);
    p.setImageFilter(filter);
    return p;
  }, []);

  const format = useMemo(() => {
    // Bu format seçme mantığı canlı önizleme için harika, aynen kalabilir.
    if (!device) return undefined;
    const candidates = device.formats.filter((f) => {
      const videoW = f.videoWidth ?? f.photoWidth;
      const videoH = f.videoHeight ?? f.photoHeight;
      const resOK = videoW <= MAX_RESOLUTION_WIDTH && videoH <= MAX_RESOLUTION_HEIGHT;
      const fpsOK = ((f as any).minFps ?? 0) <= TARGET_FPS && ((f as any).maxFps ?? 0) >= TARGET_FPS;
      return resOK && fpsOK;
    });

    if (candidates.length > 0) {
        candidates.sort((a,b) => (b.videoWidth*b.videoHeight) - (a.videoWidth*a.videoHeight));
        return candidates[0];
    }
    
    // Fallback logic
    return device.formats.sort((a, b) => b.photoWidth - a.photoWidth)[0];

  }, [device]);

  // DEĞİŞİKLİK: Frame processor artık sadece canlı önizlemeyi filtrelemek için kullanılıyor.
  // Fotoğraf kaydetme mantığı buradan çıkarıldı.
  const frameProcessor = useSkiaFrameProcessor((frame: Frame) => {
    'worklet';
    // @ts-ignore
    frame.render(tritanopiaPaint);
  }, [tritanopiaPaint]);

  const onCapturePhoto = async () => {
    if (isProcessingPhoto || !camera.current) return;
    
    console.log("Fotoğraf çekme işlemi başlatılıyor...");
    setIsProcessingPhoto(true);

    try {
      const photo = await camera.current.takePhoto({
        enableShutterSound: true,
      });
      console.log(`Fotoğraf çekildi: ${photo.path}`);

      // RNFS'in doğru çalışması için path'in başındaki 'file://' ifadesini kaldırıyoruz.
      const correctPath = photo.path.replace('file://', '');

      // Değiştirilmiş path'i kullanarak dosyayı oku.
      const imageBase64 = await RNFS.readFile(correctPath, 'base64');
      
      const skImage = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(imageBase64));
      if (!skImage) {
        throw new Error('Skia görseli oluşturulamadı.');
      }
      console.log(`Skia görseli oluşturuldu: ${skImage.width()}x${skImage.height()}`);
      
      const surface = Skia.Surface.MakeOffscreen(skImage.width(), skImage.height());
      if (!surface) {
        throw new Error('Skia yüzeyi oluşturulamadı.');
      }
      const canvas = surface.getCanvas();
      canvas.drawImage(skImage, 0, 0, tritanopiaPaint);
      console.log("Filtre uygulandı.");

      const processedImage = surface.makeImageSnapshot();
      const processedBase64 = processedImage.encodeToBase64();
      console.log("Filtrelenmiş görsel base64'e çevrildi.");

      // CameraRoll doğrudan 'file://' ile başlayan yolu tercih edebilir, bu yüzden orjinalini kullanmak daha güvenli.
      const tempPathForSave = `${RNFS.CachesDirectoryPath}/filtered_${Date.now()}.png`;
      await RNFS.writeFile(tempPathForSave, processedBase64, 'base64');
      await CameraRoll.save(`file://${tempPathForSave}`, { type: 'photo' });

      console.log("Fotoğraf galeriye başarıyla kaydedildi!");
      Alert.alert('Başarılı', 'Filtrelenmiş fotoğraf galeriye kaydedildi.');

      skImage.dispose();
      processedImage.dispose();
      surface.dispose();

    } catch (e: any) {
      console.error("Fotoğraf çekme/işleme hatası:", e);
      Alert.alert('Hata', `Bir sorun oluştu: ${e.message}`);
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.centeredMessageContainer}>
        <Text style={styles.messageText}>İzinler bekleniyor veya verilmedi…</Text>
        <ActivityIndicator size="large" color="white" style={{marginTop: 20}}/>
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={camera} 
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={TARGET_FPS}
        isActive={true}
        photo={true} 
        frameProcessor={frameProcessor}
        pixelFormat='yuv' 
      />
      
      {isProcessingPhoto && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="white" />
          <Text style={styles.loadingText}>Fotoğraf işleniyor...</Text> 
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.captureButton, isProcessingPhoto && styles.captureButtonDisabled]} 
          onPress={onCapturePhoto} 
          disabled={isProcessingPhoto}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredMessageContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  messageText: { color: 'white', fontSize: 18, textAlign: 'center', paddingHorizontal: 20 },
  buttonContainer: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'white', borderWidth: 5, borderColor: 'rgba(0,0,0,0.2)'},
  captureButtonDisabled: {
    backgroundColor: 'grey',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  }
});