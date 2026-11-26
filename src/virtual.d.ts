declare module 'virtual:temple-assets' {
  const paths: string[];
  export default paths;
}

declare module 'virtual:temple-prop-sizes' {
  const sizes: Record<string, { file: string; meshes: number; vertices: number; indices: number; uvs1?: true }>;
  export default sizes;
}
