Audit the offline pipeline and assets: `tools/**` (models, people, posters, river, tex, trail),
`package.json`, `vite.config.*`, `tsconfig.json`, and `public/` *listing only* (use ls/find to
see file names and sizes — don't read binaries). Find: dead tools, generators that must be run
in a specific order (document it), assets in public/ that nothing references (grep src/ for the
filenames), oversized textures/GLBs for phones (suggest target sizes/formats, e.g. KTX2/basis
or smaller PNG/JPEG/webp), missing npm scripts (propose `scripts` entries: gen:all, check,
test), and load-time issues (what's fetched at startup, could anything be lazy-loaded or
compressed). Report total bytes the first load downloads, estimated from public/ files that
src/ references.
