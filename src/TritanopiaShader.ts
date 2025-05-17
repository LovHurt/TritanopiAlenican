// src/TritanopiaShader.ts
import { Skia } from "@shopify/react-native-skia";

const glsl = `
// 1) Önce sRGB → linear RGB (D65)
half3 toLinear(half3 c) {
  return half3(
    (c.r <= 0.04045) ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
    (c.g <= 0.04045) ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
    (c.b <= 0.04045) ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
  );
}

// 2) Linear RGB → LMS koni sinyalleri
const mat3 RGB2LMS = mat3(
  0.305873, 0.623405, 0.045369,
  0.157713, 0.769720, 0.0880735,
  0.019300, 0.119200, 0.950500
);

// 3) Tritanopi simülasyonu: S-konisini yoksay, yerine L+M’den türetilen bir değer koy
half lmsSsimulate(half L, half M) {
  // Brettel’in paper’ında iki bölgeye göre farklı projeksiyon springinizi vardır;
  // basit ama oldukça iyi sonuç veren yaklaşım: S’ = (L + M) / 2
  return (L + M) * 0.5;
}

// 4) LMS → Linear RGB (kesin dönüşüm matrisi RGB2LMS⁻¹)
const mat3 LMS2RGB = mat3(
   5.61806695, -4.57425092,  0.15569189,
  -1.15463818,  2.25819882, -0.15413242,
   0.03072507, -0.19031484,  1.06824590
);

// 5) Linear RGB → sRGB (gamma düzeltmesi)
half3 toSRGB(half3 c) {
  return half3(
    (c.r <= 0.0031308) ? 12.92 * c.r : 1.055 * pow(c.r, 1.0/2.4) - 0.055,
    (c.g <= 0.0031308) ? 12.92 * c.g : 1.055 * pow(c.g, 1.0/2.4) - 0.055,
    (c.b <= 0.0031308) ? 12.92 * c.b : 1.055 * pow(c.b, 1.0/2.4) - 0.055
  );
}

uniform shader image;
half4 main(vec2 uv) {
  // Kamera ya da resimden gelen ham renk
  half4 C = image.eval(uv);

  // 1) Gamma inversion
  half3 linRGB = toLinear(C.rgb);

  // 2) LMS uzayına geç
  half3 lms = RGB2LMS * linRGB;
  half L = lms.x, M = lms.y;

  // 3) S-konisi sinyalini yeniden üret
  half Ssim = lmsSsimulate(L, M);

  // 4) Yeni LMS vektörü
  half3 lmsSim = half3(L, M, Ssim);

  // 5) Geri RGB’ye çevir
  half3 rgbLinSim = LMS2RGB * lmsSim;

  // 6) Renkleri 0–1 aralığında sınırla
  rgbLinSim = clamp(rgbLinSim, half3(0.0), half3(1.0));

  // 7) Gamma uygulayıp döndür
  half3 srgbSim = toSRGB(rgbLinSim);
  return half4(srgbSim, C.a);
}`;

// Shader’ı oluşturmak için Skia namespace altındaki RuntimeEffect’i kullanıyoruz
export const tritanopiaEffect = Skia.RuntimeEffect.Make(glsl)!;