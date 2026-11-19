# Asset provenance

Prepared 2026-10-05 for the timu application.

## Company logos

Local SVGs were retrieved from the Simple Icons official npm package via jsDelivr, pinned to major version 16. The SVG geometry is unmodified; Meta has a cyan fill (#15a8f5) to match the supplied design. Other logo colors are controlled by application CSS.

- Library: https://github.com/simple-icons/simple-icons
- Usage: https://github.com/simple-icons/simple-icons/blob/develop/README.md
- Disclaimer: https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md
- CC0 library license does not override individual brand trademark rights or brand-specific licenses.

- META — Meta Platforms: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/meta.svg
- AAPL — Apple: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/apple.svg
- NVDA — NVIDIA: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/nvidia.svg
- MSFT — Microsoft: No available SVG in current v16 library; application uses the supplied timu fallback.
- AMZN — Amazon: No available SVG in current v16 library; application uses the supplied timu fallback.
- GOOG — Alphabet: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/google.svg
- TSLA — Tesla: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/tesla.svg
- NFLX — Netflix: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/netflix.svg
- ADBE — Adobe: No available SVG in current v16 library; application uses the supplied timu fallback.
- AMD — Advanced Micro Devices: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/amd.svg
- INTC — Intel: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/intel.svg
- ORCL — Oracle: No available SVG in current v16 library; application uses the supplied timu fallback.
- CRM — Salesforce: No available SVG in current v16 library; application uses the supplied timu fallback.
- PYPL — PayPal: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/paypal.svg
- SPOT — Spotify: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/spotify.svg
- UBER — Uber: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/uber.svg
- SHOP — Shopify: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/shopify.svg
- COIN — Coinbase: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/coinbase.svg
- DIS — The Walt Disney Company: No available SVG in current v16 library; application uses the supplied timu fallback.
- V — Visa: https://cdn.jsdelivr.net/npm/simple-icons@16/icons/visa.svg

The gradient colors in companies.json are decorative backgrounds selected for this interface, not official brand identity specifications. Each SVG is bundled locally, so no CDN request is needed at runtime.

## Retired hero image (not shipped)

Photo by Juan Pablo on Unsplash: Modern apartment building against a cloudy sky.

- Source page: https://unsplash.com/photos/modern-apartment-building-against-a-cloudy-sky-Ak7bfCimfXw
- Original image: https://images.unsplash.com/photo-1763401928750-fc670f68c21e
- License: https://unsplash.com/license
- hero.webp is a 1200 × 620 top-aligned resized/cropped WebP derivative, quality 80.

## timu and navigation

- timu.png: the user-supplied PNG copied without modification from Снимок экрана 2026-10-05 204201.png.
- home.svg, learning.svg, settings.svg: thin outline vectors from this project’s earlier approved icon work.


## Retired rotating backgrounds — 2026-10-06

The public Pinterest board https://www.pinterest.com/danilliakhovets/vibe/ was retrieved and inspected on 2026-10-06. Its title showed 45 pins; 25 images were available in the public initial page response. Four actual board images were selected after visual inspection. No unrelated photos are presented as images from this board.

The photographer name and original publication source were not exposed in the public board data. The Pinterest pin and image links are preserved below; this is provenance, not a claim of a redistribution license. These are user-requested reference images for the timu project.

- assets/hero-1.webp — Побережье под облаками
  - Pin: https://www.pinterest.com/pin/990229036826859851/
  - Asset: https://i.pinimg.com/originals/89/76/b2/8976b26fb5e22b448bde2a96912f856f.jpg
  - Author: not specified in available public board data
  - Transform: crop to landscape, resize to 1400 × 620, WebP quality 76–81; no generative alteration.
- assets/hero-2.webp — Зелёный летний пейзаж
  - Pin: https://www.pinterest.com/pin/990229036830241822/
  - Asset: https://i.pinimg.com/originals/a2/7c/99/a27c999d6679b32c7f527e0b6187e8ac.jpg
  - Author: not specified in available public board data
  - Transform: crop to landscape, resize to 1400 × 620, WebP quality 80–81; no generative alteration.
- assets/hero-3.webp — Вечер у моря
  - Pin: https://www.pinterest.com/pin/990229036829659315/
  - Asset: https://i.pinimg.com/originals/ad/22/a6/ad22a69e02ab8d63d02450df5c028d42.jpg
  - Author: not specified in available public board data
  - Transform: crop to landscape, resize to 1400 × 620, WebP quality 80–81; no generative alteration.
- assets/hero-4.webp — Тёплый свет в интерьере
  - Pin: https://www.pinterest.com/pin/990229036842353282/
  - Asset: https://i.pinimg.com/originals/08/cc/e5/08cce515faa63141432f0953e349677d.jpg
  - Author: not specified in available public board data
  - Transform: crop to landscape, resize to 1400 × 620, WebP quality 80–81; no generative alteration.

The October backgrounds were retired on 2026-11-18. The six November photos were archived with version 0.8.1. Their sources are recorded in [the November photo archive](../../BANNER-SOURCES-NOVEMBER.md).

## Home banner · version 0.8.1

The home banner renders a continuous violet liquid field with a 30-second loop. The stationary grain uses hero-grain.png. The local fallback liquid-still.webp is a frame of the same field.


## Expanded stock catalog — 2026-10-06

The expanded catalog supersedes the initial 20-company logo coverage described above. It contains 5,857 listing records (5,597 US and 260 MOEX), with 174 records mapped to 170 distinct local SVG logos. Microsoft, Amazon, Adobe, Oracle and Salesforce now use the verified historical Simple Icons 11.15.0 logos. Other mapped logos use Simple Icons 16.34.0. Remaining logos are null and use the purple timu fallback. Complete catalog scope, snapshot dates, financial directory sources and trademark notes are in ../../catalog/dataset.md; individual brand provenance is recorded in companies.json and ../../catalog/logo-mappings.json.

