import React, { useState } from 'react';
import { View, Button, Image, StyleSheet } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ColorMatrix, concatColorMatrices } from 'react-native-color-matrix-image-filters';
import { tritanopiMatrix } from './TritanopiaMatrix';

export default function GalleryScreen() {
  const [uri, setUri] = useState<string|undefined>();

  const pick = () => {
    launchImageLibrary({ mediaType: 'photo' }, resp => {
      if (resp.assets && resp.assets[0].uri) setUri(resp.assets[0].uri);
    });
  };

  return (
    <View style={styles.container}>
      <Button title="Galeriden Foto Seç" onPress={pick} />
      {uri && (
        <ColorMatrix matrix={concatColorMatrices(tritanopiMatrix)}>
             <Image source={{ uri }} style={styles.image} />
        </ColorMatrix>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 16 },
  image: { width: 300, height: 300, marginTop: 20, resizeMode: 'contain' },
});