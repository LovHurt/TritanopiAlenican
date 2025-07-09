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

    const MAX_PROCESSING_DIMENSION = 1920;

    try {
      const photo = await camera.current.takePhoto({
        enableShutterSound: true,
      });
      console.log(`Yüksek çözünürlüklü fotoğraf çekildi: ${photo.path}`);

      // 1. Adım: Fotoğrafı Base64'e ÇEVİRMEDEN, doğrudan URI'den verimli bir şekilde yükle.
      // Bu, ilk çökme sorununu çözer.
      const imageUri = `file://${photo.path}`;
      const imageData = await Skia.Data.fromURI(imageUri);
      if (!imageData) {
        throw new Error('Skia, görsel verisini dosyadan yükleyemedi.');
      }
      const skImage = Skia.Image.MakeImageFromEncoded(imageData);
      if (!skImage) {
        throw new Error('Skia görseli oluşturulamadı.');
      }
      const originalWidth = skImage.width();
      const originalHeight = skImage.height();
      console.log(`Orijinal görsel Skia'ya yüklendi: ${originalWidth}x${originalHeight}`);
      
      // 2. Adım: İşlem boyutlarını hesapla (Performans optimizasyonu)
      // Orijinal en/boy oranını koruyarak görseli küçültüyoruz.
      const scale = Math.min(MAX_PROCESSING_DIMENSION / originalWidth, MAX_PROCESSING_DIMENSION / originalHeight);
      const targetWidth = Math.round(originalWidth * scale);
      const targetHeight = Math.round(originalHeight * scale);
      console.log(`İşlem için boyut küçültüldü: ${targetWidth}x${targetHeight}`);

      // 3. Adım: Küçültülmüş boyutlarda bir yüzey (tuval) oluştur.
      // Artık devasa 48MB'lık yüzeyler yerine çok daha küçük bir yüzey kullanıyoruz.
      const surface = Skia.Surface.MakeOffscreen(targetWidth, targetHeight);
      if (!surface) {
        throw new Error('Skia yüzeyi oluşturulamadı.');
      }
      const canvas = surface.getCanvas();

      // 4. Adım: Büyük orijinal görseli, küçük tuvalimize çizerek yeniden boyutlandır.
      const srcRect = Skia.XYWHRect(0, 0, originalWidth, originalHeight);
      const destRect = Skia.XYWHRect(0, 0, targetWidth, targetHeight);
      canvas.drawImageRect(skImage, srcRect, destRect, tritanopiaPaint); // <-- Filtre burada uygulanıyor!
      
      console.log("Görsel yeniden boyutlandırıldı ve filtre uygulandı.");

      // 5. Adım: Filtrelenmiş ve küçültülmüş görseli kaydet.
      const processedImage = surface.makeImageSnapshot();
      const processedBase64 = processedImage.encodeToBase64(); // Sadece kaydetmek için Base64'e çevir
       if (!processedBase64) {
          throw new Error('İşlenmiş görsel Base64 formatına çevrilemedi.');
      }
      console.log("Filtrelenmiş görsel base64'e çevrildi.");

      const tempPathForSave = `${RNFS.CachesDirectoryPath}/filtered_${Date.now()}.png`;
      await RNFS.writeFile(tempPathForSave, processedBase64, 'base64');
      await CameraRoll.save(`file://${tempPathForSave}`, { type: 'photo' });

      console.log("Fotoğraf galeriye başarıyla kaydedildi!");
      Alert.alert('Başarılı', 'Filtrelenmiş fotoğraf galeriye kaydedildi.');

      // Belleği temizle!
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