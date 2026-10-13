const DESKTOP_SRC_SET = "/images/hero-bridge-1280-341427fde670.webp 1280w, /images/hero-bridge-1920-7db6d01a454c.webp 1920w, /images/hero-bridge-2400-1597ef593e40.webp 2400w";
const MOBILE_SRC_SET = "/images/hero-bridge-mobile-640-7b8b635f5b9a.webp 640w, /images/hero-bridge-mobile-960-3b27ab1d1db2.webp 960w";
const DESKTOP_SRC = "/images/hero-bridge-1280-341427fde670.webp";
const MOBILE_SRC = "/images/hero-bridge-mobile-640-7b8b635f5b9a.webp";
const PREVIEW = "data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAADwBACdASogABIAPu1oq08ppiOiMBgIATAdiUAXYAZ1jTkUEeDGpL2Fw7HUWGsKHwQA/tq6TctbVJRKQH1YX2Oh3zw9a2PcKO7PaYe2JCykD02P6kzDKhU1bEoGXRtY8Vb+HKJ04ni/COd3CmXGmrui7F1Wr1MIswtD0xieQAimI2foRlPocMASKk8boFvswt8oxkOyuPK2Umhp2pcmhauvwESqZTZ0KA5T3fLSqKrQAA==";

export function HeroLandscape() {
  return (
    <>
      {/* Matching preload and picture sources avoid a second request or a cold image-optimizer pass. */}
      <link rel="preload" as="image" href={MOBILE_SRC} imageSrcSet={MOBILE_SRC_SET} imageSizes="100vw" media="(max-width: 480px)" fetchPriority="high" />
      <link rel="preload" as="image" href={DESKTOP_SRC} imageSrcSet={DESKTOP_SRC_SET} imageSizes="100vw" media="(min-width: 481px)" fetchPriority="high" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(' + PREVIEW + ')' }} />
      <picture>
        <source media="(max-width: 480px)" srcSet={MOBILE_SRC_SET} sizes="100vw" />
        <img src={DESKTOP_SRC} srcSet={DESKTOP_SRC_SET} sizes="100vw" alt="Pixel-art woodland bridge over a pond with orange fish" width={2400} height={1345} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-center" />
      </picture>
    </>
  );
}
