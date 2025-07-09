// src/TritanopiaShader.ts
import { Skia } from "@shopify/react-native-skia";

const glsl = `
// -----------------------------------------------------------------------------
// 1. ADIM: Gamma Düzeltme Fonksiyonları
// Renkleri matematiksel işlemler için doğru olan "linear" uzaya çevirir.
// -----------------------------------------------------------------------------
half3 toLinear(half3 c) {
  return half3(
    (c.r <= 0.04045) ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
    (c.g <= 0.04045) ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
    (c.b <= 0.04045) ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
  );
}

// İşlem bitince renkleri ekranda doğru görünmesi için "sRGB" uzayına geri çevirir.
half3 toSRGB(half3 c) {
  // Negatif değerleri veya 1'den büyük değerleri engellemek için clamp kullanılır.
  c = clamp(c, 0.0, 1.0);
  return half3(
    (c.r <= 0.0031308) ? 12.92 * c.r : 1.055 * pow(c.r, 1.0/2.4) - 0.055,
    (c.g <= 0.0031308) ? 12.92 * c.g : 1.055 * pow(c.g, 1.0/2.4) - 0.055,
    (c.b <= 0.0031308) ? 12.92 * c.b : 1.055 * pow(c.b, 1.0/2.4) - 0.055
  );
}

// -----------------------------------------------------------------------------
// 2. ADIM: Tritanopi Simülasyon Matrisi
// Bu matris, linear RGB uzayında tritanopi etkisini simüle etmek için tasarlanmıştır.
// Mavi (B) bilgisini, Kırmızı (R) ve Yeşil (G) bilgilerinin bir karışımıyla değiştirir.
// Kaynak: "Digital Video Colour" by Giorgianni and Madden
// -----------------------------------------------------------------------------
const mat3 TRITAN_MATRIX = mat3(
  1.0,  0.152, -0.152,
  0.0,  0.865,  0.135,
  0.0,  0.865,  0.135
);


// -----------------------------------------------------------------------------
// ANA FONKSİYON
// -----------------------------------------------------------------------------
uniform shader image;

half4 main(vec2 pos) {
  // Kamera veya resimden gelen orijinal rengi al (sRGB formatında).
  half4 originalColor = image.eval(pos);
  
  // 1. Rengi linear uzaya çevir.
  half3 linearRGB = toLinear(originalColor.rgb);
  
  // 2. Linear renk üzerinde simülasyon matrisini uygula.
  // Not: Skia'da (ve GLSL'de) matris çarpımı vector * matrix sırasındadır.
  half3 simulatedLinearRGB = linearRGB * TRITAN_MATRIX;
  
  // 3. Simüle edilmiş rengi ekranda gösterim için sRGB uzayına geri çevir.
  half3 finalSRGB = toSRGB(simulatedLinearRGB);
  
  // 4. Orijinal alfa (şeffaflık) değeriyle birlikte nihai rengi döndür.
  return half4(finalSRGB, originalColor.a);
}
`;

export const tritanopiaEffect = Skia.RuntimeEffect.Make(glsl)!;