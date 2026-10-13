# Hero assets

`pixel-hero-bridge.jpg` is the unchanged source (2400 × 1345).

The hero renders prebuilt WebP files at quality 80 rather than sending the source through Next.js image optimization at request time:

- Desktop: widths 1280, 1920 and 2400, original aspect ratio.
- Phones up to 480 CSS pixels wide: widths 640 and 960, centred portrait crop with aspect ratio 900:1345. This keeps the scene at the same visual scale when the hero uses cover sizing.
- Inline preview: source resized to 32 pixels wide, quality 40 (196 bytes before base64 encoding).

The files were encoded using Sharp 0.35.5, WebP effort 6. Each filename ends with the first 12 hexadecimal characters of its SHA-256 content hash. When replacing or re-encoding an asset, regenerate its hash and update `HeroLandscape.tsx` so immutable caches never serve an outdated scene.

The original JPEG remains available for future art changes. It is not requested by the hero. Matching responsive preloads select the same asset as the picture element; they should never download both phone and desktop sources.
