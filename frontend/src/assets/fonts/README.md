# Local fonts

Latin WOFF2 assets from Google Fonts, downloaded on 2026-10-14. The original SIL Open Font License for each family is included alongside the files.

- [Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader): normal and italic, variable weights 200 to 800.
- [IBM Plex Sans](https://github.com/google/fonts/tree/main/ofl/ibmplexsans): normal, variable weight asset used for 400 to 600.
- [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono): normal, weights 400 and 500.

`next/font/local` serves these assets from the application and preserves the existing CSS font variables. Production builds do not fetch font stylesheets or binaries. Additional scripts and character sets use the system fallback fonts until matching subsets are added.
