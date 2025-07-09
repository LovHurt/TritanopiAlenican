import React, { useState, useMemo } from 'react';
import { View, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  Canvas,
  Image as SkiaImage,
  useImage,
  Skia,
  type SkPaint,
  type SkImageFilter,
} from '@shopify/react-native-skia';
import { tritanopiaEffect } from './TritanopiaShader';

export default function GalleryScreen() {
  const [uri, setUri] = useState<string | null>(null);
  const image = useImage(uri);

  const pick = () => {
    launchImageLibrary({ mediaType: 'photo' }, resp => {
      if (!resp.didCancel && resp.assets && resp.assets[0].uri) {
        setUri(resp.assets[0].uri);
      }
    });
  };

  const tritanopiaPaint = useMemo<SkPaint>(() => { 
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

  return (
    <View style={styles.container}>
      <Button title="Galeriden Foto Seç" onPress={pick} />
      
      {uri && !image && (
        <View style={[styles.image, styles.loadingContainer]}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {image && (
        <Canvas style={styles.image}>
          <SkiaImage
            image={image}
            x={0}
            y={0}
            width={800}
            height={800}
            fit="contain"
            paint={tritanopiaPaint}
          />
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 16 },
  image: { width: 800, height: 800, marginTop: 20 },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
});